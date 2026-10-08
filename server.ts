import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { validateTargetUrl, safeFetch } from './src/services/urlValidator.js';
import { sanitizeCredentials, sanitizeErrorMessage } from './src/services/sanitizer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

type StreamTicket = { url: string; expiresAt: number };
const streamTickets = new Map<string, StreamTicket>();
const STREAM_TICKET_TTL_MS = 10 * 60 * 1000;
const MAX_STREAM_TICKETS = 5000;

function createStreamTicket(url: string): string {
  cleanupStreamTickets();

  // Bound the in-memory ticket store so malformed or very large manifests cannot
  // grow it indefinitely. Evict the oldest entries first when the cap is reached.
  while (streamTickets.size >= MAX_STREAM_TICKETS) {
    const oldestId = streamTickets.keys().next().value as string | undefined;
    if (!oldestId) break;
    streamTickets.delete(oldestId);
  }

  const id = crypto.randomUUID();
  streamTickets.set(id, { url, expiresAt: Date.now() + STREAM_TICKET_TTL_MS });
  return id;
}

function getStreamTicket(id: string): string | null {
  const ticket = streamTickets.get(id);
  if (!ticket) return null;
  if (Date.now() > ticket.expiresAt) {
    streamTickets.delete(id);
    return null;
  }

  // Sliding expiry keeps an actively used live/HLS ticket valid while still
  // expiring abandoned tickets shortly after playback stops.
  ticket.expiresAt = Date.now() + STREAM_TICKET_TTL_MS;
  return ticket.url;
}

function cleanupStreamTickets(): void {
  const now = Date.now();
  for (const [id, ticket] of streamTickets.entries()) {
    if (now > ticket.expiresAt) streamTickets.delete(id);
  }
}

setInterval(cleanupStreamTickets, 5 * 60 * 1000).unref();

app.use(express.json({ limit: '10mb' }));

// Restrict cross-origin API access in production. Same-origin requests do not need CORS.
// Extra production origins may be supplied as a comma-separated CORS_ALLOWED_ORIGINS value.
const isProduction = process.env.NODE_ENV === 'production';
const configuredOrigins = (process.env.CORS_ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

function isAllowedOrigin(origin: string): boolean {
  if (configuredOrigins.includes(origin)) return true;

  if (!isProduction) {
    try {
      const parsed = new URL(origin);
      return (
        (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
        (parsed.hostname === 'localhost' ||
          parsed.hostname === '127.0.0.1' ||
          parsed.hostname === '::1')
      );
    } catch {
      return false;
    }
  }

  return false;
}

app.use('/api', (req, res, next) => {
  const origin = req.headers.origin;

  if (origin) {
    // Browser POST/fetch requests can include an Origin header even when they
    // are same-origin. Production previously treated every Origin header as
    // cross-origin unless it appeared in CORS_ALLOWED_ORIGINS, which could
    // block Get Smart's own stream-ticket requests on Cloud Run.
    let isSameOrigin = false;
    try {
      const parsedOrigin = new URL(origin);
      const forwardedHost = (req.headers['x-forwarded-host'] as string | undefined)?.split(',')[0]?.trim();
      const requestHost = forwardedHost || req.headers.host || '';
      const forwardedProto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim();
      const requestProto = forwardedProto || req.protocol;
      isSameOrigin =
        parsedOrigin.host.toLowerCase() === requestHost.toLowerCase() &&
        parsedOrigin.protocol.replace(':', '') === requestProto;
    } catch {
      isSameOrigin = false;
    }

    if (!isSameOrigin && !isAllowedOrigin(origin)) {
      return res.status(403).json({ error: 'Cross-origin API request is not allowed.' });
    }

    // CORS headers are only needed for an explicitly allowed cross-origin caller.
    if (!isSameOrigin) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Vary', 'Origin');
    }
  }

  res.header('Access-Control-Allow-Methods', 'GET, POST, HEAD, OPTIONS');
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Target-Mac, X-Target-Token, Range'
  );

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Classify network and system error types safely
function classifyNetworkError(err: Error): { type: string; message: string } {
  const msg = err.message || '';
  if (msg.includes('SSRF Security check failed') || msg.includes('blocked internal') || msg.includes('Disallowed URL')) {
    return { type: 'RESTRICTED_HOST', message: sanitizeErrorMessage(msg) };
  }
  if (msg.includes('ENOTFOUND') || msg.includes('EAI_AGAIN') || msg.includes('getaddrinfo') || msg.includes('DNS resolution failed')) {
    return { type: 'DNS_FAILURE', message: 'DNS resolution failed. Server domain does not exist or is unreachable.' };
  }
  if (msg.includes('ECONNREFUSED')) {
    return { type: 'SERVER_UNREACHABLE', message: 'Connection refused. Server port is closed or service is offline.' };
  }
  if (msg.includes('ETIMEDOUT') || msg.includes('aborted') || err.name === 'AbortError') {
    return { type: 'SERVER_UNREACHABLE', message: 'Connection timed out. Server is not responding.' };
  }
  if (msg.includes('CERT_') || msg.includes('DEPTH_ZERO_SELF_SIGNED') || msg.includes('SSL') || msg.includes('TLS')) {
    return { type: 'HTTP_HTTPS_ISSUE', message: 'SSL/TLS certificate verification failed. Check HTTPS/HTTP protocol and port.' };
  }
  if (msg.includes('Too many redirects') || msg.includes('ERR_TOO_MANY_REDIRECTS')) {
    return { type: 'REDIRECT_PROBLEM', message: 'Too many HTTP redirects encountered from provider server.' };
  }
  return { type: 'SERVER_UNREACHABLE', message: 'Failed to establish connection to IPTV server.' };
}

/**
 * Diagnostic Probe Endpoint for Connection Testing
 * Accepts target URL and credentials via POST body or headers (fallback to query)
 * Hardened with SSRF validation, redirect checks, and response limits (max 512KB).
 */
app.all('/api/xtream/probe', async (req: Request, res: Response) => {
  const targetUrl = (req.body?.url as string) || (req.query.url as string);
  if (!targetUrl) {
    return res.status(400).json({ ok: false, errorType: 'BAD_REQUEST', errorMessage: 'Missing target url parameter' });
  }

  try {
    const customUserAgent =
      (req.body?.user_agent as string) ||
      (req.query.user_agent as string) ||
      'GetSmartMediaPlayer/2.0 (Linux; Android 12; OTT Player)';

    const mac = (req.body?.mac as string) || (req.headers['x-target-mac'] as string) || (req.query.mac as string);
    const token = (req.body?.token as string) || (req.headers['x-target-token'] as string) || (req.query.token as string);

    const probeHeaders: Record<string, string> = {
      'User-Agent': customUserAgent,
      'Accept': '*/*',
    };

    if (mac) {
      probeHeaders['Cookie'] = `mac=${encodeURIComponent(mac)}; stb_lang=en; timezone=Europe/London;`;
      probeHeaders['X-User-Agent'] = 'Model: MAG250; Link: Ethernet';
    }
    if (token) {
      probeHeaders['Authorization'] = `Bearer ${token}`;
    }

    const startTime = Date.now();

    // safeFetch handles SSRF validation, DNS check, redirects, redirect limits, and timeouts
    const probeResponse = await safeFetch(targetUrl, {
      method: req.method === 'HEAD' ? 'HEAD' : 'GET',
      headers: probeHeaders,
      timeoutMs: 10000,
      maxRedirects: 5,
      maxResponseBytes: 512 * 1024, // 512KB limit for probe
    });

    const latencyMs = Date.now() - startTime;
    const contentType = probeResponse.headers.get('content-type') || '';
    const contentLength = probeResponse.headers.get('content-length') || null;

    let responseSnippet = '';
    try {
      if (probeResponse.ok && !contentType.startsWith('video/') && !contentType.startsWith('audio/')) {
        const text = await probeResponse.text();
        responseSnippet = text.slice(0, 1000);
      }
    } catch {
      // Ignore text read error
    }

    return res.json({
      ok: probeResponse.ok,
      status: probeResponse.status,
      statusText: probeResponse.statusText,
      contentType,
      contentLength,
      latencyMs,
      snippet: responseSnippet,
    });
  } catch (err: unknown) {
    const error = err as Error;
    const classified = classifyNetworkError(error);
    return res.status(classified.type === 'RESTRICTED_HOST' ? 403 : 502).json({
      ok: false,
      errorType: classified.type,
      errorMessage: classified.message,
    });
  }
});

/**
 * Xtream Codes & Stalker / MAG API Proxy to bypass CORS and Mixed Content issues.
 * Accepts credentials and upstream parameters via POST body or headers.
 * SSRF protected with redirect checking and safe error logging.
 */
// Safe diagnostic probe used by connectionDiagnostics. It never returns the
// upstream body, so Xtream credentials contained in the target URL are not
// reflected back to the browser or logs.


app.all('/api/xtream/proxy', async (req: Request, res: Response) => {
  const targetUrl = (req.body?.url as string) || (req.query.url as string);
  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing target url parameter' });
  }

  try {
    // Support credentials via POST body or headers (avoids query strings in Get Smart requests)
    const mac = (req.body?.mac as string) || (req.headers['x-target-mac'] as string) || (req.query.mac as string);
    const token = (req.body?.token as string) || (req.headers['x-target-token'] as string) || (req.query.token as string);
    const customUserAgent =
      (req.body?.user_agent as string) ||
      (req.query.user_agent as string) ||
      (mac
        ? 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG250 stbapp ver: 4 rev: 218 Mobile Safari/533.3'
        : 'GetSmartMediaPlayer/2.0 (Linux; Android 12; OTT Player)');

    const requestHeaders: Record<string, string> = {
      'User-Agent': customUserAgent,
      'Accept': '*/*',
      'Connection': 'keep-alive',
    };

    if (mac) {
      requestHeaders['Cookie'] = `mac=${encodeURIComponent(mac)}; stb_lang=en; timezone=Europe/London;`;
      requestHeaders['X-User-Agent'] = 'Model: MAG250; Link: Ethernet';
    }

    if (token) {
      requestHeaders['Authorization'] = `Bearer ${token}`;
    }

    const fetchOptions: RequestInit = {
      method: (req.body?.upstreamMethod as string) || (req.method === 'POST' && !req.body?.url ? 'POST' : 'GET'),
      headers: requestHeaders,
    };

    if (req.body?.upstreamBody) {
      requestHeaders['Content-Type'] = 'application/json';
      fetchOptions.body = JSON.stringify(req.body.upstreamBody);
    }

    const upstreamResponse = await safeFetch(targetUrl, {
      ...fetchOptions,
      timeoutMs: 25000,
      maxRedirects: 5,
    });

    if (!upstreamResponse.ok) {
      return res.status(upstreamResponse.status).json({
        error: `Upstream server returned status ${upstreamResponse.status}`,
        status: upstreamResponse.status,
      });
    }

    const contentType = upstreamResponse.headers.get('content-type') || '';
    const bodyText = await upstreamResponse.text();
    const trimmed = bodyText.trim();
    const looksHtml =
      contentType.toLowerCase().includes('text/html') ||
      /^<!doctype html/i.test(trimmed) ||
      /^<html/i.test(trimmed);

    // API consumers should always receive a JSON envelope from Get Smart on
    // non-JSON upstream responses. This prevents browser response.json() from
    // hiding whether HTML came from the provider or from our own application.
    if (looksHtml) {
      return res.status(502).json({
        error: 'Upstream Xtream endpoint returned HTML instead of JSON.',
        errorType: 'UPSTREAM_HTML_RESPONSE',
        upstreamStatus: upstreamResponse.status,
        upstreamContentType: contentType || 'unknown',
      });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      return res.status(502).json({
        error: 'Upstream Xtream endpoint returned a non-JSON response.',
        errorType: 'UPSTREAM_NON_JSON_RESPONSE',
        upstreamStatus: upstreamResponse.status,
        upstreamContentType: contentType || 'unknown',
      });
    }

    return res.status(upstreamResponse.status).json(parsed);
  } catch (err: unknown) {
    const error = err as Error;
    const classified = classifyNetworkError(error);
    // Log safely without revealing credentials
    console.error('IPTV Proxy network error:', classified.type, sanitizeCredentials(error.message));
    return res.status(classified.type === 'RESTRICTED_HOST' ? 403 : 502).json({
      error: classified.message,
      errorType: classified.type,
    });
  }
});

/**
 * Creates a short-lived opaque stream ticket so provider URLs, credentials, and
 * signed HLS URLs do not need to appear in Get Smart browser query strings.
 */
app.post('/api/xtream/stream-ticket', async (req: Request, res: Response) => {
  const streamUrl = req.body?.url as string;
  if (!streamUrl) return res.status(400).json({ error: 'Missing stream URL' });

  try {
    const validation = await validateTargetUrl(streamUrl);
    if (!validation.isValid) {
      const validationError = new Error(`SSRF Security check failed: ${validation.error || 'Stream URL is not allowed.'}`);
      const classified = classifyNetworkError(validationError);
      return res.status(403).json({
        error: classified.message,
        errorType: classified.type,
      });
    }

    const ticket = createStreamTicket(streamUrl);
    return res.json({
      streamPath: `/api/xtream/stream/${ticket}`,
      expiresInSeconds: STREAM_TICKET_TTL_MS / 1000,
    });
  } catch (err: unknown) {
    const classified = classifyNetworkError(err as Error);
    return res.status(classified.type === 'RESTRICTED_HOST' ? 403 : 400).json({
      error: classified.message,
      errorType: classified.type,
    });
  }
});

/**
 * Stream proxy to bypass CORS/mixed-content for HLS and media chunks.
 * SSRF protected with redirect checking and opaque ticket-based HLS rewriting.
 */
app.all(['/api/xtream/stream', '/api/xtream/stream/:ticket'], async (req: Request, res: Response) => {
  const ticketUrl = req.params.ticket ? getStreamTicket(req.params.ticket) : null;
  const streamUrl = ticketUrl || (req.body?.url as string) || (req.query.url as string);
  if (!streamUrl) {
    return res.status(req.params.ticket ? 404 : 400).send(
      req.params.ticket ? 'Stream ticket expired or invalid' : 'Missing stream URL'
    );
  }

  try {
    const upstreamHeaders: Record<string, string> = {
      'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18',
      'Accept': '*/*',
    };

    if (req.headers.range) {
      upstreamHeaders['Range'] = req.headers.range;
    }

    const response = await safeFetch(streamUrl, {
      headers: upstreamHeaders,
      timeoutMs: 30000,
      maxRedirects: 5,
    });

    // Forward relevant media headers
    const contentType = response.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);

    const contentLength = response.headers.get('content-length');
    if (contentLength) res.setHeader('Content-Length', contentLength);

    const contentRange = response.headers.get('content-range');
    if (contentRange) res.setHeader('Content-Range', contentRange);

    const acceptRanges = response.headers.get('accept-ranges');
    if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);

    res.status(response.status);

    const parsedUrl = new URL(streamUrl);

    // If it's an HLS M3U8 manifest, rewrite relative segment paths and encryption key URIs
    if (
      (contentType &&
        (contentType.includes('mpegurl') ||
          contentType.includes('application/x-mpegURL') ||
          contentType.includes('application/vnd.apple.mpegurl'))) ||
      parsedUrl.pathname.endsWith('.m3u8')
    ) {
      const manifestText = await response.text();
      const baseUrl = new URL('.', streamUrl).href;

      const rewrittenManifest = manifestText
        .split('\n')
        .map((line) => {
          const trimmed = line.trim();
          if (!trimmed) return line;

          if (trimmed.startsWith('#EXT-X-KEY:') || trimmed.startsWith('#EXT-X-MAP:')) {
            return line.replace(/URI="([^"]+)"/, (_m, uri) => {
              let absUri = uri;
              if (!uri.startsWith('http://') && !uri.startsWith('https://')) {
                absUri = new URL(uri, baseUrl).href;
              }
              const childTicket = createStreamTicket(absUri);
              return `URI="/api/xtream/stream/${childTicket}"`;
            });
          }

          if (trimmed.startsWith('#')) {
            return line;
          }

          // Resolves relative URLs to absolute URLs, then proxies them
          let absoluteSegmentUrl = trimmed;
          if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
            absoluteSegmentUrl = new URL(trimmed, baseUrl).href;
          }
          const childTicket = createStreamTicket(absoluteSegmentUrl);
          return `/api/xtream/stream/${childTicket}`;
        })
        .join('\n');

      return res.send(rewrittenManifest);
    }

    // Stream binary video/audio chunks
    if (response.body) {
      const reader = (response.body as ReadableStream<Uint8Array>).getReader();
      const pump = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(Buffer.from(value));
          }
          res.end();
        } catch {
          res.end();
        }
      };
      await pump();
    } else {
      res.end();
    }
  } catch (err: unknown) {
    const error = err as Error;
    console.error('Stream proxy error:', sanitizeCredentials(error.message));
    if (!res.headersSent) {
      res.status(502).send('Error streaming media chunk');
    }
  }
});

// Start server
async function startServer() {
  if (!isProduction) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Get Smart Media Player Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

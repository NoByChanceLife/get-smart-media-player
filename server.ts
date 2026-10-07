import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(express.json());

// Enable permissive CORS for internal API
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Helper to scrub credentials, tokens, and MAC addresses from logs
function sanitizeForLog(text: string): string {
  if (!text) return '';
  return text
    .replace(/password=([^&]+)/gi, 'password=***')
    .replace(/username=([^&]+)/gi, 'username=***')
    .replace(/token=([^&]+)/gi, 'token=***')
    .replace(/mac=([0-9a-fA-F:%]{17,})/gi, 'mac=***')
    .replace(/sn=([^&]+)/gi, 'sn=***')
    .replace(/device_id[2]?=([^&]+)/gi, 'device_id=***')
    .replace(/signature=([^&]+)/gi, 'signature=***')
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+/gi, 'Bearer ***')
    .replace(/\/live\/([^\/]+)\/([^\/]+)\//gi, '/live/***//***/')
    .replace(/\/movie\/([^\/]+)\/([^\/]+)\//gi, '/movie/***//***/')
    .replace(/\/series\/([^\/]+)\/([^\/]+)\//gi, '/series/***//***/');
}

// Classify network error types
function classifyNetworkError(err: Error): { type: string; message: string } {
  const msg = err.message || '';
  if (msg.includes('ENOTFOUND') || msg.includes('EAI_AGAIN') || msg.includes('getaddrinfo')) {
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
  if (msg.includes('ERR_TOO_MANY_REDIRECTS')) {
    return { type: 'REDIRECT_PROBLEM', message: 'Too many HTTP redirects encountered from provider server.' };
  }
  return { type: 'SERVER_UNREACHABLE', message: 'Failed to establish connection to IPTV server.' };
}

// Diagnostic Probe Endpoint for Connection Testing
app.all('/api/xtream/probe', async (req: Request, res: Response) => {
  const targetUrl = (req.query.url as string) || (req.body?.url as string);
  if (!targetUrl) {
    return res.status(400).json({ ok: false, errorType: 'BAD_REQUEST', errorMessage: 'Missing target url parameter' });
  }

  try {
    const parsedUrl = new URL(targetUrl);
    const hostname = parsedUrl.hostname.toLowerCase();
    if (hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '0.0.0.0') {
      return res.status(403).json({ ok: false, errorType: 'RESTRICTED_HOST', errorMessage: 'Restricted host' });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const startTime = Date.now();

    const customUserAgent = (req.query.user_agent as string) || 'GetSmartMediaPlayer/2.0 (Linux; Android 12; OTT Player)';
    const mac = (req.query.mac as string) || (req.headers['x-target-mac'] as string);
    const token = (req.query.token as string) || (req.headers['x-target-token'] as string);

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

    const probeResponse = await fetch(targetUrl, {
      method: req.method === 'HEAD' ? 'HEAD' : 'GET',
      headers: probeHeaders,
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timeout);
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
    return res.status(502).json({
      ok: false,
      errorType: classified.type,
      errorMessage: classified.message,
    });
  }
});

// Xtream Codes & Stalker / MAG API Proxy to bypass CORS and Mixed Content issues
app.all('/api/xtream/proxy', async (req: Request, res: Response) => {
  const targetUrl = (req.query.url as string) || (req.body?.url as string);
  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing target url parameter' });
  }

  try {
    const parsedUrl = new URL(targetUrl);
    // Disallow loopback / private IP SSRF attacks
    const hostname = parsedUrl.hostname.toLowerCase();
    if (hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '0.0.0.0') {
      return res.status(403).json({ error: 'Restricted host' });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    // Build headers including Stalker/MAG portal headers if supplied
    const mac = (req.query.mac as string) || (req.headers['x-target-mac'] as string);
    const token = (req.query.token as string) || (req.headers['x-target-token'] as string);
    const customUserAgent = (req.query.user_agent as string) || 
      (mac ? 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG250 stbapp ver: 4 rev: 218 Mobile Safari/533.3' : 'GetSmartMediaPlayer/2.0 (Linux; Android 12; OTT Player)');

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
      method: req.method === 'POST' ? 'POST' : 'GET',
      headers: requestHeaders,
      signal: controller.signal,
      redirect: 'follow',
    };

    if (req.method === 'POST' && req.body && Object.keys(req.body).length > 0) {
      requestHeaders['Content-Type'] = 'application/json';
      fetchOptions.body = JSON.stringify(req.body);
    }

    const upstreamResponse = await fetch(targetUrl, fetchOptions);

    clearTimeout(timeout);

    if (!upstreamResponse.ok) {
      return res.status(upstreamResponse.status).json({
        error: `Upstream server returned status ${upstreamResponse.status}`,
        status: upstreamResponse.status,
      });
    }

    const contentType = upstreamResponse.headers.get('content-type') || 'application/json';
    res.setHeader('Content-Type', contentType);

    const bodyText = await upstreamResponse.text();
    return res.send(bodyText);
  } catch (err: unknown) {
    const error = err as Error;
    const classified = classifyNetworkError(error);
    // Log safely without revealing credentials
    console.error('IPTV Proxy network error:', classified.type, sanitizeForLog(error.message));
    return res.status(502).json({
      error: classified.message,
      errorType: classified.type,
    });
  }
});

// Stream proxy to bypass CORS/mixed-content for HLS and media chunks
app.get('/api/xtream/stream', async (req: Request, res: Response) => {
  const streamUrl = req.query.url as string;
  if (!streamUrl) {
    return res.status(400).send('Missing stream URL');
  }

  try {
    const parsedUrl = new URL(streamUrl);
    const hostname = parsedUrl.hostname.toLowerCase();
    if (hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '0.0.0.0') {
      return res.status(403).send('Restricted host');
    }

    const upstreamHeaders: Record<string, string> = {
      'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18',
      'Accept': '*/*',
    };

    if (req.headers.range) {
      upstreamHeaders['Range'] = req.headers.range;
    }

    const response = await fetch(streamUrl, {
      headers: upstreamHeaders,
    });

    // Forward relevant headers
    const contentType = response.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);

    const contentLength = response.headers.get('content-length');
    if (contentLength) res.setHeader('Content-Length', contentLength);

    const contentRange = response.headers.get('content-range');
    if (contentRange) res.setHeader('Content-Range', contentRange);

    const acceptRanges = response.headers.get('accept-ranges');
    if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);

    res.status(response.status);

    // If it's an HLS M3U8 manifest, rewrite relative segment paths and encryption key URIs to route through proxy
    if ((contentType && (contentType.includes('mpegurl') || contentType.includes('application/x-mpegURL') || contentType.includes('application/vnd.apple.mpegurl'))) || parsedUrl.pathname.endsWith('.m3u8')) {
      const manifestText = await response.text();
      const baseUrl = new URL('.', streamUrl).href;
      
      const rewrittenManifest = manifestText.split('\n').map((line) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return line;
        }

        if (trimmed.startsWith('#EXT-X-KEY:') || trimmed.startsWith('#EXT-X-MAP:')) {
          return line.replace(/URI="([^"]+)"/, (_m, uri) => {
            let absUri = uri;
            if (!uri.startsWith('http://') && !uri.startsWith('https://')) {
              absUri = new URL(uri, baseUrl).href;
            }
            return `URI="/api/xtream/stream?url=${encodeURIComponent(absUri)}"`;
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
        return `/api/xtream/stream?url=${encodeURIComponent(absoluteSegmentUrl)}`;
      }).join('\n');

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
    console.error('Stream proxy error:', sanitizeForLog(error.message));
    if (!res.headersSent) {
      res.status(502).send('Error streaming media chunk');
    }
  }
});

// Start server
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

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

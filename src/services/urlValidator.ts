import dns from 'dns';
import net from 'net';

export interface ValidatedUrlResult {
  isValid: boolean;
  error?: string;
  url?: URL;
}

/**
 * Checks if an IPv4 address belongs to loopback, private, link-local, broadcast, or reserved blocks.
 */
function isRestrictedIPv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true;
  }

  const [b0, b1] = parts;

  // 0.0.0.0/8 - Current network
  if (b0 === 0) return true;

  // 10.0.0.0/8 - Private network
  if (b0 === 10) return true;

  // 127.0.0.0/8 - Loopback
  if (b0 === 127) return true;

  // 169.254.0.0/16 - Link-local / Cloud metadata (e.g. AWS/GCP/Azure 169.254.169.254)
  if (b0 === 169 && b1 === 254) return true;

  // 172.16.0.0/12 - Private network (172.16.0.0 - 172.31.255.255)
  if (b0 === 172 && b1 >= 16 && b1 <= 31) return true;

  // 192.168.0.0/16 - Private network
  if (b0 === 192 && b1 === 168) return true;

  // 100.64.0.0/10 - Shared address space (CGNAT)
  if (b0 === 100 && b1 >= 64 && b1 <= 127) return true;

  // 192.0.0.0/24 - IETF Protocol Assignments
  if (b0 === 192 && b1 === 0 && parts[2] === 0) return true;

  // 198.18.0.0/15 - Benchmark tests
  if (b0 === 198 && (b1 === 18 || b1 === 19)) return true;

  // 224.0.0.0/4 - Multicast (224.0.0.0 - 239.255.255.255)
  if (b0 >= 224 && b0 <= 239) return true;

  // 240.0.0.0/4 - Reserved (240.0.0.0 - 255.255.255.255)
  if (b0 >= 240) return true;

  return false;
}

/**
 * Checks if an IPv6 address belongs to loopback, link-local, unique-local, or documentation blocks.
 */
function isRestrictedIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();

  // ::1 - Loopback
  if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') return true;

  // :: - Unspecified
  if (normalized === '::' || normalized === '0:0:0:0:0:0:0:0') return true;

  // fe80::/10 - Link-local
  if (normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) {
    return true;
  }

  // fc00::/7 - Unique local addresses (ULA: fc00:: - fdff::)
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) {
    return true;
  }

  // IPv4-mapped IPv6 (::ffff:x.x.x.x)
  if (normalized.startsWith('::ffff:')) {
    const v4Part = normalized.replace('::ffff:', '');
    if (net.isIPv4(v4Part)) {
      return isRestrictedIPv4(v4Part);
    }
    return true;
  }

  return false;
}

/**
 * Validates a target URL against SSRF vulnerabilities, restricted schemes,
 * embedded credentials, private/loopback/cloud IP ranges, and malformed structures.
 */
export async function validateTargetUrl(rawUrl: string): Promise<ValidatedUrlResult> {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { isValid: false, error: 'URL must be a non-empty string.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { isValid: false, error: 'Malformed or invalid URL syntax.' };
  }

  // 1. Only permit http: and https: protocols
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { isValid: false, error: `Disallowed URL protocol: ${parsed.protocol}. Only http: and https: are permitted.` };
  }

  // 2. Reject embedded URL credentials (e.g. http://username:password@example.com/)
  if (parsed.username || parsed.password) {
    return { isValid: false, error: 'Embedded credentials in URL (user:pass@host) are forbidden.' };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!hostname) {
    return { isValid: false, error: 'URL is missing a valid hostname.' };
  }

  // 3. Block localhost, loopback names, and known internal infrastructure
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '0.0.0.0' ||
    hostname === 'broadcast' ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.local') ||
    hostname === 'metadata.google.internal' ||
    hostname === 'instance-data'
  ) {
    return { isValid: false, error: 'Requests to localhost and internal infrastructure domains are blocked.' };
  }

  // 4. If hostname is directly an IP literal
  const ipFamily = net.isIP(hostname);
  if (ipFamily === 4) {
    if (isRestrictedIPv4(hostname)) {
      return { isValid: false, error: 'Access to private, loopback, or reserved IPv4 addresses is blocked.' };
    }
  } else if (ipFamily === 6) {
    // Strip brackets if parsed.hostname left them or if raw
    const cleanIpv6 = hostname.replace(/^\[|\]$/g, '');
    if (isRestrictedIPv6(cleanIpv6)) {
      return { isValid: false, error: 'Access to private, loopback, or link-local IPv6 addresses is blocked.' };
    }
  } else {
    // 5. Hostname is a domain name -> Resolve DNS and validate resolved IP addresses
    try {
      const addresses = await dns.promises.lookup(hostname, { all: true });
      if (!addresses || addresses.length === 0) {
        return { isValid: false, error: `DNS resolution failed for hostname: ${hostname}` };
      }

      for (const addr of addresses) {
        if (addr.family === 4) {
          if (isRestrictedIPv4(addr.address)) {
            return {
              isValid: false,
              error: `Host ${hostname} resolves to blocked internal IPv4 address (${addr.address}).`,
            };
          }
        } else if (addr.family === 6) {
          if (isRestrictedIPv6(addr.address)) {
            return {
              isValid: false,
              error: `Host ${hostname} resolves to blocked internal IPv6 address (${addr.address}).`,
            };
          }
        }
      }
    } catch (err: unknown) {
      const error = err as Error;
      return {
        isValid: false,
        error: `DNS resolution failed for ${hostname}: ${error.message || 'unknown error'}`,
      };
    }
  }

  return { isValid: true, url: parsed };
}

/**
 * Safe fetch wrapper that handles redirects manually, validating each redirect location
 * to prevent SSRF via open-redirect bouncing into private addresses.
 * Also enforces timeouts, redirect limits, and maximum response sizes.
 */
export async function safeFetch(
  targetUrl: string,
  options: RequestInit & {
    maxRedirects?: number;
    timeoutMs?: number;
    maxResponseBytes?: number;
  } = {}
): Promise<Response> {
  const maxRedirects = options.maxRedirects ?? 5;
  const timeoutMs = options.timeoutMs ?? 15000;
  const maxResponseBytes = options.maxResponseBytes;

  let currentUrl = targetUrl;
  let redirectsRemaining = maxRedirects;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    while (true) {
      // Validate current URL before initiating connection
      const validation = await validateTargetUrl(currentUrl);
      if (!validation.isValid) {
        throw new Error(`SSRF Security check failed: ${validation.error}`);
      }

      // Fetch with redirect: 'manual' to validate any redirect destination
      const fetchOpts: RequestInit = {
        ...options,
        redirect: 'manual',
        signal: controller.signal,
      };

      const res = await fetch(currentUrl, fetchOpts);

      // Check if redirect
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const locationHeader = res.headers.get('location');
        if (!locationHeader) {
          return res;
        }

        if (redirectsRemaining <= 0) {
          throw new Error(`Too many redirects (exceeded limit of ${maxRedirects}).`);
        }
        redirectsRemaining--;

        // Resolve relative redirects against currentUrl
        const resolvedRedirect = new URL(locationHeader, currentUrl).href;
        currentUrl = resolvedRedirect;
        continue;
      }

      // If maxResponseBytes is specified, enforce the limit even when the
      // upstream server omits Content-Length or uses chunked transfer encoding.
      if (maxResponseBytes) {
        const cl = res.headers.get('content-length');
        if (cl && parseInt(cl, 10) > maxResponseBytes) {
          try {
            await res.body?.cancel();
          } catch {
            // Best-effort cancellation only.
          }
          throw new Error(`Response size exceeds limit of ${maxResponseBytes} bytes.`);
        }

        if (res.body) {
          const reader = res.body.getReader();
          const chunks: Uint8Array[] = [];
          let totalBytes = 0;

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (!value) continue;

              totalBytes += value.byteLength;
              if (totalBytes > maxResponseBytes) {
                await reader.cancel();
                throw new Error(`Response size exceeds limit of ${maxResponseBytes} bytes.`);
              }

              chunks.push(value);
            }
          } finally {
            reader.releaseLock();
          }

          const body = new Uint8Array(totalBytes);
          let offset = 0;
          for (const chunk of chunks) {
            body.set(chunk, offset);
            offset += chunk.byteLength;
          }

          clearTimeout(timer);
          return new Response(body, {
            status: res.status,
            statusText: res.statusText,
            headers: new Headers(res.headers),
          });
        }
      }

      clearTimeout(timer);
      return res;
    }
  } catch (err: unknown) {
    clearTimeout(timer);
    throw err;
  }
}

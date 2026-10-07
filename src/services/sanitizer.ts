/**
 * Centralized Redaction & Sanitization Engine
 * Ensures credentials, tokens, MAC addresses, device serials, and secret-bearing URLs
 * are never exposed in UI error strings, browser consoles, network diagnostics, or server logs.
 */

export function sanitizeCredentials(text: string): string {
  if (!text || typeof text !== 'string') return '';

  return text
    // Query parameter secrets
    .replace(/(password|passwd|pass)=([^&\\s'"]+)/gi, '$1=***')
    .replace(/(username|user)=([^&\\s'"]+)/gi, '$1=***')
    .replace(/(token|auth_token|access_token)=([^&\\s'"]+)/gi, '$1=***')
    .replace(/(mac|stb_mac)=([0-9a-fA-F:%]{10,})/gi, '$1=***')
    .replace(/(sn|serial|device_id|device_id2)=([^&\\s'"]+)/gi, '$1=***')
    .replace(/(signature|sig)=([^&\\s'"]+)/gi, '$1=***')
    // HTTP headers
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+/gi, 'Bearer ***')
    .replace(/Cookie:[^\r\n]*/gi, 'Cookie: [REDACTED]')
    // Xtream streaming path formats: /live/user/pass/id.m3u8, /movie/user/pass/id.mp4, /series/user/pass/id.mp4
    .replace(/\/live\/([^\/]+)\/([^\/]+)\//gi, '/live/***/***/')
    .replace(/\/movie\/([^\/]+)\/([^\/]+)\//gi, '/movie/***/***/')
    .replace(/\/series\/([^\/]+)\/([^\/]+)\//gi, '/series/***/***/')
    // Embedded basic auth in URLs
    .replace(/:\/\/([^:]+):([^@]+)@/g, '://***:***@');
}

/**
 * Sanitizes URLs for display in UI or logs by stripping query parameters and hiding path credentials.
 */
export function sanitizeDisplayUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  try {
    const parsed = new URL(rawUrl);
    parsed.password = '';
    parsed.username = '';
    parsed.search = '';
    let pathname = parsed.pathname;
    pathname = pathname
      .replace(/\/live\/([^\/]+)\/([^\/]+)\//gi, '/live/***/***/')
      .replace(/\/movie\/([^\/]+)\/([^\/]+)\//gi, '/movie/***/***/')
      .replace(/\/series\/([^\/]+)\/([^\/]+)\//gi, '/series/***/***/');
    parsed.pathname = pathname;
    return parsed.toString();
  } catch {
    return sanitizeCredentials(rawUrl);
  }
}

/**
 * Sanitizes an error message before returning to the UI or writing to console/logs.
 */
export function sanitizeErrorMessage(err: unknown): string {
  if (!err) return 'An unknown error occurred.';
  const msg = err instanceof Error ? err.message : String(err);
  return sanitizeCredentials(msg);
}

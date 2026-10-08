export interface ProviderRequest {
  url: string;
  mac?: string;
  token?: string;
  userAgent?: string;
}

export interface ProviderTransport {
  requestJson<T>(request: ProviderRequest): Promise<T>;
}

/**
 * Browser/PWA transport. Provider protocol code should not care where the
 * request executes. A native Android transport can later replace this adapter
 * without rewriting Xtream catalog/authentication behavior.
 */
class WebProviderTransport implements ProviderTransport {
  public async requestJson<T>(request: ProviderRequest): Promise<T> {
    const response = await fetch('/provider-api', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(request.mac ? { 'X-Target-Mac': request.mac } : {}),
        ...(request.token ? { 'X-Target-Token': request.token } : {}),
      },
      body: JSON.stringify({
        url: request.url,
        mac: request.mac,
        token: request.token,
        user_agent: request.userAgent,
      }),
    });

    const contentType = response.headers.get('content-type') || '';
    const marker = response.headers.get('x-get-smart-xtream-proxy') || '';
    const text = await response.text();

    let parsed: any = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      // Keep the body private; classification below is sufficient.
    }

    if (!response.ok) {
      if (parsed?.error) {
        const parts = [
          parsed.error,
          parsed.errorType ? `type=${parsed.errorType}` : '',
          parsed.upstreamStatus ? `upstream=${parsed.upstreamStatus}` : '',
          parsed.upstreamContentType ? `content-type=${parsed.upstreamContentType}` : '',
          marker ? `proxy=${marker}` : '',
        ].filter(Boolean);
        throw new Error(parts.join(' · '));
      }
      throw new Error(marker
        ? `Get Smart provider transport returned an unreadable response (HTTP ${response.status}, content-type=${contentType || 'unknown'}, proxy=${marker}).`
        : `Get Smart provider transport was not reached (HTTP ${response.status}, content-type=${contentType || 'unknown'}).`);
    }

    if (!parsed) {
      throw new Error(marker
        ? `Get Smart provider transport returned non-JSON (HTTP ${response.status}, content-type=${contentType || 'unknown'}, proxy=${marker}).`
        : `Get Smart provider transport was not reached (HTTP ${response.status}, content-type=${contentType || 'unknown'}).`);
    }

    return parsed as T;
  }
}

let activeTransport: ProviderTransport = new WebProviderTransport();

export function getProviderTransport(): ProviderTransport {
  return activeTransport;
}

export function setProviderTransport(transport: ProviderTransport): void {
  activeTransport = transport;
}

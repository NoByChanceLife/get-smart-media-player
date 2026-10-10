export interface ProviderRequest {
  url: string;
  mac?: string;
  token?: string;
  userAgent?: string;
}

export interface ProviderTransport {
  requestJson<T>(request: ProviderRequest): Promise<T>;
}

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
      throw new Error(
        marker
          ? `Get Smart provider transport returned an unreadable response (HTTP ${response.status}, content-type=${contentType || 'unknown'}, proxy=${marker}).`
          : `Get Smart provider transport was not reached (HTTP ${response.status}, content-type=${contentType || 'unknown'}).`
      );
    }

    if (!parsed) {
      throw new Error(
        marker
          ? `Get Smart provider transport returned non-JSON (HTTP ${response.status}, content-type=${contentType || 'unknown'}, proxy=${marker}).`
          : `Get Smart provider transport was not reached (HTTP ${response.status}, content-type=${contentType || 'unknown'}).`
      );
    }

    return parsed as T;
  }
}

class BrokenNativeProviderTransport implements ProviderTransport {
  constructor(private readonly reason: string) {}

  public async requestJson<T>(_request: ProviderRequest): Promise<T> {
    throw new Error(
      `Android native provider transport initialization failed. ${this.reason}`
    );
  }
}

let activeTransport: ProviderTransport = new WebProviderTransport();
let activeTransportLabel = 'web-backend';

export function getProviderTransport(): ProviderTransport {
  return activeTransport;
}

export function getProviderTransportLabel(): string {
  return activeTransportLabel;
}

export function setProviderTransport(
  transport: ProviderTransport,
  label = 'custom'
): void {
  activeTransport = transport;
  activeTransportLabel = label;
}

/**
 * Called once during app startup.
 *
 * Browser/PWA intentionally uses the web backend. Native Android must never
 * silently fall back to the web transport because /provider-api is an Express
 * endpoint and there is no Express server inside the installed APK.
 */
export async function initializeProviderTransport(): Promise<void> {
  const capacitor = await import('@capacitor/core');
  const isAndroidNative =
    capacitor.Capacitor.isNativePlatform() &&
    capacitor.Capacitor.getPlatform() === 'android';

  if (!isAndroidNative) {
    setProviderTransport(new WebProviderTransport(), 'web-backend');
    return;
  }

  try {
    const android = await import('./androidProviderTransport');

    if (!android.isNativeAndroidRuntime()) {
      throw new Error('Capacitor did not report an Android native runtime.');
    }

    const transport = new android.AndroidProviderTransport();
    const info = await transport.verifyReady();

    setProviderTransport(
      transport,
      `android-native:${info.marker}:${info.engine}`
    );
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);

    // Keep the app UI available so the user can see a precise connection error,
    // but make provider requests fail immediately. Never route native Android
    // provider traffic through the web-only /provider-api endpoint.
    setProviderTransport(
      new BrokenNativeProviderTransport(reason),
      'android-native:failed'
    );
  }
}

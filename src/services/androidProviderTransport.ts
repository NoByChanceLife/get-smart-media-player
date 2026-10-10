import { Capacitor, registerPlugin } from '@capacitor/core';
import type { ProviderRequest, ProviderTransport } from './providerTransport';

interface NativeTransportInfo {
  marker: string;
  engine: string;
  connectTimeoutMs: number;
  readTimeoutMs: number;
}

interface NativeProviderPlugin {
  getTransportInfo(): Promise<NativeTransportInfo>;
  requestJson(options: {
    url: string;
    userAgent?: string;
    mac?: string;
    token?: string;
  }): Promise<{ status: number; contentType?: string; data: unknown }>;
}

const EXPECTED_TRANSPORT_MARKER = 'GS-NATIVE-URLCONNECTION-60S';
const NativeProvider = registerPlugin<NativeProviderPlugin>('GetSmartProvider');

export class AndroidProviderTransport implements ProviderTransport {
  private readinessPromise: Promise<NativeTransportInfo> | null = null;

  public async verifyReady(): Promise<NativeTransportInfo> {
    if (!this.readinessPromise) {
      this.readinessPromise = (async () => {
        try {
          const info = await NativeProvider.getTransportInfo();

          if (!info || info.marker !== EXPECTED_TRANSPORT_MARKER) {
            const actual = info?.marker || 'missing-marker';
            throw new Error(
              `Android native provider plugin version mismatch. Expected ${EXPECTED_TRANSPORT_MARKER}, received ${actual}. Rebuild and reinstall the APK.`
            );
          }

          return info;
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          if (message.includes(EXPECTED_TRANSPORT_MARKER)) {
            throw error;
          }
          throw new Error(
            `Android native provider transport is unavailable or stale. Expected ${EXPECTED_TRANSPORT_MARKER}. ${message}`
          );
        }
      })();
    }

    return this.readinessPromise;
  }

  public async requestJson<T>(request: ProviderRequest): Promise<T> {
    await this.verifyReady();

    const result = await NativeProvider.requestJson(request);
    if (result.status < 200 || result.status >= 300) {
      const payload = result.data as any;
      const detail =
        payload && typeof payload === 'object' && typeof payload.error === 'string'
          ? ` ${payload.error}`
          : '';
      throw new Error(`Android provider transport returned HTTP ${result.status}.${detail}`);
    }
    return result.data as T;
  }
}

export function isNativeAndroidRuntime(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

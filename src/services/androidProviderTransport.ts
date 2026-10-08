import { Capacitor, registerPlugin } from '@capacitor/core';
import type { ProviderRequest, ProviderTransport } from './providerTransport';

interface NativeProviderPlugin {
  requestJson(options: {
    url: string;
    userAgent?: string;
    mac?: string;
    token?: string;
  }): Promise<{ status: number; contentType?: string; data: unknown }>;
}

const NativeProvider = registerPlugin<NativeProviderPlugin>('GetSmartProvider');

export class AndroidProviderTransport implements ProviderTransport {
  public async requestJson<T>(request: ProviderRequest): Promise<T> {
    const result = await NativeProvider.requestJson(request);
    if (result.status < 200 || result.status >= 300) {
      throw new Error(`Android provider transport returned HTTP ${result.status}.`);
    }
    return result.data as T;
  }
}

export function isNativeAndroidRuntime(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

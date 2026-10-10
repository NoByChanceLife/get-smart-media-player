import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { ProviderRequest, ProviderTransport } from './providerTransport';

interface NativeTransportInfo {
  marker: string;
  engine: string;
  connectTimeoutMs: number;
  readTimeoutMs: number;
}

export interface NativePlayerState {
  reason: string;
  active: boolean;
  visible: boolean;
  title: string;
  mediaType: string;
  playbackState: 'idle' | 'buffering' | 'ready' | 'ended';
  isPlaying: boolean;
  playWhenReady: boolean;
  positionMs: number;
  durationMs: number;
  bufferedPositionMs: number;
  volume: number;
}

export interface NativePlayerCommand {
  command: 'stop' | 'channelPrevious' | 'channelNext' | 'guide' | 'back';
}

export interface NativePlayerError {
  errorCode: number;
  errorCodeName: string;
  message: string;
}

export interface NativePlayerTrackSummary {
  audioTracks: number;
  videoTracks: number;
  textTracks: number;
}

interface NativeProviderPlugin {
  playMedia(options: { url: string; title?: string; mediaType?: 'live' | 'vod' | 'series' }): Promise<{ started: boolean; engine: string }>;
  stopMedia(): Promise<{ stopped: boolean }>;
  setPlayerVisible(options: { visible: boolean }): Promise<NativePlayerState>;
  getPlayerState(): Promise<NativePlayerState>;
  controlMedia(options: {
    action: 'play' | 'pause' | 'toggle' | 'mute' | 'unmute' | 'toggleMute' | 'setVolume' | 'seekBy' | 'showControls' | 'hideControls';
    value?: number;
    offsetMs?: number;
  }): Promise<NativePlayerState>;
  addListener(eventName: 'playerState', listenerFunc: (state: NativePlayerState) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'playerCommand', listenerFunc: (event: NativePlayerCommand) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'playerError', listenerFunc: (event: NativePlayerError) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'playerTracks', listenerFunc: (event: NativePlayerTrackSummary) => void): Promise<PluginListenerHandle>;
  getTransportInfo(): Promise<NativeTransportInfo>;
  requestJson(options: {
    url: string;
    userAgent?: string;
    mac?: string;
    token?: string;
  }): Promise<{ status: number; contentType?: string; route?: string; data: unknown }>;
}

const EXPECTED_TRANSPORT_MARKER = 'GS-NATIVE-XCIPTV-HS10';
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


export async function playNativeAndroidMedia(options: {
  url: string;
  title?: string;
  mediaType?: 'live' | 'vod' | 'series';
}): Promise<void> {
  if (!isNativeAndroidRuntime()) throw new Error('Native Android playback is unavailable.');
  await NativeProvider.playMedia(options);
}

export async function setNativeAndroidPlayerVisible(visible: boolean): Promise<NativePlayerState | null> {
  if (!isNativeAndroidRuntime()) return null;
  return NativeProvider.setPlayerVisible({ visible });
}

export async function getNativeAndroidPlayerState(): Promise<NativePlayerState | null> {
  if (!isNativeAndroidRuntime()) return null;
  return NativeProvider.getPlayerState();
}

export async function controlNativeAndroidMedia(
  action: 'play' | 'pause' | 'toggle' | 'mute' | 'unmute' | 'toggleMute' | 'setVolume' | 'seekBy' | 'showControls' | 'hideControls',
  options: { value?: number; offsetMs?: number } = {}
): Promise<NativePlayerState | null> {
  if (!isNativeAndroidRuntime()) return null;
  return NativeProvider.controlMedia({ action, ...options });
}

export function addNativeAndroidPlayerStateListener(
  listener: (state: NativePlayerState) => void
): Promise<PluginListenerHandle> | null {
  if (!isNativeAndroidRuntime()) return null;
  return NativeProvider.addListener('playerState', listener);
}

export function addNativeAndroidPlayerCommandListener(
  listener: (event: NativePlayerCommand) => void
): Promise<PluginListenerHandle> | null {
  if (!isNativeAndroidRuntime()) return null;
  return NativeProvider.addListener('playerCommand', listener);
}

export function addNativeAndroidPlayerErrorListener(
  listener: (event: NativePlayerError) => void
): Promise<PluginListenerHandle> | null {
  if (!isNativeAndroidRuntime()) return null;
  return NativeProvider.addListener('playerError', listener);
}

export function addNativeAndroidPlayerTracksListener(
  listener: (event: NativePlayerTrackSummary) => void
): Promise<PluginListenerHandle> | null {
  if (!isNativeAndroidRuntime()) return null;
  return NativeProvider.addListener('playerTracks', listener);
}

export async function stopNativeAndroidMedia(): Promise<void> {
  if (!isNativeAndroidRuntime()) return;
  await NativeProvider.stopMedia();
}

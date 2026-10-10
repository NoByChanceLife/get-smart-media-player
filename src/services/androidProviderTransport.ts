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
  channelNumber?: string;
  currentProgram?: string;
  nextProgram?: string;
  osdVisible?: boolean;
  aspectMode?: 'Fit' | 'Fill' | 'Zoom' | string;
  preferredAudioLanguage?: string;
  subtitleDefaultMode?: 'auto' | 'off' | 'preferred' | string;
  preferredSubtitleLanguage?: string;
  playbackState: 'idle' | 'buffering' | 'ready' | 'ended';
  isPlaying: boolean;
  playWhenReady: boolean;
  positionMs: number;
  durationMs: number;
  bufferedPositionMs: number;
  volume: number;
}

export interface NativePlayerCommand {
  command:
    | 'stop'
    | 'channelPrevious'
    | 'channelNext'
    | 'lastChannel'
    | 'numericChannel'
    | 'recoverStream'
    | 'guide'
    | 'back';
  value?: string;
}

export interface NativePlayerError {
  errorCode: number;
  errorCodeName: string;
  category?: 'network' | 'decoder' | 'format' | 'drm' | 'live-window' | 'source-http' | 'unknown' | string;
  userMessage?: string;
  message: string;
}

export interface NativePlayerTrack {
  groupId: string;
  trackIndex: number;
  type: 'audio' | 'video' | 'text' | 'unknown';
  label: string;
  language: string;
  mimeType: string;
  codecs: string;
  bitrate: number;
  width: number;
  height: number;
  channelCount: number;
  selected: boolean;
  supported: boolean;
}

export interface NativePlayerTracks {
  audioTracks: NativePlayerTrack[];
  videoTracks: NativePlayerTrack[];
  textTracks: NativePlayerTrack[];
}

export interface NativePlayerDiagnosticLevel {
  id: number;
  name: string;
  width: number;
  height: number;
  bitrate: number;
  selected?: boolean;
  supported?: boolean;
}

export interface NativePlayerDiagnostics {
  active: boolean;
  state: 'idle' | 'buffering' | 'ready' | 'ended';
  performanceMode: 'auto' | 'fast' | 'balanced' | 'stable';
  effectivePerformanceMode: 'fast' | 'balanced' | 'stable';
  qualityPreference: 'auto' | '1080p' | '720p' | '480p' | 'low';
  maxRetryAttempts: number;
  recoveryAttempt: number;
  recoveryStage: number;
  rebufferCount: number;
  startupTimeMs: number;
  protocol: string;
  estimatedBandwidthBps: number;
  estimatedBandwidthAvailable: boolean;
  droppedFrames: number;
  totalFrames: number;
  droppedFramesAvailable: boolean;
  bufferedSeconds: number;
  bitrateBps: number;
  width: number;
  height: number;
  resolution: string;
  healthRating: 'optimal' | 'good' | 'fair' | 'poor';
  diagnosticMessage: string;
  availableLevels: NativePlayerDiagnosticLevel[];
  customUserAgent?: boolean;
  refererHeader?: boolean;
  cookieHeader?: boolean;
}

interface NativeProviderPlugin {
  playMedia(options: {
    url: string;
    title?: string;
    mediaType?: 'live' | 'vod' | 'series';
    channelNumber?: string;
    currentProgram?: string;
    nextProgram?: string;
    performanceMode?: 'auto' | 'fast' | 'balanced' | 'stable';
    qualityPreference?: 'auto' | '1080p' | '720p' | '480p' | 'low';
    maxRetryAttempts?: number;
    recovery?: boolean;
    userAgent?: string;
    referer?: string;
    cookie?: string;
    preferredAudioLanguage?: string;
    subtitleDefaultMode?: 'auto' | 'off' | 'preferred';
    preferredSubtitleLanguage?: string;
  }): Promise<{ started: boolean; engine: string }>;
  setTrackPreferences(options: {
    preferredAudioLanguage?: string;
    subtitleDefaultMode?: 'auto' | 'off' | 'preferred';
    preferredSubtitleLanguage?: string;
  }): Promise<{
    applied: boolean;
    reason?: string;
    preferredAudioLanguage?: string;
    subtitleDefaultMode?: string;
    preferredSubtitleLanguage?: string;
  }>;
  setPerformanceConfig(options: {
    performanceMode?: 'auto' | 'fast' | 'balanced' | 'stable';
    qualityPreference?: 'auto' | '1080p' | '720p' | '480p' | 'low';
    maxRetryAttempts?: number;
  }): Promise<{
    applied: boolean;
    reason?: string;
    performanceMode?: string;
    effectivePerformanceMode?: string;
    qualityPreference?: string;
    maxRetryAttempts?: number;
  }>;
  getPlayerDiagnostics(): Promise<NativePlayerDiagnostics>;
  updatePlayerMetadata(options: {
    title?: string;
    channelNumber?: string;
    currentProgram?: string;
    nextProgram?: string;
  }): Promise<NativePlayerState>;
  stopMedia(): Promise<{ stopped: boolean }>;
  setPlayerVisible(options: { visible: boolean }): Promise<NativePlayerState>;
  getPlayerState(): Promise<NativePlayerState>;
  getPlayerTracks(): Promise<NativePlayerTracks>;
  selectPlayerTrack(options: {
    type: 'audio' | 'video' | 'text';
    groupId?: string;
    trackIndex?: number;
    disabled?: boolean;
  }): Promise<NativePlayerTracks>;
  controlMedia(options: {
    action: 'play' | 'pause' | 'toggle' | 'mute' | 'unmute' | 'toggleMute' | 'setVolume' | 'seekBy' | 'showControls' | 'hideControls';
    value?: number;
    offsetMs?: number;
  }): Promise<NativePlayerState>;
  addListener(eventName: 'playerState', listenerFunc: (state: NativePlayerState) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'playerCommand', listenerFunc: (event: NativePlayerCommand) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'playerError', listenerFunc: (event: NativePlayerError) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'playerTracks', listenerFunc: (event: NativePlayerTracks) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'playerDiagnostics', listenerFunc: (event: NativePlayerDiagnostics) => void): Promise<PluginListenerHandle>;
  getTransportInfo(): Promise<NativeTransportInfo>;
  requestJson(options: {
    url: string;
    userAgent?: string;
    mac?: string;
    token?: string;
  }): Promise<{ status: number; contentType?: string; route?: string; data: unknown }>;
}

const EXPECTED_TRANSPORT_MARKER = 'GS-NATIVE-XCIPTV-HS18';
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
  channelNumber?: string;
  currentProgram?: string;
  nextProgram?: string;
  performanceMode?: 'auto' | 'fast' | 'balanced' | 'stable';
  qualityPreference?: 'auto' | '1080p' | '720p' | '480p' | 'low';
  maxRetryAttempts?: number;
  recovery?: boolean;
  userAgent?: string;
  referer?: string;
  cookie?: string;
  preferredAudioLanguage?: string;
  subtitleDefaultMode?: 'auto' | 'off' | 'preferred';
  preferredSubtitleLanguage?: string;
}): Promise<void> {
  if (!isNativeAndroidRuntime()) throw new Error('Native Android playback is unavailable.');
  await NativeProvider.playMedia(options);
}

export async function setNativeAndroidTrackPreferences(options: {
  preferredAudioLanguage?: string;
  subtitleDefaultMode?: 'auto' | 'off' | 'preferred';
  preferredSubtitleLanguage?: string;
}): Promise<void> {
  if (!isNativeAndroidRuntime()) return;
  await NativeProvider.setTrackPreferences(options);
}

export async function setNativeAndroidPerformanceConfig(options: {
  performanceMode?: 'auto' | 'fast' | 'balanced' | 'stable';
  qualityPreference?: 'auto' | '1080p' | '720p' | '480p' | 'low';
  maxRetryAttempts?: number;
}): Promise<void> {
  if (!isNativeAndroidRuntime()) return;
  await NativeProvider.setPerformanceConfig(options);
}

export async function getNativeAndroidPlayerDiagnostics(): Promise<NativePlayerDiagnostics | null> {
  if (!isNativeAndroidRuntime()) return null;
  return NativeProvider.getPlayerDiagnostics();
}

export async function updateNativeAndroidPlayerMetadata(options: {
  title?: string;
  channelNumber?: string;
  currentProgram?: string;
  nextProgram?: string;
}): Promise<NativePlayerState | null> {
  if (!isNativeAndroidRuntime()) return null;
  return NativeProvider.updatePlayerMetadata(options);
}

export async function setNativeAndroidPlayerVisible(visible: boolean): Promise<NativePlayerState | null> {
  if (!isNativeAndroidRuntime()) return null;
  return NativeProvider.setPlayerVisible({ visible });
}

export async function getNativeAndroidPlayerState(): Promise<NativePlayerState | null> {
  if (!isNativeAndroidRuntime()) return null;
  return NativeProvider.getPlayerState();
}

export async function getNativeAndroidPlayerTracks(): Promise<NativePlayerTracks | null> {
  if (!isNativeAndroidRuntime()) return null;
  return NativeProvider.getPlayerTracks();
}

export async function selectNativeAndroidPlayerTrack(options: {
  type: 'audio' | 'video' | 'text';
  groupId?: string;
  trackIndex?: number;
  disabled?: boolean;
}): Promise<NativePlayerTracks | null> {
  if (!isNativeAndroidRuntime()) return null;
  return NativeProvider.selectPlayerTrack(options);
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
  listener: (event: NativePlayerTracks) => void
): Promise<PluginListenerHandle> | null {
  if (!isNativeAndroidRuntime()) return null;
  return NativeProvider.addListener('playerTracks', listener);
}

export function addNativeAndroidPlayerDiagnosticsListener(
  listener: (event: NativePlayerDiagnostics) => void
): Promise<PluginListenerHandle> | null {
  if (!isNativeAndroidRuntime()) return null;
  return NativeProvider.addListener('playerDiagnostics', listener);
}

export async function stopNativeAndroidMedia(): Promise<void> {
  if (!isNativeAndroidRuntime()) return;
  await NativeProvider.stopMedia();
}

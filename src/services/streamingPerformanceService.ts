/**
 * Get Smart Media Player — Streaming Performance & Smart Playback Engine
 * Provides resilient, anti-buffering playback optimization across HLS.js,
 * native video, and multi-view streams.
 */

import Hls, { HlsConfig } from 'hls.js';

export type PerformanceMode = 'auto' | 'fast' | 'balanced' | 'stable';
export type QualityPreference = 'auto' | '1080p' | '720p' | '480p' | 'low';
export type HealthRating = 'optimal' | 'good' | 'fair' | 'poor';
export type PlaybackStreamType = 'live' | 'vod' | 'episode';

export interface StreamingPerformanceConfig {
  mode: PerformanceMode;
  qualityPreference: QualityPreference;
  lowLatencyMode: boolean;
  enableVodCache: boolean;
  customMaxBuffer: number; // 0 for automatic
  maxRetryAttempts: number; // default: 3
  throttleSecondaryStream: boolean; // default: true
}

export interface StreamLevelInfo {
  id: number;
  name: string;
  width: number;
  height: number;
  bitrate: number;
}

export interface StreamHealthStats {
  state: 'idle' | 'loading' | 'playing' | 'buffering' | 'stalled' | 'recovering' | 'error';
  resolution: string;
  width: number;
  height: number;
  bitrateBps: number;
  estimatedBandwidthBps: number;
  estimatedBandwidthAvailable?: boolean;
  bufferedSeconds: number;
  liveLatencySeconds: number | null;
  rebufferCount: number;
  startupTimeMs: number | null;
  droppedFrames: number;
  totalFrames: number;
  droppedFramesAvailable?: boolean;
  protocol: string;
  autoAdaptationLevel: PerformanceMode;
  healthRating: HealthRating;
  diagnosticMessage: string;
  isSecondaryStream: boolean;
  availableLevels: StreamLevelInfo[];
  selectedLevel: number; // -1 for Auto ABR
  lastError: string | null;
}

const STORAGE_KEY = 'getsmart_streaming_performance';

const DEFAULT_CONFIG: StreamingPerformanceConfig = {
  mode: 'auto',
  qualityPreference: 'auto',
  lowLatencyMode: true,
  enableVodCache: true,
  customMaxBuffer: 0,
  maxRetryAttempts: 3,
  throttleSecondaryStream: true,
};

class StreamingPerformanceService {
  private config: StreamingPerformanceConfig;
  private listeners: Set<(config: StreamingPerformanceConfig) => void> = new Set();

  constructor() {
    this.config = this.loadConfig();
  }

  private loadConfig(): StreamingPerformanceConfig {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('Could not read streaming performance config:', e);
    }
    return { ...DEFAULT_CONFIG };
  }

  public getConfig(): StreamingPerformanceConfig {
    return { ...this.config };
  }

  public saveConfig(newConfig: Partial<StreamingPerformanceConfig>): StreamingPerformanceConfig {
    this.config = { ...this.config, ...newConfig };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
    } catch (e) {
      console.warn('Could not persist streaming performance config:', e);
    }
    this.notifyListeners();
    return { ...this.config };
  }

  public subscribe(listener: (config: StreamingPerformanceConfig) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners() {
    this.listeners.forEach((fn) => fn({ ...this.config }));
  }

  /**
   * Generates exact, materially different Hls.js configurations based on:
   * 1. Active performance mode (Fast, Balanced, Stable, or Auto-derived)
   * 2. Stream type (Live TV vs VOD/Series)
   * 3. Stream role (Primary player vs Secondary PiP/Multi-View)
   */
  public getHlsConfig(
    effectiveMode: PerformanceMode,
    streamType: PlaybackStreamType,
    isSecondaryStream: boolean = false
  ): Partial<HlsConfig> {
    const isLive = streamType === 'live';

    // Base resilient defaults across all modes
    const baseConfig: Partial<HlsConfig> = {
      enableWorker: true,
      startFragPrefetch: true,
      maxBufferHole: 0.5,
      highBufferWatchdogPeriod: 2,
      nudgeOffset: 0.2,
      nudgeMaxRetry: 4,
      fragLoadingRetryDelay: 1000,
      manifestLoadingRetryDelay: 1000,
      levelLoadingRetryDelay: 1000,
    };

    // If this is a secondary stream (Multi-View / PiP), apply throttled config so
    // it never consumes bandwidth/decoder resources needed by the primary stream
    if (isSecondaryStream && this.config.throttleSecondaryStream) {
      return {
        ...baseConfig,
        lowLatencyMode: false,
        backBufferLength: 15,
        maxBufferLength: isLive ? 6 : 15,
        maxMaxBufferLength: isLive ? 10 : 25,
        maxBufferSize: 20 * 1024 * 1024, // 20 MB max buffer
        fragLoadingTimeOut: 12000,
        fragLoadingMaxRetry: 2,
        abrBandWidthFactor: 0.7, // Conservative bitrate target
        abrMaxWithRealBitrate: true,
        liveSyncDuration: 8,
        liveMaxLatencyDuration: 18,
      };
    }

    switch (effectiveMode) {
      case 'fast':
        if (isLive) {
          return {
            ...baseConfig,
            lowLatencyMode: this.config.lowLatencyMode,
            backBufferLength: 20,
            maxBufferLength: this.config.customMaxBuffer || 6, // 6s buffer for fast startup
            maxMaxBufferLength: 10,
            maxBufferSize: 35 * 1024 * 1024,
            liveSyncDuration: 3.0, // Tight 3-second live sync for sports/news
            liveMaxLatencyDuration: 7.0, // Catch up quickly if drifting
            fragLoadingTimeOut: 8000,
            fragLoadingMaxRetry: 2,
            fragLoadingRetryDelay: 500,
            manifestLoadingTimeOut: 8000,
            manifestLoadingMaxRetry: 2,
            levelLoadingTimeOut: 8000,
            abrBandWidthFactor: 0.88, // Responsive quality switching
            abrBandWidthUpFactor: 0.75,
            testBandwidth: true,
          };
        } else {
          // VOD Fast
          return {
            ...baseConfig,
            backBufferLength: 45,
            maxBufferLength: this.config.customMaxBuffer || 25,
            maxMaxBufferLength: 45,
            maxBufferSize: 60 * 1024 * 1024,
            fragLoadingTimeOut: 10000,
            fragLoadingMaxRetry: 2,
            abrBandWidthFactor: 0.88,
          };
        }

      case 'balanced':
        if (isLive) {
          return {
            ...baseConfig,
            lowLatencyMode: this.config.lowLatencyMode,
            backBufferLength: 45,
            maxBufferLength: this.config.customMaxBuffer || 15, // 15s forward cushion
            maxMaxBufferLength: 30,
            maxBufferSize: 60 * 1024 * 1024,
            liveSyncDuration: 7.0, // 7-second balanced live sync
            liveMaxLatencyDuration: 16.0,
            fragLoadingTimeOut: 15000,
            fragLoadingMaxRetry: 3,
            fragLoadingRetryDelay: 1000,
            manifestLoadingTimeOut: 15000,
            manifestLoadingMaxRetry: 3,
            levelLoadingTimeOut: 15000,
            abrBandWidthFactor: 0.82,
            abrBandWidthUpFactor: 0.7,
          };
        } else {
          // VOD Balanced
          return {
            ...baseConfig,
            backBufferLength: 90,
            maxBufferLength: this.config.customMaxBuffer || 45,
            maxMaxBufferLength: 90,
            maxBufferSize: 100 * 1024 * 1024,
            fragLoadingTimeOut: 16000,
            fragLoadingMaxRetry: 3,
            abrBandWidthFactor: 0.82,
          };
        }

      case 'stable':
        if (isLive) {
          return {
            ...baseConfig,
            lowLatencyMode: false, // Turn off aggressive low latency for stability
            backBufferLength: 90,
            maxBufferLength: this.config.customMaxBuffer || 35, // Deep 35s forward buffer
            maxMaxBufferLength: 70,
            maxBufferSize: 120 * 1024 * 1024,
            liveSyncDuration: 16.0, // 16-second live cushion to absorb provider jitter
            liveMaxLatencyDuration: 35.0,
            fragLoadingTimeOut: 24000,
            fragLoadingMaxRetry: 5,
            fragLoadingRetryDelay: 1500,
            manifestLoadingTimeOut: 24000,
            manifestLoadingMaxRetry: 4,
            levelLoadingTimeOut: 24000,
            abrBandWidthFactor: 0.72, // Conservative bitrate target to prevent stutter
            abrBandWidthUpFactor: 0.55,
          };
        } else {
          // VOD Stable
          return {
            ...baseConfig,
            backBufferLength: 120,
            maxBufferLength: this.config.customMaxBuffer || 90, // 90s forward buffer for movies
            maxMaxBufferLength: 180,
            maxBufferSize: 180 * 1024 * 1024,
            fragLoadingTimeOut: 25000,
            fragLoadingMaxRetry: 5,
            fragLoadingRetryDelay: 1500,
            abrBandWidthFactor: 0.72,
          };
        }

      case 'auto':
      default:
        // Auto mode initial profile defaults to Balanced
        return this.getHlsConfig('balanced', streamType, isSecondaryStream);
    }
  }

  /**
   * Helper to format bitrates cleanly
   */
  public formatBitrate(bps: number): string {
    if (!bps || bps <= 0) return '—';
    if (bps >= 1_000_000) {
      return `${(bps / 1_000_000).toFixed(1)} Mbps`;
    }
    return `${Math.round(bps / 1_000)} Kbps`;
  }

  /**
   * Safe persistent VOD & asset cache helper.
   * Caches metadata, artwork, and non-tokenized assets via CacheStorage.
   * Never stores live tokenized IPTV stream credentials.
   */
  public async cacheVodAsset(url: string): Promise<void> {
    if (!this.config.enableVodCache || !('caches' in window)) return;
    try {
      // Don't cache live urls or authenticated tokens
      if (url.includes('/live/') || url.includes('token=') || url.includes('.m3u8')) return;
      const cache = await caches.open('getsmart-vod-metadata-v1');
      await cache.add(url);
    } catch {
      // Ignore cache failure
    }
  }

  /**
   * Clears persistent VOD/artwork cache
   */
  public async clearCache(): Promise<boolean> {
    if (!('caches' in window)) return false;
    try {
      const keys = await caches.keys();
      for (const key of keys) {
        if (key.startsWith('getsmart-')) {
          await caches.delete(key);
        }
      }
      return true;
    } catch {
      return false;
    }
  }
}

export const streamingPerformanceService = new StreamingPerformanceService();

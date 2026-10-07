/**
 * Hook to monitor playback health, provide smart auto-adaptation,
 * and implement bounded recovery with real-time diagnostics.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import Hls from 'hls.js';
import {
  streamingPerformanceService,
  StreamHealthStats,
  PerformanceMode,
  HealthRating,
  PlaybackStreamType,
  StreamLevelInfo,
} from '../services/streamingPerformanceService';

interface UseStreamHealthTrackerParams {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  hlsRef: React.RefObject<Hls | null>;
  streamType: PlaybackStreamType;
  isSecondaryStream?: boolean;
  streamUrl: string;
}

const INITIAL_HEALTH_STATS: StreamHealthStats = {
  state: 'loading',
  resolution: '—',
  width: 0,
  height: 0,
  bitrateBps: 0,
  estimatedBandwidthBps: 0,
  bufferedSeconds: 0,
  liveLatencySeconds: null,
  rebufferCount: 0,
  startupTimeMs: null,
  droppedFrames: 0,
  totalFrames: 0,
  protocol: 'Detecting...',
  autoAdaptationLevel: 'balanced',
  healthRating: 'good',
  diagnosticMessage: 'Analyzing stream connection...',
  isSecondaryStream: false,
  availableLevels: [],
  selectedLevel: -1,
  lastError: null,
};

export function useStreamHealthTracker({
  videoRef,
  hlsRef,
  streamType,
  isSecondaryStream = false,
  streamUrl,
}: UseStreamHealthTrackerParams) {
  const [stats, setStats] = useState<StreamHealthStats>({
    ...INITIAL_HEALTH_STATS,
    isSecondaryStream,
  });

  const config = streamingPerformanceService.getConfig();
  const startTimeRef = useRef<number>(Date.now());
  const stallEventsRef = useRef<number[]>([]); // timestamps of recent stalls
  const mediaRecoveryCountRef = useRef<number>(0);
  const networkRecoveryCountRef = useRef<number>(0);
  const lastHealthyTimeRef = useRef<number>(Date.now());
  const lastStallRecordedAtRef = useRef<number>(0);
  const currentAdaptationRef = useRef<PerformanceMode>(
    config.mode === 'auto' ? 'balanced' : config.mode
  );

  // Reset trackers when stream changes
  useEffect(() => {
    startTimeRef.current = Date.now();
    stallEventsRef.current = [];
    mediaRecoveryCountRef.current = 0;
    networkRecoveryCountRef.current = 0;
    lastHealthyTimeRef.current = Date.now();
    lastStallRecordedAtRef.current = 0;
    currentAdaptationRef.current = config.mode === 'auto' ? 'balanced' : config.mode;

    setStats((prev) => ({
      ...INITIAL_HEALTH_STATS,
      isSecondaryStream,
      autoAdaptationLevel: currentAdaptationRef.current,
      protocol: streamUrl.includes('.m3u8')
        ? Hls.isSupported()
          ? 'HLS (Adaptive Stream)'
          : 'Native Apple HLS'
        : 'Direct Stream (MP4/Progressive)',
    }));
  }, [streamUrl, isSecondaryStream, config.mode]);

  // Handle Level Selection (Auto vs Manual)
  const setQualityLevel = useCallback(
    (levelIndex: number) => {
      const hls = hlsRef.current;
      if (hls) {
        hls.currentLevel = levelIndex;
        setStats((prev) => ({
          ...prev,
          selectedLevel: levelIndex,
          diagnosticMessage:
            levelIndex === -1
              ? 'Adaptive Bitrate (ABR) enabled'
              : `Locked to ${prev.availableLevels.find((l) => l.id === levelIndex)?.name || 'custom quality'}`,
        }));
      }
    },
    [hlsRef]
  );

  // Set up polling telemetry & adaptive engine
  useEffect(() => {
    const interval = setInterval(() => {
      const video = videoRef.current;
      const hls = hlsRef.current;
      if (!video) return;

      const now = Date.now();

      // Clean up stall events older than 60 seconds
      stallEventsRef.current = stallEventsRef.current.filter((t) => now - t < 60000);
      const recentStallsCount = stallEventsRef.current.length;

      // 1. Calculate Forward Buffer ahead of playhead
      let forwardBuffer = 0;
      if (video.buffered && video.buffered.length > 0) {
        const ct = video.currentTime;
        for (let i = 0; i < video.buffered.length; i++) {
          const start = video.buffered.start(i);
          const end = video.buffered.end(i);
          if (ct >= start && ct <= end) {
            forwardBuffer = end - ct;
            break;
          }
        }
      }

      // 2. Measure Live Latency
      let liveLatency: number | null = null;
      if (streamType === 'live') {
        if (hls && hls.liveSyncPosition) {
          liveLatency = Math.max(0, hls.liveSyncPosition - video.currentTime);
        } else if (Number.isFinite(video.duration) && video.duration > 0) {
          liveLatency = Math.max(0, video.duration - video.currentTime);
        }
      }

      // 3. Measure Dropped Frames
      let droppedFrames = 0;
      let totalFrames = 0;
      if ('getVideoPlaybackQuality' in video) {
        const quality = video.getVideoPlaybackQuality();
        droppedFrames = quality.droppedVideoFrames;
        totalFrames = quality.totalVideoFrames;
      }

      // 4. Extract Bitrate and Bandwidth
      let bitrateBps = 0;
      let estimatedBandwidthBps = 0;
      const availableLevels: StreamLevelInfo[] = [];
      let selectedLevel = -1;

      if (hls) {
        estimatedBandwidthBps = hls.bandwidthEstimate || 0;
        selectedLevel = hls.currentLevel;

        if (hls.levels && hls.levels.length > 0) {
          hls.levels.forEach((lvl, idx) => {
            availableLevels.push({
              id: idx,
              name: lvl.height ? `${lvl.height}p` : `Track ${idx + 1}`,
              width: lvl.width || 0,
              height: lvl.height || 0,
              bitrate: lvl.bitrate || 0,
            });
          });

          const currentLvl = hls.levels[hls.currentLevel];
          if (currentLvl) {
            bitrateBps = currentLvl.bitrate || 0;
          }
        }
      }

      // 5. Determine Playback State
      let playbackState: StreamHealthStats['state'] = 'playing';
      if (video.error) {
        playbackState = 'error';
      } else if (video.paused && video.currentTime === 0) {
        playbackState = 'loading';
      } else if (video.seeking) {
        playbackState = 'buffering';
      } else if (video.readyState < 3 && !video.paused) {
        playbackState = 'buffering';
      }

      // 6. AUTO-ADAPTATION ENGINE
      let targetAdaptation: PerformanceMode = currentAdaptationRef.current;
      let diagnostic = 'Stream playback is healthy and continuous.';

      if (config.mode === 'auto') {
        if (recentStallsCount >= 2) {
          // Repeated stalls detected: elevate to Stable mode parameters
          if (targetAdaptation !== 'stable') {
            targetAdaptation = 'stable';
            currentAdaptationRef.current = 'stable';
            diagnostic =
              'Auto-adapted to Stable buffer after repeated playback stalls; increasing the buffer cushion.';

            // Dynamically reconfigure live Hls instance for deeper buffer
            if (hls && streamType === 'live') {
              hls.config.maxBufferLength = 35;
              hls.config.maxMaxBufferLength = 70;
              hls.config.liveSyncDuration = 16.0;
              hls.config.lowLatencyMode = false;
              hls.config.abrBandWidthFactor = 0.72;
            }
          }
        } else if (recentStallsCount === 1) {
          // Single stall: adjust towards Balanced
          if (targetAdaptation === 'fast') {
            targetAdaptation = 'balanced';
            currentAdaptationRef.current = 'balanced';
            diagnostic = 'Auto-adapted to Balanced: buffered cushion increased to 15s.';
            if (hls && streamType === 'live') {
              hls.config.maxBufferLength = 15;
              hls.config.liveSyncDuration = 7.0;
              hls.config.abrBandWidthFactor = 0.82;
            }
          }
        } else {
          // No stalls in last 60 seconds
          if (now - lastHealthyTimeRef.current > 75000 && forwardBuffer > 12) {
            // Sustained healthy playback: can relax buffer towards balanced
            if (targetAdaptation === 'stable') {
              targetAdaptation = 'balanced';
              currentAdaptationRef.current = 'balanced';
              diagnostic = 'Playback stabilized. Restored Balanced playback settings.';
              lastHealthyTimeRef.current = now;

              if (hls && streamType === 'live') {
                const balanced = streamingPerformanceService.getHlsConfig('balanced', streamType, isSecondaryStream);
                Object.assign(hls.config, balanced);
              }
            }
          }
        }
      } else {
        targetAdaptation = config.mode;
        if (config.mode === 'fast') {
          diagnostic = 'Fast Startup Mode: minimal buffer depth prioritized for instant channel changes.';
        } else if (config.mode === 'stable') {
          diagnostic = 'Stable Mode: deep buffer cushion active to prevent stream stuttering.';
        } else {
          diagnostic = 'Balanced Mode: standard buffer protection active.';
        }
      }

      // If secondary stream in multi-view, inform user
      if (isSecondaryStream) {
        diagnostic += ' (Secondary view: bandwidth throttled to preserve primary playback).';
      }

      // 7. Calculate Overall Health Rating
      let rating: HealthRating = 'optimal';
      if (recentStallsCount >= 2 || (droppedFrames > 30 && totalFrames > 0 && droppedFrames / totalFrames > 0.15)) {
        rating = 'poor';
      } else if (recentStallsCount === 1 || forwardBuffer < 2.0) {
        rating = 'fair';
      } else if (forwardBuffer >= 5.0) {
        rating = 'optimal';
      } else {
        rating = 'good';
      }

      const resText =
        video.videoWidth > 0 && video.videoHeight > 0
          ? `${video.videoWidth}x${video.videoHeight}`
          : '—';

      setStats((prev) => ({
        ...prev,
        state: playbackState,
        resolution: resText,
        width: video.videoWidth || 0,
        height: video.videoHeight || 0,
        bitrateBps,
        estimatedBandwidthBps,
        bufferedSeconds: parseFloat(forwardBuffer.toFixed(1)),
        liveLatencySeconds: liveLatency !== null ? parseFloat(liveLatency.toFixed(1)) : null,
        rebufferCount: prev.rebufferCount,
        droppedFrames,
        totalFrames,
        autoAdaptationLevel: targetAdaptation,
        healthRating: rating,
        diagnosticMessage: diagnostic,
        availableLevels,
        selectedLevel,
      }));
    }, 1000);

    return () => clearInterval(interval);
  }, [videoRef, hlsRef, streamType, config.mode, isSecondaryStream]);

  // Hook into video and Hls events for stall/rebuffer detection & error recovery
  const recordStall = useCallback(() => {
    const now = Date.now();

    // Browsers commonly emit both "waiting" and "stalled" for the same
    // interruption. Treat events within 1.5s as one rebuffer incident.
    if (now - lastStallRecordedAtRef.current < 1500) {
      setStats((prev) => ({ ...prev, state: 'buffering' }));
      return;
    }

    lastStallRecordedAtRef.current = now;
    stallEventsRef.current.push(now);
    lastHealthyTimeRef.current = now;
    setStats((prev) => ({
      ...prev,
      rebufferCount: prev.rebufferCount + 1,
      state: 'buffering',
    }));
  }, []);

  const handleFirstFrame = useCallback(() => {
    const startupDuration = Date.now() - startTimeRef.current;
    lastHealthyTimeRef.current = Date.now();
    setStats((prev) => ({
      ...prev,
      startupTimeMs: startupDuration,
      state: 'playing',
    }));
  }, []);

  // Bounded recovery trigger
  const triggerBoundedRecovery = useCallback(
    (type: 'media' | 'network', errorDetails?: string) => {
      const hls = hlsRef.current;
      const video = videoRef.current;
      if (!hls || !video) return false;

      const maxRetries = config.maxRetryAttempts || 3;

      if (type === 'media') {
        if (mediaRecoveryCountRef.current < maxRetries) {
          mediaRecoveryCountRef.current += 1;
          const attempt = mediaRecoveryCountRef.current;
          console.warn(`[StreamingPerformance] Attempting media recovery (${attempt}/${maxRetries})`);

          setStats((prev) => ({
            ...prev,
            state: 'recovering',
            diagnosticMessage: `Hardware media decoder recovery in progress (attempt ${attempt}/${maxRetries})...`,
          }));

          if (attempt === 1) {
            hls.recoverMediaError();
          } else if (attempt === 2) {
            hls.swapAudioCodec();
            hls.recoverMediaError();
          } else {
            // Nudge playhead or reload media element
            video.currentTime += 0.2;
            hls.startLoad();
          }
          return true;
        } else {
          setStats((prev) => ({
            ...prev,
            state: 'error',
            lastError: 'Fatal media decode error. Stream format incompatible with device decoder.',
            diagnosticMessage: 'Device media decoder failed after 3 recovery attempts.',
          }));
          return false;
        }
      }

      if (type === 'network') {
        if (networkRecoveryCountRef.current < maxRetries) {
          networkRecoveryCountRef.current += 1;
          const attempt = networkRecoveryCountRef.current;
          const backoffDelay = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s

          console.warn(
            `[StreamingPerformance] Attempting network reload (${attempt}/${maxRetries}) in ${backoffDelay}ms`
          );

          setStats((prev) => ({
            ...prev,
            state: 'recovering',
            diagnosticMessage: `Network or source interruption detected. Reconnecting (${attempt}/${maxRetries})...`,
          }));

          setTimeout(() => {
            if (hlsRef.current) {
              hlsRef.current.startLoad();
            }
          }, backoffDelay);
          return true;
        } else {
          setStats((prev) => ({
            ...prev,
            state: 'error',
            lastError: errorDetails || 'Stream source unreachable after 3 reconnect attempts.',
            diagnosticMessage:
              'Playback could not reconnect. The source, network path, or connection may be unavailable.',
          }));
          return false;
        }
      }

      return false;
    },
    [hlsRef, videoRef, config.maxRetryAttempts]
  );

  return {
    stats,
    recordStall,
    handleFirstFrame,
    triggerBoundedRecovery,
    setQualityLevel,
  };
}

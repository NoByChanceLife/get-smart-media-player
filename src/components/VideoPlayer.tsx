import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Tv,
  ArrowLeft,
  List,
  RotateCw,
  PictureInPicture2,
  ChevronRight,
  ChevronLeft,
  Sliders,
  Sparkles,
  Radio,
  Square,
  Home,
  Gauge,
} from 'lucide-react';
import { PlaybackTarget, XtreamLiveStream, XtreamEPGProgramme } from '../types/xtream';
import { xtreamService } from '../services/xtreamClient';
import {
  addNativeAndroidPlayerCommandListener,
  addNativeAndroidPlayerErrorListener,
  addNativeAndroidPlayerStateListener,
  controlNativeAndroidMedia,
  isNativeAndroidRuntime,
  playNativeAndroidMedia,
  setNativeAndroidPlayerVisible,
  stopNativeAndroidMedia,
  updateNativeAndroidPlayerMetadata,
} from '../services/androidProviderTransport';
import { resolveStalkerStreamLink } from '../services/stalkerClient';
import { streamingPerformanceService } from '../services/streamingPerformanceService';
import { useStreamHealthTracker } from '../hooks/useStreamHealthTracker';
import { StreamHealthPanel } from './StreamHealthPanel';
import { Activity, CheckCircle } from 'lucide-react';

interface VideoPlayerProps {
  target: PlaybackTarget;
  onClose: () => void;
  onStop: () => void;
  onMinimizeToPiP?: () => void;
  onLaunchDualPiP?: (secondTarget: PlaybackTarget) => void;
  allLiveStreams?: XtreamLiveStream[];
  onSelectLiveStream?: (stream: XtreamLiveStream) => void;
  onOpenPerformanceSettings?: () => void;
  onOpenGuide?: () => void;
  isVisuallyHidden?: boolean;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  target,
  onClose,
  onStop,
  onMinimizeToPiP,
  onLaunchDualPiP,
  allLiveStreams = [],
  onSelectLiveStream,
  onOpenPerformanceSettings,
  onOpenGuide,
  isVisuallyHidden = false,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const nativeAndroid = isNativeAndroidRuntime();

  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(1);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showControls, setShowControls] = useState<boolean>(true);
  const [showChannelDrawer, setShowChannelDrawer] = useState<boolean>(false);
  const [aspectRatio, setAspectRatio] = useState<'contain' | 'cover' | 'fill'>('contain');
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [epgList, setEpgList] = useState<XtreamEPGProgramme[]>([]);
  const [showHealthPanel, setShowHealthPanel] = useState<boolean>(false);

  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Keep callbacks used by the global media-key listener stable. Recreating the
  // listener must never participate in stream initialization or HLS teardown.
  const isVisuallyHiddenRef = useRef(isVisuallyHidden);
  const onCloseRef = useRef(onClose);
  const onStopRef = useRef(onStop);
  const onOpenGuideRef = useRef(onOpenGuide);
  const allLiveStreamsRef = useRef(allLiveStreams);
  const onSelectLiveStreamRef = useRef(onSelectLiveStream);

  useEffect(() => { isVisuallyHiddenRef.current = isVisuallyHidden; }, [isVisuallyHidden]);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => { onStopRef.current = onStop; }, [onStop]);
  useEffect(() => { onOpenGuideRef.current = onOpenGuide; }, [onOpenGuide]);
  useEffect(() => { allLiveStreamsRef.current = allLiveStreams; }, [allLiveStreams]);
  useEffect(() => { onSelectLiveStreamRef.current = onSelectLiveStream; }, [onSelectLiveStream]);

  // Derive title and current info
  const title =
    target.type === 'live'
      ? target.stream.name
      : target.type === 'vod'
      ? target.movie.name
      : `${target.series.name} - S${target.seasonNum}E${target.episode.episode_num}: ${target.episode.title}`;

  const currentProgramTitle =
    target.type === 'live'
      ? epgList[0]?.title || target.stream.currentProgram || 'Live TV'
      : target.type === 'vod'
      ? target.movie.plot || 'Feature Film Presentation'
      : target.episode.info?.plot || 'Episode Broadcast';

  const nextProgramTitle =
    target.type === 'live' ? epgList[1]?.title : null;

  // Resolve stream URL
  const getStreamUrl = useCallback((): string => {
    if (target.type === 'live') {
      if (target.stream.direct_source) {
        if (target.stream.direct_source.startsWith('https://')) return target.stream.direct_source;
        return `/api/xtream/stream?url=${encodeURIComponent(target.stream.direct_source)}`;
      }
      return xtreamService.buildStreamUrl('live', target.stream.stream_id, undefined, undefined, target.stream.serverId);
    } else if (target.type === 'vod') {
      if (target.movie.direct_source) {
        if (target.movie.direct_source.startsWith('https://')) return target.movie.direct_source;
        return `/api/xtream/stream?url=${encodeURIComponent(target.movie.direct_source)}`;
      }
      return xtreamService.buildStreamUrl('vod', target.movie.stream_id, target.movie.container_extension || 'mp4', undefined, target.movie.serverId);
    } else {
      const direct = target.episode.video_url || target.episode.direct_source;
      if (direct) {
        if (direct.startsWith('https://')) return direct;
        return `/api/xtream/stream?url=${encodeURIComponent(direct)}`;
      }
      return xtreamService.buildStreamUrl('series', target.episode.id, target.episode.container_extension || 'mp4', undefined, target.series.serverId);
    }
  }, [target]);

  const streamUrl = getStreamUrl();

  // Stable logical identity for the active media item. UI/EPG changes must not
  // tear down and recreate the same media session.
  const playbackIdentity =
    target.type === 'live'
      ? `live:${target.stream.serverId || 'local'}:${target.stream.stream_id}`
      : target.type === 'vod'
      ? `vod:${target.movie.serverId || 'local'}:${target.movie.stream_id}`
      : `episode:${target.series.serverId || 'local'}:${target.episode.id}`;
  const playbackTargetRef = useRef(target);
  const getStreamUrlRef = useRef(getStreamUrl);
  const playbackTitleRef = useRef(title);
  const playbackProgramRef = useRef(currentProgramTitle);
  useEffect(() => { playbackTargetRef.current = target; }, [target]);
  useEffect(() => { getStreamUrlRef.current = getStreamUrl; }, [getStreamUrl]);
  useEffect(() => { playbackTitleRef.current = title; }, [title]);
  useEffect(() => { playbackProgramRef.current = currentProgramTitle; }, [currentProgramTitle]);

  // Android owns the real Media3 surface. Keep the React session synchronized
  // through native player events instead of inferring state from the hidden HTML video.
  useEffect(() => {
    if (!nativeAndroid) return;

    let cancelled = false;
    const handles: Array<{ remove: () => Promise<void> }> = [];

    const register = async () => {
      const statePromise = addNativeAndroidPlayerStateListener((state) => {
        setIsPlaying(Boolean(state.isPlaying));
        setIsLoading(state.playbackState === 'buffering' || state.playbackState === 'idle');
        setCurrentTime(Math.max(0, state.positionMs || 0) / 1000);
        setDuration(Math.max(0, state.durationMs || 0) / 1000);
        const nextVolume = Math.max(0, Math.min(1, state.volume ?? 1));
        setVolume(nextVolume);
        setIsMuted(nextVolume === 0);
      });
      const commandPromise = addNativeAndroidPlayerCommandListener((event) => {
        const playbackTarget = playbackTargetRef.current;

        if (event.command === 'stop') {
          onStopRef.current();
          return;
        }

        if (event.command === 'guide' || event.command === 'back') {
          onOpenGuideRef.current?.();
          return;
        }

        if (
          playbackTarget.type === 'live' &&
          (event.command === 'channelPrevious' || event.command === 'channelNext')
        ) {
          const streams = allLiveStreamsRef.current;
          const selectStream = onSelectLiveStreamRef.current;
          if (!selectStream || streams.length === 0) return;

          const currentIndex = streams.findIndex(
            (stream) => String(stream.stream_id) === String(playbackTarget.stream.stream_id)
          );
          if (currentIndex < 0) return;

          const nextIndex =
            event.command === 'channelPrevious'
              ? (currentIndex - 1 + streams.length) % streams.length
              : (currentIndex + 1) % streams.length;
          selectStream(streams[nextIndex]);
        }
      });
      const errorPromise = addNativeAndroidPlayerErrorListener((event) => {
        setIsLoading(false);
        setErrorMsg('Native playback stopped.');
        setErrorDetail(`${event.errorCodeName || 'PLAYER_ERROR'} · ${event.message || 'Unknown playback error'}`);
      });

      for (const pending of [statePromise, commandPromise, errorPromise]) {
        if (!pending) continue;
        const handle = await pending;
        if (cancelled) {
          await handle.remove();
        } else {
          handles.push(handle);
        }
      }
    };

    register().catch(() => undefined);

    return () => {
      cancelled = true;
      handles.forEach((handle) => {
        handle.remove().catch(() => undefined);
      });
    };
  }, [nativeAndroid]);

  // EPG/current-program information can arrive after playback has already
  // started. Refresh the native Get Smart OSD without restarting the stream.
  useEffect(() => {
    if (!nativeAndroid) return;

    const channelNumber =
      target.type === 'live'
        ? String(target.stream.num || target.stream.stream_id)
        : '';

    updateNativeAndroidPlayerMetadata({
      title,
      channelNumber,
      currentProgram: currentProgramTitle,
      nextProgram: nextProgramTitle || '',
    }).catch(() => undefined);
  }, [nativeAndroid, title, currentProgramTitle, nextProgramTitle, target]);

  // Browsing/guide presentation hides only the native surface. The Media3
  // session continues underneath so returning to Watch does not restart playback.
  useEffect(() => {
    if (!nativeAndroid) return;
    setNativeAndroidPlayerVisible(!isVisuallyHidden).catch(() => undefined);
  }, [nativeAndroid, isVisuallyHidden]);

  // Stop/release the native session only when the player component itself is
  // unmounted (explicit Stop or replacement of the playback owner), not on every
  // channel/media identity change.
  useEffect(() => {
    if (!nativeAndroid) return;
    return () => {
      stopNativeAndroidMedia().catch(() => undefined);
    };
  }, [nativeAndroid]);

  // Playback health tracking, auto-adaptation & bounded recovery
  const {
    stats,
    recordStall,
    handleFirstFrame,
    triggerBoundedRecovery,
    setQualityLevel,
  } = useStreamHealthTracker({
    videoRef,
    hlsRef,
    streamType: target.type,
    isSecondaryStream: false,
    streamUrl,
  });

  // Load EPG if live
  useEffect(() => {
    if (target.type === 'live') {
      xtreamService.getEPG(target.stream.stream_id).then((epg) => {
        setEpgList(epg);
      });
    }
  }, [target]);

  // Initialize playback
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let isCancelled = false;
    setIsLoading(true);
    setErrorMsg(null);
    setErrorDetail(null);

    const initStream = async () => {
      const playbackTarget = playbackTargetRef.current;
      let resolvedUrl = getStreamUrlRef.current();

      // If channel is a Stalker channel requiring dynamic link creation (cmd without direct_source)
      if (
        playbackTarget.type === 'live' &&
        !playbackTarget.stream.direct_source &&
        playbackTarget.stream.custom_sid &&
        playbackTarget.stream.serverId
      ) {
        const profile = xtreamService.getActiveProfiles().find((p) => p.id === playbackTarget.stream.serverId);
        if (profile?.type === 'stalker' && profile.stbConfig) {
          try {
            const dynamicUrl = await resolveStalkerStreamLink(
              profile.stbConfig,
              playbackTarget.stream.custom_sid,
              profile.id
            );
            if (dynamicUrl) {
              resolvedUrl = dynamicUrl.startsWith('https://')
                ? dynamicUrl
                : `/api/xtream/stream?url=${encodeURIComponent(dynamicUrl)}`;
            }
          } catch (err: unknown) {
            if (!isCancelled) {
              const error = err as Error;
              setErrorMsg(error.message || 'Failed to resolve Stalker portal channel stream link.');
              setIsLoading(false);
            }
            return;
          }
        }
      }

      if (isCancelled) return;

      // Android APKs do not run server.ts. Route provider media directly into
      // Get Smart's persistent native Media3 player. Channel changes update the
      // same player instance instead of tearing it down or opening another app.
      if (nativeAndroid) {
        try {
          let nativeUrl = resolvedUrl;
          if (nativeUrl.startsWith('/api/xtream/stream?url=')) {
            const encoded = nativeUrl.split('?url=')[1] || '';
            nativeUrl = decodeURIComponent(encoded);
          }

          await playNativeAndroidMedia({
            url: nativeUrl,
            title: playbackTitleRef.current,
            mediaType: playbackTarget.type === 'episode' ? 'series' : playbackTarget.type,
            channelNumber:
              playbackTarget.type === 'live'
                ? String(playbackTarget.stream.num || playbackTarget.stream.stream_id)
                : '',
            currentProgram: playbackProgramRef.current,
            nextProgram: playbackTarget.type === 'live' ? (epgList[1]?.title || '') : '',
          });

          xtreamService.addToHistory({
            id:
              playbackTarget.type === 'live'
                ? `live_${playbackTarget.stream.stream_id}`
                : playbackTarget.type === 'vod'
                ? `vod_${playbackTarget.movie.stream_id}`
                : `ep_${playbackTarget.episode.id}`,
            type: playbackTarget.type,
            title: playbackTitleRef.current,
            subtitle: playbackProgramRef.current,
            icon:
              playbackTarget.type === 'live'
                ? playbackTarget.stream.stream_icon
                : playbackTarget.type === 'vod'
                ? playbackTarget.movie.stream_icon
                : playbackTarget.series.cover,
          });

          if (!isCancelled) {
            setErrorMsg(null);
            setErrorDetail(null);
          }
        } catch (err: unknown) {
          if (!isCancelled) {
            const error = err as Error;
            setErrorMsg(error.message || 'Native Android player could not start this stream.');
            setIsLoading(false);
          }
        }
        return;
      }

      // Preserve the upstream format hint before replacing the provider URL with
      // an opaque ticket path. Do not assume every live stream is HLS.
      let mediaHintUrl = resolvedUrl;
      if (mediaHintUrl.startsWith('/api/xtream/stream?url=')) {
        const encoded = mediaHintUrl.split('?url=')[1] || '';
        mediaHintUrl = decodeURIComponent(encoded);
      }
      const isM3u8 = /\.m3u8(?:$|[?#])/i.test(mediaHintUrl);

      // Diagnostic exception for the public Get Smart MP4 control fixture only.
      // It contains no credentials/tokens, so play it directly over HTTPS to isolate
      // the browser/video element from Get Smart's ticket/proxy pipeline.
      const isPublicPlaybackControl =
        playbackTarget.type === 'live' &&
        String(playbackTarget.stream.stream_id) === '100' &&
        resolvedUrl === 'https://archive.org/download/BigBuckBunny_124/Content/big_buck_bunny_720p_surround.mp4';
      const isPublicHlsControl =
        playbackTarget.type === 'live' &&
        ['101', '102', '103', '104'].includes(String(playbackTarget.stream.stream_id)) &&
        /^https:\/\//i.test(resolvedUrl) &&
        /\.m3u8(?:$|[?#])/i.test(resolvedUrl);

      if (!isPublicPlaybackControl && !isPublicHlsControl) {
        // Never hand a sensitive upstream HTTP URL (or legacy proxy URL containing one)
        // directly to the media element/HLS.js. Exchange it for an opaque short-lived path.
        try {
          if (resolvedUrl.startsWith('/api/xtream/stream?url=')) {
            const encoded = resolvedUrl.split('?url=')[1] || '';
            const upstreamUrl = decodeURIComponent(encoded);
            resolvedUrl = await xtreamService.createStreamTicket(upstreamUrl);
          } else if (resolvedUrl.startsWith('http://') || resolvedUrl.startsWith('https://')) {
            resolvedUrl = await xtreamService.createStreamTicket(resolvedUrl);
          }
        } catch (err: unknown) {
          if (!isCancelled) {
            const error = err as Error;
            setErrorMsg(error.message || 'Unable to prepare stream securely.');
            setIsLoading(false);
          }
          return;
        }
      }

      if (isCancelled) return;

      // Destroy existing hls instance
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      if (isM3u8 && Hls.isSupported()) {
        const perfConfig = streamingPerformanceService.getConfig();
        const hlsConfig = streamingPerformanceService.getHlsConfig(perfConfig.mode, playbackTarget.type, false);
        const hls = new Hls(hlsConfig);

        hlsRef.current = hls;
        hls.loadSource(resolvedUrl);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
          if (isCancelled) return;
          setIsLoading(false);

          // Apply quality preference if manual setting configured
          if (perfConfig.qualityPreference !== 'auto' && data.levels && data.levels.length > 0) {
            const targetHeight =
              perfConfig.qualityPreference === '1080p'
                ? 1080
                : perfConfig.qualityPreference === '720p'
                ? 720
                : perfConfig.qualityPreference === '480p'
                ? 480
                : 0;

            if (targetHeight > 0) {
              let bestIdx = -1;
              let closestDiff = 9999;
              data.levels.forEach((lvl, idx) => {
                const diff = Math.abs((lvl.height || 0) - targetHeight);
                if (diff < closestDiff) {
                  closestDiff = diff;
                  bestIdx = idx;
                }
              });
              if (bestIdx >= 0) {
                hls.currentLevel = bestIdx;
              }
            } else if (perfConfig.qualityPreference === 'low') {
              hls.currentLevel = 0; // Lowest bitrate level
            }
          }

          video.play().catch(() => {
            if (!isCancelled) setIsPlaying(false);
          });
        });

        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (isCancelled) return;
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR: {
                const recovered = triggerBoundedRecovery('network', data.details);
                if (!recovered) {
                  setErrorMsg('Stream could not be recovered after the configured reconnect attempts.');
                  setIsLoading(false);
                  hls.destroy();
                }
                break;
              }
              case Hls.ErrorTypes.MEDIA_ERROR: {
                const recovered = triggerBoundedRecovery('media', data.details);
                if (!recovered) {
                  setErrorMsg('Device media decoder error. Format may require server transcoding.');
                  setIsLoading(false);
                  hls.destroy();
                }
                break;
              }
              default:
                console.error('Fatal HLS error:', data.type, data.details);
                setErrorMsg('Playback stopped because the stream returned a fatal HLS error.');
                setIsLoading(false);
                hls.destroy();
                break;
            }
          } else {
            // Track non-fatal stalls
            if (data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR) {
              recordStall();
            }
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl') || !isM3u8) {
        // Native Safari HLS or regular MP4/MKV video
        video.src = resolvedUrl;
        video.onloadedmetadata = () => {
          if (isCancelled) return;
          setIsLoading(false);
          video.play().catch(() => {
            if (!isCancelled) setIsPlaying(false);
          });
        };
        video.onerror = () => {
          if (isCancelled) return;
          setIsLoading(false);
          const mediaError = video.error;
          const code = mediaError?.code ?? 0;
          const codeName =
            code === 1 ? 'ABORTED' :
            code === 2 ? 'NETWORK' :
            code === 3 ? 'DECODE' :
            code === 4 ? 'SRC_NOT_SUPPORTED' :
            'UNKNOWN';
          const source = isPublicPlaybackControl ? 'direct HTTPS control' : 'prepared stream';
          setErrorMsg('Video playback error.');
          setErrorDetail(`MediaError ${code} (${codeName}) · ${source}`);
        };
      } else {
        setErrorMsg('Browser does not support HLS media decoding.');
        setIsLoading(false);
      }

      // Save to watch history
      xtreamService.addToHistory({
        id:
          playbackTarget.type === 'live'
            ? `live_${playbackTarget.stream.stream_id}`
            : playbackTarget.type === 'vod'
            ? `vod_${playbackTarget.movie.stream_id}`
            : `ep_${playbackTarget.episode.id}`,
        type: playbackTarget.type,
        title: playbackTitleRef.current,
        subtitle: playbackProgramRef.current,
        icon:
          playbackTarget.type === 'live'
            ? playbackTarget.stream.stream_icon
            : playbackTarget.type === 'vod'
            ? playbackTarget.movie.stream_icon
            : playbackTarget.series.cover,
      });
    };

    initStream();

    return () => {
      isCancelled = true;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      // Native Media3 persists across media identity changes. It is released
      // only by the dedicated unmount effect above.
    };
  }, [playbackIdentity]);

  // Video event handlers
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const ct = videoRef.current.currentTime;
      setCurrentTime(ct);
      setDuration(videoRef.current.duration || 0);

      // Micro buffer-hole recovery: if stalled at tiny hole (diff < 0.4s), nudge ahead
      if (!videoRef.current.paused && videoRef.current.readyState < 3) {
        const b = videoRef.current.buffered;
        if (b && b.length > 0) {
          for (let i = 0; i < b.length; i++) {
            const diff = b.start(i) - ct;
            if (diff > 0 && diff <= 0.4) {
              videoRef.current.currentTime = b.start(i) + 0.05;
              break;
            }
          }
        }
      }
    }
  };

  const togglePlay = () => {
    if (nativeAndroid) {
      controlNativeAndroidMedia('toggle').catch(() => undefined);
      return;
    }
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const toggleMute = () => {
    if (nativeAndroid) {
      controlNativeAndroidMedia('toggleMute').catch(() => undefined);
      return;
    }
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
    setIsMuted(videoRef.current.muted);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    setIsMuted(val === 0);
    if (nativeAndroid) {
      controlNativeAndroidMedia('setVolume', { value: val }).catch(() => undefined);
      return;
    }
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const togglePiP = async () => {
    if (!videoRef.current) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await videoRef.current.requestPictureInPicture();
      }
    } catch {
      // PiP not supported or disallowed
    }
  };

  const cycleAspectRatio = () => {
    setAspectRatio((prev) => (prev === 'contain' ? 'cover' : prev === 'cover' ? 'fill' : 'contain'));
  };

  // Keyboard navigation & remote control
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // The mounted player keeps playback alive while browsing, but must not
      // own keyboard/D-pad navigation while its fullscreen surface is hidden.
      if (isVisuallyHiddenRef.current) return;
      resetControlsTimer();
      switch (e.key) {
        case 'Enter':
          // TV remote OK: reveal the lightweight player OSD even when the
          // stream is unavailable. Playback state must never hide controls.
          e.preventDefault();
          setShowControls(true);
          break;
        case ' ':
        case 'MediaPlayPause':
          e.preventDefault();
          togglePlay();
          break;
        case 'MediaPlay':
          e.preventDefault();
          if (nativeAndroid) controlNativeAndroidMedia('play').catch(() => undefined);
          else videoRef.current?.play().catch(() => undefined);
          break;
        case 'MediaPause':
          e.preventDefault();
          if (nativeAndroid) controlNativeAndroidMedia('pause').catch(() => undefined);
          else videoRef.current?.pause();
          break;
        case 'x':
        case 'X':
        case 'MediaStop':
          e.preventDefault();
          onStopRef.current();
          break;
        case 'm':
        case 'M':
          toggleMute();
          break;
        case 'h':
        case 'H':
          setShowHealthPanel((prev) => !prev);
          break;
        case 'f':
        case 'F':
          toggleFullscreen();
          break;
        case 'Escape':
        case 'Backspace':
          if (!document.fullscreenElement) {
            e.preventDefault();
            onOpenGuideRef.current?.();
          }
          break;
        case 'ArrowUp':
          if (target.type === 'live' && allLiveStreams.length > 0 && onSelectLiveStream) {
            e.preventDefault();
            const currIdx = allLiveStreams.findIndex((s) => s.stream_id === target.stream.stream_id);
            const prevIdx = currIdx > 0 ? currIdx - 1 : allLiveStreams.length - 1;
            onSelectLiveStream(allLiveStreams[prevIdx]);
          }
          break;
        case 'ArrowDown':
          if (target.type === 'live' && allLiveStreams.length > 0 && onSelectLiveStream) {
            e.preventDefault();
            const currIdx = allLiveStreams.findIndex((s) => s.stream_id === target.stream.stream_id);
            const nextIdx = currIdx < allLiveStreams.length - 1 ? currIdx + 1 : 0;
            onSelectLiveStream(allLiveStreams[nextIdx]);
          }
          break;
        case 'ArrowLeft':
          if (target.type !== 'live' && videoRef.current) {
            e.preventDefault();
            videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10);
          } else if (target.type === 'live') {
            // TV-first behavior: Left always returns to the guide, whether
            // playback is healthy, buffering, or failed.
            e.preventDefault();
            onOpenGuide?.();
          }
          break;
        case 'ArrowRight':
          if (target.type !== 'live' && videoRef.current) {
            e.preventDefault();
            videoRef.current.currentTime = Math.min(videoRef.current.duration || 0, videoRef.current.currentTime + 10);
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [target, allLiveStreams, onSelectLiveStream]);

  // Controls auto-hide timer
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 4500);
  }, []);

  const handleMouseMove = () => {
    resetControlsTimer();
  };

  const formatSeconds = (sec: number): string => {
    if (isNaN(sec) || !isFinite(sec)) return '00:00';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onClick={() => {
        // Pointer/touch on the playback canvas reveals controls only. Playback
        // changes require an explicit control, keyboard media key, or Space.
        resetControlsTimer();
        setShowControls(true);
      }}
      className={`fixed inset-0 z-50 bg-black flex items-center justify-center select-none overflow-hidden font-sans ${isVisuallyHidden ? 'pointer-events-none' : ''}`}
    >
      {/* Video Canvas */}
      <video
        ref={videoRef}
        onTimeUpdate={handleTimeUpdate}
        onWaiting={recordStall}
        onStalled={recordStall}
        onPlaying={() => {
          setIsLoading(false);
          setIsPlaying(true);
          handleFirstFrame();
        }}
        playsInline
        className={`w-full h-full ${
          aspectRatio === 'contain'
            ? 'object-contain'
            : aspectRatio === 'cover'
            ? 'object-cover'
            : 'object-fill'
        }`}
      />

      {!isVisuallyHidden && errorMsg && errorDetail && (
        <div className="absolute left-1/2 top-1/2 z-[70] w-[min(90vw,680px)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-red-400/30 bg-black/85 p-5 text-center shadow-2xl">
          <p className="text-base font-semibold text-white">{errorMsg}</p>
          <p className="mt-2 font-mono text-sm text-red-200">{errorDetail}</p>
        </div>
      )}

      {/* Loading Overlay */}
      {!isVisuallyHidden && isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-none">
          <div className="w-14 h-14 border-4 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin mb-4" />
          <p className="text-white text-sm font-semibold tracking-wide">Buffering Stream...</p>
          <span className="text-xs text-slate-400 mt-1">Connecting to Get Smart Engine</span>
        </div>
      )}

      {/* Non-blocking stream status. A dead stream must not hide the TV OSD/options. */}
      {!isVisuallyHidden && errorMsg && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center z-10 pointer-events-none">
          <div className="pointer-events-auto max-w-lg rounded-lg border border-white/10 bg-black/60 backdrop-blur-xl px-5 py-4 shadow-2xl">
            <div className="flex items-center justify-center gap-2 text-rose-300 mb-1.5">
              <Radio className="w-4 h-4" />
              <h3 className="text-sm font-bold text-white">Stream unavailable</h3>
            </div>
            <p className="text-xs text-slate-300 max-w-md">{errorMsg}</p>
            <div className="mt-3 flex items-center justify-center gap-2">
              <button
                onClick={() => {
                  setErrorMsg(null);
                  setIsLoading(true);
                  const v = videoRef.current;
                  if (v) v.load();
                }}
                className="tv-focus-target px-3 py-2 bg-white/10 hover:bg-white/15 border border-white/10 text-white rounded-lg text-xs font-semibold flex items-center gap-2"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>Retry</span>
              </button>
              <button
                onClick={onClose}
                className="tv-focus-target px-3 py-2 bg-white/10 hover:bg-white/15 border border-white/10 text-slate-200 rounded-lg text-xs font-medium"
              >
                Guide
              </button>
            </div>
            <p className="mt-2 text-[10px] text-slate-500">Press OK for player controls</p>
          </div>
        </div>
      )}

      {/* Top Header Bar */}
      <div
        className={`absolute top-0 left-0 right-0 p-3 sm:p-4 lg:p-5 bg-gradient-to-b from-black/90 via-black/50 to-transparent transition-opacity duration-300 flex items-center justify-between z-20 ${
          showControls ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-4">
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur-md flex items-center justify-center text-white transition active:scale-95"
            title="Return to App (Esc)"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              {target.type === 'live' && (
                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-rose-600 text-[11px] font-bold tracking-wider text-white uppercase animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-white" />
                  LIVE
                </span>
              )}
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight truncate max-w-xs sm:max-w-md">
                {title}
              </h2>
            </div>
            <p className="text-xs text-slate-300 mt-0.5 truncate max-w-sm sm:max-w-lg">
              {currentProgramTitle}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {target.type !== 'live' && onMinimizeToPiP && (
            <button
              onClick={onMinimizeToPiP}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#0b63f6]/28 hover:bg-[#0b63f6]/48 border border-[#2d87ff]/45 backdrop-blur-md text-xs font-semibold text-[#78c1ff] transition active:scale-95"
              title="Minimize to Floating In-App PiP"
            >
              <PictureInPicture2 className="w-4 h-4" />
              <span className="hidden sm:inline">Floating PiP</span>
            </button>
          )}

          {target.type === 'live' && allLiveStreams.length > 0 && (
            <button
              onClick={() => setShowChannelDrawer(!showChannelDrawer)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur-md text-xs font-medium text-white transition active:scale-95"
              title="Quick Channel Switcher & Multi-View"
            >
              <List className="w-4 h-4 text-[#4baeff]" />
              <span className="hidden sm:inline">Channels</span>
            </button>
          )}

          {target.type !== 'live' && (
            <>
              <button
                onClick={() => setShowHealthPanel(!showHealthPanel)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg backdrop-blur-md text-xs font-semibold transition active:scale-95 tv-focus-target ${
                  showHealthPanel ? 'bg-[#0b63f6] text-white' : 'bg-white/10 hover:bg-white/20 text-[#78c1ff]'
                }`}
                title="Stream Health & Performance Diagnostics (H)"
              >
                <Activity className="w-4 h-4" />
                <span className="hidden sm:inline">Stream Health</span>
              </button>
              <button onClick={cycleAspectRatio} className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-xs text-white">
                <span className="capitalize">{aspectRatio}</span>
              </button>
              <button onClick={togglePiP} className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white hidden sm:flex">
                <PictureInPicture2 className="w-4 h-4" />
              </button>
              <button onClick={toggleFullscreen} className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white">
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Center Big Play Indicator on Pause */}
      {!isPlaying && (
        <button
          onClick={togglePlay}
          className="absolute inset-0 m-auto w-20 h-20 rounded-full bg-[#0b63f6]/95 text-white flex items-center justify-center shadow-2xl hover:scale-105 active:scale-95 transition-all z-20"
        >
          <Play className="w-10 h-10 ml-1 fill-white" />
        </button>
      )}

      {/* Bottom OSD / Player Controls Bar */}
      <div
        className={`absolute bottom-0 left-0 right-0 p-3 sm:p-4 lg:p-5 bg-gradient-to-t from-black/90 via-black/55 to-transparent transition-opacity duration-300 z-20 ${
          showControls ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Scrubber for VOD / Episodes */}
        {target.type !== 'live' && duration > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-xs text-slate-300 font-mono mb-1.5 tabular-nums">
              <span>{formatSeconds(currentTime)}</span>
              <span>{formatSeconds(duration)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={duration}
              value={currentTime}
              onChange={(e) => {
                const newT = parseFloat(e.target.value);
                setCurrentTime(newT);
                if (videoRef.current) {
                  videoRef.current.currentTime = newT;
                }
              }}
              className="w-full h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-cyan-400"
            />
          </div>
        )}

        {/* Live Channel Info Banner & EPG Next Up */}
        {target.type === 'live' && (
          <div className="mb-4 p-3 rounded-lg bg-white/5 border border-white/10 backdrop-blur-md flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 overflow-hidden flex items-center justify-center shrink-0">
                {target.stream.stream_icon ? (
                  <img
                    src={target.stream.stream_icon}
                    alt={target.stream.name}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <Tv className="w-5 h-5 text-slate-400" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-[#4baeff] tabular-nums">
                    CH {target.stream.num || target.stream.stream_id}
                  </span>
                  <span className="text-sm font-bold text-white">{target.stream.name}</span>
                </div>
                <div className="text-xs text-slate-300 flex items-center gap-1.5 mt-0.5">
                  <span className="font-semibold text-slate-200">{currentProgramTitle}</span>
                </div>
              </div>
            </div>

            {nextProgramTitle && (
              <div className="text-left sm:text-right border-t sm:border-t-0 pt-2 sm:pt-0 border-white/10">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Up Next</span>
                <span className="text-xs text-slate-200 font-medium truncate block max-w-xs">{nextProgramTitle}</span>
              </div>
            )}
          </div>
        )}

        {/* Action Row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={togglePlay}
              className="w-10 h-10 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition active:scale-95"
              title="Play / Pause (Space)"
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5 fill-white" />}
            </button>

            <button
              onClick={onStop}
              className="tv-focus-target h-10 px-3 rounded-lg bg-rose-500/18 hover:bg-rose-500/32 border border-rose-400/35 text-rose-100 flex items-center gap-2 justify-center transition active:scale-95"
              title="Stop playback (X / Media Stop)"
            >
              <Square className="w-4 h-4 fill-current" />
              <span className="hidden sm:inline text-xs font-bold">Stop</span>
            </button>

            <button
              onClick={onClose}
              className="tv-focus-target h-10 px-3 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 text-white flex items-center gap-2 justify-center transition active:scale-95"
              title="Home / browse while playback continues"
            >
              <Home className="w-4 h-4" />
              <span className="hidden sm:inline text-xs font-semibold">Home</span>
            </button>

            {/* Quick Zap buttons for Live TV */}
            {target.type === 'live' && allLiveStreams.length > 0 && onSelectLiveStream && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    const idx = allLiveStreams.findIndex((s) => s.stream_id === target.stream.stream_id);
                    const prev = idx > 0 ? idx - 1 : allLiveStreams.length - 1;
                    onSelectLiveStream(allLiveStreams[prev]);
                  }}
                  className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition"
                  title="Previous Channel (Up Arrow)"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    const idx = allLiveStreams.findIndex((s) => s.stream_id === target.stream.stream_id);
                    const next = idx < allLiveStreams.length - 1 ? idx + 1 : 0;
                    onSelectLiveStream(allLiveStreams[next]);
                  }}
                  className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition"
                  title="Next Channel (Down Arrow)"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Volume slider */}
            <div className="flex items-center gap-2 group">
              <button
                onClick={toggleMute}
                className="w-10 h-10 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition"
                title="Mute (M)"
              >
                {isMuted || volume === 0 ? <VolumeX className="w-5 h-5 text-rose-400" /> : <Volume2 className="w-5 h-5" />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-20 sm:w-24 h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />
            </div>
          </div>

          {target.type === 'live' ? (
            <div className="hidden sm:flex items-center gap-4 text-[11px] text-white/60">
              <span><span className="text-white/90 font-semibold">OK</span> Controls</span>
              <span><span className="text-white/90 font-semibold">Space</span> Play/Pause</span>
              <span><span className="text-white/90 font-semibold">X</span> Stop</span>
              <span><span className="text-white/90 font-semibold">↑ ↓</span> Channels</span>
              <span><span className="text-white/90 font-semibold">←</span> Guide</span>
            </div>
          ) : (
            <div className="text-xs text-slate-400 hidden md:flex items-center gap-3">
              <span>[F] Fullscreen</span><span>·</span><span>[M] Mute</span><span>·</span><span>[Esc] Exit</span>
            </div>
          )}
        </div>
      </div>

      {/* Stream Health Diagnostic Panel Overlay */}
      {showHealthPanel && (
        <StreamHealthPanel
          stats={stats}
          onClose={() => setShowHealthPanel(false)}
          onSelectQuality={setQualityLevel}
          onOpenPerformanceSettings={onOpenPerformanceSettings}
        />
      )}

      {/* Slide-out Quick Channel Switcher Overlay Drawer */}
      {showChannelDrawer && target.type === 'live' && (
        <div className="absolute inset-y-0 left-0 w-[clamp(240px,28vw,320px)] max-w-[90vw] bg-[#050d17]/97 border-r border-[#17304a] backdrop-blur-xl p-3 sm:p-4 flex flex-col z-30 animate-in slide-in-from-left duration-200">
          <div className="flex items-center justify-between pb-3 border-b border-[#17304a]">
            <div className="flex items-center gap-2">
              <Tv className="w-4 h-4 text-[#4baeff]" />
              <h3 className="text-sm font-bold text-white">Channel Switcher</h3>
            </div>
            <button
              onClick={() => setShowChannelDrawer(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-white"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto mt-3 space-y-1 pr-1 custom-scrollbar">
            {allLiveStreams.map((s) => {
              const isCurrent = s.stream_id === target.stream.stream_id;
              return (
                <button
                  key={s.stream_id}
                  onClick={() => {
                    if (onSelectLiveStream) {
                      onSelectLiveStream(s);
                      setShowChannelDrawer(false);
                    }
                  }}
                  className={`w-full p-2.5 rounded-lg flex items-center gap-3 text-left transition-all ${
                    isCurrent
                      ? 'bg-cyan-500/20 border border-[#2d87ff]/45 text-white'
                      : 'hover:bg-slate-900 text-slate-300'
                  }`}
                >
                  <span className="text-xs font-mono font-bold text-[#4baeff] w-8 tabular-nums">
                    {s.num || s.stream_id}
                  </span>
                  <div className="w-7 h-7 rounded-lg bg-slate-800 overflow-hidden shrink-0 flex items-center justify-center">
                    {s.stream_icon ? (
                      <img
                        src={s.stream_icon}
                        alt={s.name}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <Tv className="w-3.5 h-3.5 text-slate-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-semibold truncate text-white">{s.name}</p>
                      {s.serverName && (
                        <span
                          className="text-[9px] px-1 py-0.2 rounded font-mono font-bold shrink-0 truncate max-w-[70px]"
                          style={{
                            backgroundColor: `${s.serverBadgeColor || '#06b6d4'}25`,
                            color: s.serverBadgeColor || '#06b6d4',
                            border: `1px solid ${s.serverBadgeColor || '#06b6d4'}40`,
                          }}
                        >
                          {s.serverName}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 truncate mt-0.5">
                      {s.currentProgram || 'Live Programming'}
                    </p>
                  </div>
                  {isCurrent ? (
                    <Radio className="w-3.5 h-3.5 text-[#4baeff] shrink-0 animate-pulse" />
                  ) : onLaunchDualPiP ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onLaunchDualPiP({ type: 'live', stream: s });
                        setShowChannelDrawer(false);
                      }}
                      className="px-2 py-1 rounded-lg bg-[#0b63f6]/28 hover:bg-[#0b63f6]/60 text-[#78c1ff] text-[10px] font-bold shrink-0 transition"
                      title="Watch in Dual PiP Multi-View"
                    >
                      + PiP
                    </button>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

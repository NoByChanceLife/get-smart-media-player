import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  Maximize2,
  X,
  Volume2,
  VolumeX,
  Repeat,
  Radio,
  Tv,
  Columns,
  Square,
  Play,
  Pause,
} from 'lucide-react';
import { PlaybackTarget, XtreamLiveStream } from '../types/xtream';
import { xtreamService } from '../services/xtreamClient';
import { streamingPerformanceService } from '../services/streamingPerformanceService';

interface FloatingPiPPlayerProps {
  primaryTarget: PlaybackTarget;
  secondaryTarget?: PlaybackTarget | null;
  onExpandPrimary: () => void;
  onClose: () => void;
  onCloseSecondary?: () => void;
  onSwapTargets?: () => void;
}

export const FloatingPiPPlayer: React.FC<FloatingPiPPlayerProps> = ({
  primaryTarget,
  secondaryTarget,
  onExpandPrimary,
  onClose,
  onCloseSecondary,
  onSwapTargets,
}) => {
  const primaryVideoRef = useRef<HTMLVideoElement | null>(null);
  const secondaryVideoRef = useRef<HTMLVideoElement | null>(null);
  const primaryHlsRef = useRef<Hls | null>(null);
  const secondaryHlsRef = useRef<Hls | null>(null);

  const [activeAudio, setActiveAudio] = useState<'primary' | 'secondary'>('primary');
  const [isPrimaryMuted, setIsPrimaryMuted] = useState(false);
  const [isSecondaryMuted, setIsSecondaryMuted] = useState(true);
  const [layoutMode, setLayoutMode] = useState<'pip_corner' | 'side_by_side'>('pip_corner');
  const [isPlaying, setIsPlaying] = useState(true);

  type ResolvedPlaybackSource = { url: string; isHls: boolean };

  const resolvePlaybackUrl = async (target: PlaybackTarget): Promise<ResolvedPlaybackSource> => {
    let streamUrl = '';

    if (target.type === 'live') {
      streamUrl =
        target.stream.direct_source ||
        xtreamService.buildStreamUrl(
          'live',
          target.stream.stream_id,
          'm3u8',
          undefined,
          target.stream.serverId
        );
    } else if (target.type === 'vod') {
      streamUrl =
        target.movie.direct_source ||
        xtreamService.buildStreamUrl(
          'vod',
          target.movie.stream_id,
          target.movie.container_extension || 'mp4',
          undefined,
          target.movie.serverId
        );
    } else {
      streamUrl =
        target.episode.video_url ||
        target.episode.direct_source ||
        xtreamService.buildStreamUrl(
          'series',
          target.episode.id,
          target.episode.container_extension || 'mp4',
          undefined,
          target.series.serverId
        );
    }

    let mediaHintUrl = streamUrl;
    if (mediaHintUrl.startsWith('/api/xtream/stream?url=')) {
      const encoded = mediaHintUrl.split('?url=')[1] || '';
      mediaHintUrl = decodeURIComponent(encoded);
    }
    const isHls = /\.m3u8(?:$|[?#])/i.test(mediaHintUrl);

    if (streamUrl.startsWith('/api/xtream/stream/')) return { url: streamUrl, isHls };

    if (streamUrl.startsWith('/api/xtream/stream?url=')) {
      const encoded = streamUrl.split('?url=')[1] || '';
      return { url: await xtreamService.createStreamTicket(decodeURIComponent(encoded)), isHls };
    }

    if (streamUrl.startsWith('http://') || streamUrl.startsWith('https://')) {
      return { url: await xtreamService.createStreamTicket(streamUrl), isHls };
    }

    return { url: streamUrl, isHls };
  };

  const attachStream = (
    video: HTMLVideoElement,
    streamUrl: string,
    isHls: boolean,
    target: PlaybackTarget,
    isSecondary: boolean,
    hlsRef: React.MutableRefObject<Hls | null>
  ) => {
    if (isHls && Hls.isSupported()) {
      const config = streamingPerformanceService.getConfig();
      const hlsConfig = streamingPerformanceService.getHlsConfig(
        config.mode,
        target.type,
        isSecondary
      );
      const hls = new Hls(hlsConfig);
      hlsRef.current = hls;
      hls.loadSource(streamUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          }
        }
      });
    } else {
      video.src = streamUrl;
      video.play().catch(() => {});
    }
  };

  // Setup primary stream
  useEffect(() => {
    const video = primaryVideoRef.current;
    if (!video) return;

    let cancelled = false;

    if (primaryHlsRef.current) {
      primaryHlsRef.current.destroy();
      primaryHlsRef.current = null;
    }

    void resolvePlaybackUrl(primaryTarget)
      .then((source) => {
        if (!cancelled) {
          attachStream(video, source.url, source.isHls, primaryTarget, false, primaryHlsRef);
        }
      })
      .catch(() => {
        if (!cancelled) video.removeAttribute('src');
      });

    return () => {
      cancelled = true;
      if (primaryHlsRef.current) {
        primaryHlsRef.current.destroy();
        primaryHlsRef.current = null;
      }
      video.removeAttribute('src');
      video.load();
    };
  }, [primaryTarget]);

  // Setup secondary stream (if dual-view is active)
  useEffect(() => {
    const video = secondaryVideoRef.current;
    if (!video || !secondaryTarget) return;

    let cancelled = false;

    if (secondaryHlsRef.current) {
      secondaryHlsRef.current.destroy();
      secondaryHlsRef.current = null;
    }

    void resolvePlaybackUrl(secondaryTarget)
      .then((source) => {
        if (!cancelled) {
          attachStream(video, source.url, source.isHls, secondaryTarget, true, secondaryHlsRef);
        }
      })
      .catch(() => {
        if (!cancelled) video.removeAttribute('src');
      });

    return () => {
      cancelled = true;
      if (secondaryHlsRef.current) {
        secondaryHlsRef.current.destroy();
        secondaryHlsRef.current = null;
      }
      video.removeAttribute('src');
      video.load();
    };
  }, [secondaryTarget]);

  // Audio routing
  useEffect(() => {
    if (primaryVideoRef.current) {
      primaryVideoRef.current.muted = activeAudio !== 'primary' || isPrimaryMuted;
    }
    if (secondaryVideoRef.current) {
      secondaryVideoRef.current.muted = activeAudio !== 'secondary' || isSecondaryMuted;
    }
  }, [activeAudio, isPrimaryMuted, isSecondaryMuted]);

  const primaryName =
    primaryTarget.type === 'live'
      ? primaryTarget.stream.name
      : primaryTarget.type === 'vod'
      ? primaryTarget.movie.name
      : primaryTarget.episode.title;

  const secondaryName =
    secondaryTarget?.type === 'live' ? secondaryTarget.stream.name : null;

  return (
    <div
      className={`fixed z-40 transition-all duration-300 ${
        secondaryTarget && layoutMode === 'side_by_side'
          ? 'bottom-20 md:bottom-6 right-4 left-4 sm:left-auto sm:w-[680px] h-64'
          : 'bottom-20 md:bottom-6 right-4 w-72 sm:w-88 aspect-video'
      } rounded-2xl overflow-hidden shadow-2xl border border-cyan-500/40 bg-slate-950 backdrop-blur-xl group`}
    >
      {/* Video Display Container */}
      <div className="relative w-full h-full flex overflow-hidden">
        {/* Primary Video */}
        <div className={`relative ${secondaryTarget && layoutMode === 'side_by_side' ? 'w-1/2 border-r border-slate-800' : 'w-full'} h-full bg-black flex items-center justify-center`}>
          <video
            ref={primaryVideoRef}
            playsInline
            className="w-full h-full object-contain"
          />

          {/* Primary stream badge */}
          <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/70 backdrop-blur-md px-2 py-0.5 rounded-lg text-[10px] text-white font-semibold">
            <Radio className="w-2.5 h-2.5 text-cyan-400 animate-pulse" />
            <span className="truncate max-w-[120px]">{primaryName}</span>
            {activeAudio === 'primary' && <Volume2 className="w-3 h-3 text-cyan-400" />}
          </div>
        </div>

        {/* Secondary Video (for Dual PiP Multi-View) */}
        {secondaryTarget && (
          <div
            className={`relative ${
              layoutMode === 'side_by_side'
                ? 'w-1/2'
                : 'absolute bottom-2 right-2 w-32 aspect-video rounded-xl overflow-hidden border border-cyan-400/50 shadow-lg'
            } h-full bg-black flex items-center justify-center`}
          >
            <video
              ref={secondaryVideoRef}
              playsInline
              className="w-full h-full object-contain"
            />

            <div className="absolute top-1 left-1 flex items-center gap-1 bg-black/70 backdrop-blur-md px-1.5 py-0.5 rounded text-[9px] text-white">
              <span className="truncate max-w-[90px]">{secondaryName}</span>
              {activeAudio === 'secondary' && <Volume2 className="w-2.5 h-2.5 text-amber-400" />}
            </div>

            {onCloseSecondary && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseSecondary();
                }}
                className="absolute top-1 right-1 p-0.5 rounded bg-black/70 text-slate-300 hover:text-white"
                title="Close Secondary Stream"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Floating Hover Controls Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/60 opacity-0 group-hover:opacity-100 transition-opacity p-2 flex flex-col justify-between pointer-events-auto">
        {/* Top Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-bold text-cyan-400 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-800/40">
              PiP Active
            </span>
            {secondaryTarget && (
              <span className="text-[10px] font-bold text-amber-400 bg-amber-950/80 px-2 py-0.5 rounded border border-amber-800/40">
                Multi-View (2 Streams)
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            {secondaryTarget && onSwapTargets && (
              <button
                onClick={onSwapTargets}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition"
                title="Swap Screens"
              >
                <Repeat className="w-3.5 h-3.5" />
              </button>
            )}

            {secondaryTarget && (
              <button
                onClick={() => setLayoutMode(layoutMode === 'pip_corner' ? 'side_by_side' : 'pip_corner')}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition"
                title="Toggle Split / Corner Layout"
              >
                {layoutMode === 'pip_corner' ? <Columns className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
              </button>
            )}

            <button
              onClick={onExpandPrimary}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition"
              title="Expand to Full Player"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-rose-600/80 hover:bg-rose-600 text-white transition"
              title="Close Stream"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Bottom Controls */}
        <div className="flex items-center justify-between">
          {secondaryTarget ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveAudio(activeAudio === 'primary' ? 'secondary' : 'primary')}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-bold transition shadow"
              >
                <Volume2 className="w-3 h-3" />
                <span>Audio: {activeAudio === 'primary' ? 'Stream 1' : 'Stream 2'}</span>
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsPrimaryMuted(!isPrimaryMuted)}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white"
            >
              {isPrimaryMuted ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
          )}

          <button
            onClick={onExpandPrimary}
            className="text-[11px] text-cyan-300 font-semibold hover:underline"
          >
            Click to return to fullscreen
          </button>
        </div>
      </div>
    </div>
  );
};

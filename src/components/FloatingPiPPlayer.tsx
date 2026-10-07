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

  // Setup primary stream
  useEffect(() => {
    const video = primaryVideoRef.current;
    if (!video) return;

    if (primaryHlsRef.current) {
      primaryHlsRef.current.destroy();
      primaryHlsRef.current = null;
    }

    let streamUrl = '';
    if (primaryTarget.type === 'live') {
      streamUrl = primaryTarget.stream.direct_source || xtreamService.buildStreamUrl('live', primaryTarget.stream.stream_id, 'm3u8', undefined, primaryTarget.stream.serverId);
    } else if (primaryTarget.type === 'vod') {
      streamUrl = primaryTarget.movie.direct_source || xtreamService.buildStreamUrl('vod', primaryTarget.movie.stream_id, 'mp4');
    } else {
      streamUrl = primaryTarget.episode.video_url || xtreamService.buildStreamUrl('series', primaryTarget.episode.id, 'mp4');
    }

    if (streamUrl.includes('.m3u8') && Hls.isSupported()) {
      const config = streamingPerformanceService.getConfig();
      const hlsConfig = streamingPerformanceService.getHlsConfig(config.mode, primaryTarget.type, false);
      const hls = new Hls(hlsConfig);
      primaryHlsRef.current = hls;
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

    return () => {
      if (primaryHlsRef.current) {
        primaryHlsRef.current.destroy();
        primaryHlsRef.current = null;
      }
    };
  }, [primaryTarget]);

  // Setup secondary stream (if dual-view is active)
  useEffect(() => {
    const video = secondaryVideoRef.current;
    if (!video || !secondaryTarget) return;

    if (secondaryHlsRef.current) {
      secondaryHlsRef.current.destroy();
      secondaryHlsRef.current = null;
    }

    let streamUrl = '';
    if (secondaryTarget.type === 'live') {
      streamUrl = secondaryTarget.stream.direct_source || xtreamService.buildStreamUrl('live', secondaryTarget.stream.stream_id, 'm3u8', undefined, secondaryTarget.stream.serverId);
    }

    if (streamUrl.includes('.m3u8') && Hls.isSupported()) {
      const config = streamingPerformanceService.getConfig();
      // Secondary stream receives throttled profile to protect primary playback bandwidth
      const hlsConfig = streamingPerformanceService.getHlsConfig(config.mode, 'live', true);
      const hls = new Hls(hlsConfig);
      secondaryHlsRef.current = hls;
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

    return () => {
      if (secondaryHlsRef.current) {
        secondaryHlsRef.current.destroy();
        secondaryHlsRef.current = null;
      }
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

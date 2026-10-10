import React, { useState } from 'react';
import {
  Activity,
  CheckCircle,
  AlertTriangle,
  AlertOctagon,
  ChevronDown,
  ChevronUp,
  Cpu,
  Wifi,
  Sliders,
  X,
  Gauge,
  Layers,
  Clock,
  Sparkles,
  Zap,
  Info,
} from 'lucide-react';
import {
  StreamHealthStats,
  streamingPerformanceService,
  PerformanceMode,
} from '../services/streamingPerformanceService';

interface StreamHealthPanelProps {
  stats: StreamHealthStats;
  onClose: () => void;
  onSelectQuality?: (levelIndex: number) => void;
  onOpenPerformanceSettings?: () => void;
}

export const StreamHealthPanel: React.FC<StreamHealthPanelProps> = ({
  stats,
  onClose,
  onSelectQuality,
  onOpenPerformanceSettings,
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const currentConfig = streamingPerformanceService.getConfig();

  const getRatingBadge = () => {
    switch (stats.healthRating) {
      case 'optimal':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
            <CheckCircle className="w-3.5 h-3.5" />
            Optimal Playback
          </span>
        );
      case 'good':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/40">
            <CheckCircle className="w-3.5 h-3.5" />
            Good Health
          </span>
        );
      case 'fair':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40">
            <AlertTriangle className="w-3.5 h-3.5" />
            Buffer Rebuilding
          </span>
        );
      case 'poor':
      default:
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/20 text-rose-400 border border-rose-500/40">
            <AlertOctagon className="w-3.5 h-3.5" />
            Stream Stressed
          </span>
        );
    }
  };

  const getModeLabel = (mode: PerformanceMode) => {
    switch (mode) {
      case 'auto':
        return 'Auto (Adaptive)';
      case 'fast':
        return 'Fast Startup';
      case 'balanced':
        return 'Balanced';
      case 'stable':
        return 'Stable Buffer';
    }
  };

  return (
    <div className="absolute top-16 right-4 sm:right-8 z-50 w-88 sm:w-96 max-w-[calc(100vw-2rem)] bg-[#070b14]/95 backdrop-blur-2xl border border-cyan-500/30 rounded-2xl shadow-2xl p-4 sm:p-5 text-slate-200 animate-in fade-in slide-in-from-top-4 duration-200 select-none">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <Activity className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <div className="text-sm font-bold text-white font-heading flex items-center gap-2">
              <span>Stream Health</span>
              {stats.isSecondaryStream && (
                <span className="text-[10px] font-semibold text-amber-400 bg-amber-950/60 border border-amber-500/40 px-1.5 py-0.2 rounded">
                  PiP Throttled
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-400">Real-Time Playback Diagnostics</div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition active:scale-95 tv-focus-target"
          title="Close Panel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Main Status & Diagnostic Summary */}
      <div className="mb-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          {getRatingBadge()}
          <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-slate-800 text-cyan-300">
            {getModeLabel(currentConfig.mode)}
          </span>
        </div>

        {/* Human-readable diagnostic translation */}
        <div className="text-xs font-medium text-slate-300 bg-slate-900/80 border border-slate-800 rounded-xl p-2.5 flex items-start gap-2">
          <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <p className="leading-relaxed">{stats.diagnosticMessage}</p>
        </div>
      </div>

      {/* Essential Metrics Grid */}
      <div className="grid grid-cols-2 gap-2.5 mb-4 text-xs">
        {/* Quality / Resolution */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-2.5">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <Gauge className="w-3 h-3 text-cyan-400" />
            <span>Resolution</span>
          </div>
          <div className="text-sm font-extrabold text-white font-mono">
            {stats.resolution !== '—' ? stats.resolution : 'Detecting...'}
          </div>
        </div>

        {/* Current Bitrate */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-2.5">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <Wifi className="w-3 h-3 text-cyan-400" />
            <span>Bitrate</span>
          </div>
          <div className="text-sm font-extrabold text-white font-mono">
            {streamingPerformanceService.formatBitrate(stats.bitrateBps)}
          </div>
        </div>

        {/* Buffered Cushion */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-2.5">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-cyan-400" />
            <span>Forward Buffer</span>
          </div>
          <div className="text-sm font-extrabold text-white font-mono flex items-baseline gap-1">
            <span>{stats.bufferedSeconds}s</span>
            <span
              className={`text-[10px] ${
                stats.bufferedSeconds >= 8
                  ? 'text-emerald-400'
                  : stats.bufferedSeconds >= 3
                  ? 'text-cyan-400'
                  : 'text-amber-400'
              }`}
            >
              {stats.bufferedSeconds >= 8 ? 'Strong' : stats.bufferedSeconds >= 3 ? 'Fair' : 'Low'}
            </span>
          </div>
        </div>

        {/* Live Latency or Stalls */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-2.5">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <Zap className="w-3 h-3 text-cyan-400" />
            <span>{stats.liveLatencySeconds !== null ? 'Live Delay' : 'Stalls'}</span>
          </div>
          <div className="text-sm font-extrabold text-white font-mono">
            {stats.liveLatencySeconds !== null ? `${stats.liveLatencySeconds}s` : stats.rebufferCount}
          </div>
        </div>
      </div>

      {/* Advanced Diagnostics Toggle */}
      <button
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-semibold text-slate-300 transition tv-focus-target mb-3"
      >
        <span className="flex items-center gap-2">
          <Cpu className="w-3.5 h-3.5 text-cyan-400" />
          <span>Advanced Telemetry & Controls</span>
        </span>
        {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {/* Expanded Advanced Panel */}
      {showAdvanced && (
        <div className="space-y-3 pt-1 border-t border-slate-800/80 animate-in fade-in duration-200 text-xs">
          {/* Detailed stats */}
          <div className="space-y-1.5 bg-slate-950/70 rounded-xl p-3 border border-slate-800/60 font-mono text-[11px]">
            <div className="flex justify-between text-slate-400">
              <span>Stream Protocol:</span>
              <span className="text-slate-200">{stats.protocol}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Estimated Bandwidth:</span>
              <span className="text-cyan-300">
                {stats.estimatedBandwidthAvailable === false
                  ? 'Unavailable'
                  : streamingPerformanceService.formatBitrate(stats.estimatedBandwidthBps)}
              </span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Startup Time:</span>
              <span className="text-slate-200">
                {stats.startupTimeMs !== null ? `${stats.startupTimeMs} ms` : '—'}
              </span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Dropped Video Frames:</span>
              <span className={stats.droppedFrames > 10 ? 'text-amber-400' : 'text-slate-200'}>
                {stats.droppedFramesAvailable === false
                  ? 'Unavailable'
                  : `${stats.droppedFrames} / ${stats.totalFrames}`}
              </span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Auto Target Level:</span>
              <span className="text-cyan-400 capitalize">{stats.autoAdaptationLevel}</span>
            </div>
          </div>

          {/* Quality Variant Selector if HLS has multiple tracks */}
          {stats.availableLevels.length > 0 && onSelectQuality && (
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3 h-3 text-cyan-400" />
                <span>Stream Quality Selection</span>
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  onClick={() => onSelectQuality(-1)}
                  className={`px-2 py-1.5 rounded-lg text-xs font-semibold transition tv-focus-target ${
                    stats.selectedLevel === -1
                      ? 'bg-cyan-600 text-white font-bold'
                      : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  Auto (ABR)
                </button>
                {stats.availableLevels.map((lvl) => (
                  <button
                    key={lvl.id}
                    onClick={() => onSelectQuality(lvl.id)}
                    className={`px-2 py-1.5 rounded-lg text-xs font-semibold transition truncate tv-focus-target ${
                      stats.selectedLevel === lvl.id
                        ? 'bg-cyan-600 text-white font-bold'
                        : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                    }`}
                    title={`${lvl.name} (${streamingPerformanceService.formatBitrate(lvl.bitrate)})`}
                  >
                    {lvl.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Shortcut to Performance Settings */}
          {onOpenPerformanceSettings && (
            <button
              onClick={() => {
                onClose();
                onOpenPerformanceSettings();
              }}
              className="w-full py-2 px-3 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-cyan-300 font-semibold flex items-center justify-center gap-2 transition active:scale-95 tv-focus-target"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Configure Streaming Performance Settings</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};

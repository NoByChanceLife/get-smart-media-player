import React, { useEffect, useRef, useState } from 'react';
import {
  Zap,
  Activity,
  Shield,
  Sliders,
  CheckCircle,
  X,
  Gauge,
  Clock,
  HardDrive,
  RefreshCw,
  Cpu,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Sparkles,
  Info,
} from 'lucide-react';
import {
  streamingPerformanceService,
  PerformanceMode,
  QualityPreference,
  StreamingPerformanceConfig,
} from '../services/streamingPerformanceService';
import {
  playbackPreferencesService,
  type PlaybackPreferencesConfig,
  type SubtitleDefaultMode,
} from '../services/playbackPreferencesService';

interface StreamingPerformanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigChanged?: () => void;
}

export const StreamingPerformanceModal: React.FC<StreamingPerformanceModalProps> = ({
  isOpen,
  onClose,
  onConfigChanged,
}) => {
  const [config, setConfig] = useState<StreamingPerformanceConfig>(() =>
    streamingPerformanceService.getConfig()
  );
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [cacheStatus, setCacheStatus] = useState<string | null>(null);
  const [playbackPrefs, setPlaybackPrefs] = useState<PlaybackPreferencesConfig>(() =>
    playbackPreferencesService.getConfig()
  );

  const modalRef = useRef<HTMLDivElement | null>(null);

  // TV remote / keyboard spatial navigation inside this modal.
  useEffect(() => {
    if (!isOpen) return;
    const root = modalRef.current;
    if (!root) return;
    const selector = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]';
    const controls = () => Array.from(root.querySelectorAll<HTMLElement>(selector)).filter((el) => el.offsetParent !== null);
    requestAnimationFrame(() => controls()[0]?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)) return;
      const items = controls();
      if (!items.length) return;
      const current = document.activeElement as HTMLElement;
      const currentRect = current?.getBoundingClientRect?.();
      if (!currentRect || !root.contains(current)) { event.preventDefault(); items[0].focus(); return; }
      const cx = currentRect.left + currentRect.width / 2, cy = currentRect.top + currentRect.height / 2;
      const candidates = items.filter((el) => el !== current).map((el) => {
        const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
        const dx = x - cx, dy = y - cy;
        const valid = event.key === 'ArrowLeft' ? dx < -4 : event.key === 'ArrowRight' ? dx > 4 : event.key === 'ArrowUp' ? dy < -4 : dy > 4;
        if (!valid) return null;
        const primary = event.key === 'ArrowLeft' || event.key === 'ArrowRight' ? Math.abs(dx) : Math.abs(dy);
        const cross = event.key === 'ArrowLeft' || event.key === 'ArrowRight' ? Math.abs(dy) : Math.abs(dx);
        return { el, score: primary + cross * 2.25 };
      }).filter(Boolean) as {el: HTMLElement; score: number}[];
      candidates.sort((a,b) => a.score - b.score);
      if (candidates[0]) { event.preventDefault(); candidates[0].el.focus(); candidates[0].el.scrollIntoView({block:'nearest', inline:'nearest'}); }
    };
    root.addEventListener('keydown', onKeyDown);
    return () => root.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelectMode = (mode: PerformanceMode) => {
    const updated = streamingPerformanceService.saveConfig({ mode });
    setConfig(updated);
    onConfigChanged?.();
  };

  const handleUpdateConfig = (partial: Partial<StreamingPerformanceConfig>) => {
    const updated = streamingPerformanceService.saveConfig(partial);
    setConfig(updated);
    onConfigChanged?.();
  };

  const handleUpdatePlaybackPrefs = (partial: Partial<PlaybackPreferencesConfig>) => {
    const updated = playbackPreferencesService.saveConfig(partial);
    setPlaybackPrefs(updated);
    onConfigChanged?.();
  };

  const handleResetDefaults = () => {
    const defaults = streamingPerformanceService.saveConfig({
      mode: 'auto',
      qualityPreference: 'auto',
      lowLatencyMode: true,
      enableVodCache: true,
      customMaxBuffer: 0,
      maxRetryAttempts: 3,
      throttleSecondaryStream: true,
    });
    setConfig(defaults);
    setPlaybackPrefs(playbackPreferencesService.reset());
    onConfigChanged?.();
  };

  const handleClearVodCache = async () => {
    setCacheStatus('Clearing cache...');
    const ok = await streamingPerformanceService.clearCache();
    setCacheStatus(ok ? 'VOD & artwork cache cleared.' : 'Cache was already empty.');
    setTimeout(() => setCacheStatus(null), 3500);
  };

  const modes: Array<{
    id: PerformanceMode;
    title: string;
    badge: string;
    description: string;
    details: string;
    icon: React.ReactNode;
  }> = [
    {
      id: 'auto',
      title: 'Auto',
      badge: 'Recommended',
      description: 'Starts with Balanced playback and adapts when repeated playback stalls are observed.',
      details:
        'Tracks buffer depth, fragment response times, and stalls. Auto can increase the buffer cushion after repeated stalls and return to Balanced settings after playback remains stable.',
      icon: <Sparkles className="w-5 h-5 text-[#4baeff]" />,
    },
    {
      id: 'fast',
      title: 'Fast',
      badge: 'Low Latency',
      description: 'Prioritizes rapid channel switching and minimal live broadcast delay.',
      details:
        'Uses a tight 3-6s live buffer and responsive ABR switching. Ideal for fast broadband and live sports where low latency is critical.',
      icon: <Zap className="w-5 h-5 text-amber-400" />,
    },
    {
      id: 'balanced',
      title: 'Balanced',
      badge: 'Standard',
      description: 'Moderate startup time with a dependable forward buffer cushion.',
      details:
        'Maintains a 15s forward live cushion (45s on VOD) to safeguard against common internet fluctuations without introducing long startup delays.',
      icon: <Gauge className="w-5 h-5 text-emerald-400" />,
    },
    {
      id: 'stable',
      title: 'Stable',
      badge: 'Maximum Buffer',
      description: 'Prioritizes uninterrupted playback over live latency and instant startup.',
      details:
        'Builds a deep 35s live buffer (90s on movies) and employs conservative ABR bitrate selection. Useful when the network path or stream source is inconsistent.',
      icon: <Shield className="w-5 h-5 text-indigo-400" />,
    },
  ];

  return (
    <div ref={modalRef} className="gs-modal-viewport fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="gs-modal-shell bg-[#07111d] border border-[#2d87ff]/40 rounded-lg w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col text-slate-200">
        {/* Header */}
        <div className="px-6 py-5 border-b border-[#17304a] flex items-center justify-between bg-[#050d17]/80">
          <div>
            {/* Breadcrumb */}
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#4baeff] uppercase tracking-widest mb-1 font-heading">
              <span>Settings</span>
              <span className="text-slate-600">/</span>
              <span className="text-white">Player & Playback</span>
            </div>
            <h2 className="text-xl font-black text-white font-heading tracking-tight flex items-center gap-2.5">
              <Activity className="w-5 h-5 text-[#4baeff]" />
              <span>Player & Playback Settings</span>
            </h2>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-[#0d1d2f]/80 transition active:scale-95 tv-focus-target"
            title="Close Settings (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notice Banner */}
        <div className="px-6 py-2.5 bg-cyan-950/30 border-b border-cyan-900/30 flex items-center gap-2.5 text-xs text-cyan-200/90">
          <Info className="w-4 h-4 text-[#4baeff] shrink-0" />
          <span>
            Audio/subtitle preferences are explicit and persistent. Temporary track choices during playback do not silently become permanent settings. Streaming controls improve resilience but cannot repair a source outage or unsupported media.
          </span>
        </div>

        {/* Scrollable Content */}
        <div className="gs-modal-pad flex-1 min-h-0 overflow-y-auto space-y-5 custom-scrollbar">
          {/* Explicit Audio & Subtitle Preferences */}
          <div className="rounded-lg border border-[#17304a] bg-[#050d17]/55 p-4">
            <div className="mb-3">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Audio & Subtitles
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                Saved preferences apply to new playback when matching tracks exist. Choosing a different track in the player is temporary unless you change it here.
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#17304a]/80">
                <div>
                  <div className="font-bold text-slate-200 text-xs">Preferred Audio Language</div>
                  <div className="text-[11px] text-slate-400">Use the source default when the preferred language is unavailable.</div>
                </div>
                <select
                  value={playbackPrefs.preferredAudioLanguage}
                  onChange={(e) => handleUpdatePlaybackPrefs({ preferredAudioLanguage: e.target.value })}
                  className="bg-[#091522] border border-[#23415d] rounded-lg px-3 py-1.5 text-xs text-[#78c1ff] font-semibold focus:outline-none focus:border-[#2d87ff]"
                >
                  <option value="">Auto / Source Default</option>
                  <option value="en">English</option>
                  <option value="es">Spanish</option>
                  <option value="pt">Portuguese</option>
                  <option value="fr">French</option>
                  <option value="de">German</option>
                  <option value="it">Italian</option>
                  <option value="ar">Arabic</option>
                  <option value="zh">Chinese</option>
                  <option value="ja">Japanese</option>
                  <option value="ko">Korean</option>
                </select>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#17304a]/80">
                <div>
                  <div className="font-bold text-slate-200 text-xs">Subtitle Default</div>
                  <div className="text-[11px] text-slate-400">Auto keeps provider/default subtitle behavior. Off disables text tracks. Preferred chooses a saved language when available.</div>
                </div>
                <select
                  value={playbackPrefs.subtitleDefaultMode}
                  onChange={(e) =>
                    handleUpdatePlaybackPrefs({ subtitleDefaultMode: e.target.value as SubtitleDefaultMode })
                  }
                  className="bg-[#091522] border border-[#23415d] rounded-lg px-3 py-1.5 text-xs text-[#78c1ff] font-semibold focus:outline-none focus:border-[#2d87ff]"
                >
                  <option value="auto">Auto / Source Default</option>
                  <option value="off">Off</option>
                  <option value="preferred">Preferred Language</option>
                </select>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="font-bold text-slate-200 text-xs">Preferred Subtitle Language</div>
                  <div className="text-[11px] text-slate-400">Used only when Subtitle Default is set to Preferred Language.</div>
                </div>
                <select
                  value={playbackPrefs.preferredSubtitleLanguage}
                  disabled={playbackPrefs.subtitleDefaultMode !== 'preferred'}
                  onChange={(e) => handleUpdatePlaybackPrefs({ preferredSubtitleLanguage: e.target.value })}
                  className="bg-[#091522] border border-[#23415d] rounded-lg px-3 py-1.5 text-xs text-[#78c1ff] font-semibold focus:outline-none focus:border-[#2d87ff] disabled:opacity-45"
                >
                  <option value="">Choose language</option>
                  <option value="en">English</option>
                  <option value="es">Spanish</option>
                  <option value="pt">Portuguese</option>
                  <option value="fr">French</option>
                  <option value="de">German</option>
                  <option value="it">Italian</option>
                  <option value="ar">Arabic</option>
                  <option value="zh">Chinese</option>
                  <option value="ja">Japanese</option>
                  <option value="ko">Korean</option>
                </select>
              </div>
            </div>
          </div>

          {/* Mode Selector Cards */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
              Performance Strategy Mode
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {modes.map((m) => {
                const isSelected = config.mode === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => handleSelectMode(m.id)}
                    className={`text-left p-4 rounded-lg border transition-all duration-200 tv-focus-target group relative flex flex-col justify-between ${
                      isSelected
                        ? 'bg-gradient-to-br from-cyan-950/60 to-slate-900 border-cyan-400/80 shadow-lg shadow-cyan-950/50 ring-1 ring-cyan-400/30'
                        : 'bg-[#091522]/40 border-[#17304a] hover:bg-slate-850 hover:border-[#23415d]'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div
                            className={`p-2 rounded-lg ${
                              isSelected ? 'bg-[#0b63f6]/18' : 'bg-[#0d1d2f]'
                            }`}
                          >
                            {m.icon}
                          </div>
                          <div>
                            <span className="font-heading font-extrabold text-base text-white block">
                              {m.title}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                                isSelected
                                  ? 'bg-[#0b63f6]/18 text-[#78c1ff] border border-[#2d87ff]/50'
                                  : 'bg-[#0d1d2f] text-slate-400'
                              }`}
                            >
                              {m.badge}
                            </span>
                          </div>
                        </div>

                        {isSelected && (
                          <CheckCircle className="w-5 h-5 text-[#4baeff] shrink-0" />
                        )}
                      </div>

                      <p className="text-xs text-slate-300 font-medium leading-relaxed mb-2">
                        {m.description}
                      </p>
                    </div>

                    <p className="text-[11px] text-slate-400 leading-normal border-t border-[#17304a]/80 pt-2 mt-1">
                      {m.details}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Collapsible Advanced Technical Settings */}
          <div className="pt-2 border-t border-[#17304a]">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-lg bg-[#091522]/70 border border-[#17304a] hover:border-[#23415d] text-sm font-bold text-slate-200 transition tv-focus-target"
            >
              <div className="flex items-center gap-2.5">
                <Sliders className="w-4 h-4 text-[#4baeff]" />
                <span>Advanced Buffer & Recovery Tuning</span>
                <span className="text-[10px] text-slate-400 uppercase font-mono px-2 py-0.5 rounded bg-[#0d1d2f]">
                  Technical
                </span>
              </div>
              {showAdvanced ? (
                <ChevronUp className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              )}
            </button>

            {showAdvanced && (
              <div className="mt-3 p-4 bg-[#050d17]/60 border border-[#17304a] rounded-lg space-y-4 animate-in fade-in duration-200 text-xs">
                {/* Adaptive Quality Preference */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#17304a]/80">
                  <div>
                    <div className="font-bold text-slate-200">Quality Preference</div>
                    <div className="text-[11px] text-slate-400">
                      Auto ABR adapts automatically to network bandwidth.
                    </div>
                  </div>
                  <select
                    value={config.qualityPreference}
                    onChange={(e) =>
                      handleUpdateConfig({ qualityPreference: e.target.value as QualityPreference })
                    }
                    className="bg-[#091522] border border-[#23415d] rounded-lg px-3 py-1.5 text-xs text-[#78c1ff] font-semibold focus:outline-none focus:border-[#2d87ff]"
                  >
                    <option value="auto">Auto (Adaptive Bitrate)</option>
                    <option value="1080p">Prioritize 1080p Full HD</option>
                    <option value="720p">Prioritize 720p HD</option>
                    <option value="480p">Prioritize 480p SD (Data Saver)</option>
                    <option value="low">Lowest Bitrate Available</option>
                  </select>
                </div>

                {/* Low Latency Live Catch-up */}
                <div className="flex items-center justify-between pb-3 border-b border-[#17304a]/80">
                  <div>
                    <div className="font-bold text-slate-200">Low-Latency Live Sync</div>
                    <div className="text-[11px] text-slate-400">
                      Automatically speeds up playback slightly to catch up to live broadcast edge.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.lowLatencyMode}
                    onChange={(e) => handleUpdateConfig({ lowLatencyMode: e.target.checked })}
                    className="w-5 h-5 accent-cyan-500 rounded cursor-pointer"
                  />
                </div>

                {/* Secondary Multi-View Stream Throttling */}
                <div className="flex items-center justify-between pb-3 border-b border-[#17304a]/80">
                  <div>
                    <div className="font-bold text-slate-200">
                      Multi-View / PiP Bandwidth Protection
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Prevents secondary dual-screen streams from starving the primary stream.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.throttleSecondaryStream}
                    onChange={(e) =>
                      handleUpdateConfig({ throttleSecondaryStream: e.target.checked })
                    }
                    className="w-5 h-5 accent-cyan-500 rounded cursor-pointer"
                  />
                </div>

                {/* Max Auto Recovery Retries */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#17304a]/80">
                  <div>
                    <div className="font-bold text-slate-200">Bounded Error Recovery Retries</div>
                    <div className="text-[11px] text-slate-400">
                      Sensible retry limit before presenting clear diagnostic rather than endless spinner.
                    </div>
                  </div>
                  <select
                    value={config.maxRetryAttempts}
                    onChange={(e) =>
                      handleUpdateConfig({ maxRetryAttempts: parseInt(e.target.value, 10) })
                    }
                    className="bg-[#091522] border border-[#23415d] rounded-lg px-3 py-1.5 text-xs text-[#78c1ff] font-semibold focus:outline-none focus:border-[#2d87ff]"
                  >
                    <option value={2}>2 Attempts (Fast failure)</option>
                    <option value={3}>3 Attempts (Recommended)</option>
                    <option value={5}>5 Attempts (Persistent)</option>
                  </select>
                </div>

                {/* VOD & Asset Cache */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="font-bold text-slate-200">Persistent VOD & Asset Cache</div>
                    <div className="text-[11px] text-slate-400">
                      Caches posters and movie data locally. Authenticated stream tokens are never cached.
                    </div>
                    {cacheStatus && (
                      <div className="text-[11px] text-[#4baeff] font-semibold mt-1">
                        {cacheStatus}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={handleClearVodCache}
                    className="px-3 py-1.5 rounded-lg bg-[#091522] hover:bg-[#0d1d2f] border border-[#23415d] text-slate-300 hover:text-white font-semibold flex items-center gap-1.5 transition active:scale-95 text-xs"
                  >
                    <HardDrive className="w-3.5 h-3.5" />
                    <span>Clear Cache</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#17304a] bg-[#050d17]/90 flex items-center justify-between">
          <button
            onClick={handleResetDefaults}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-white hover:bg-[#0d1d2f]/60 transition active:scale-95 tv-focus-target"
            title="Reset to recommended defaults"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset to Recommended</span>
          </button>

          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-lg bg-[#0b63f6] hover:bg-[#1677ff] text-white font-bold text-sm shadow-lg shadow-[0_8px_18px_rgba(0,70,180,.28)] transition active:scale-95 tv-focus-target"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

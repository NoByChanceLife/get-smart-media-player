import React, { useRef, useState } from 'react';
import {
  Play,
  Tv,
  Film,
  Layers,
  Star,
  Clock,
  Server,
  ChevronRight,
  Sparkles,
  Radio,
  Lock,
  RotateCcw,
  Plus,
} from 'lucide-react';
import {
  XtreamLiveStream,
  XtreamVodStream,
  XtreamSeries,
  SavedProfile,
  UserProfile,
} from '../types/xtream';
import { WatchHistoryItem, xtreamService } from '../services/xtreamClient';
import { parentalControlService } from '../services/parentalControlService';
import { adultDiscoveryCategoryIds, isPrivateDiscoveryContent, isPrivateHistoryTitle } from '../services/discoveryPrivacy';

interface HomeViewProps {
  liveStreams: XtreamLiveStream[];
  movies: XtreamVodStream[];
  seriesList: XtreamSeries[];
  liveCategories: XtreamCategory[];
  vodCategories: XtreamCategory[];
  seriesCategories: XtreamCategory[];
  activeProfiles: SavedProfile[];
  userProfile: UserProfile;
  onPlayLive: (stream: XtreamLiveStream) => void;
  onPlayMovie: (movie: XtreamVodStream) => void;
  onPlayHistoryItem: (item: WatchHistoryItem) => void;
  onNavigateTab: (tab: 'live' | 'epg' | 'movies' | 'series' | 'favorites') => void;
  onOpenConnections: () => void;
  onPromptPinForStream?: (stream: XtreamLiveStream) => void;
  onPromptPinForMovie?: (movie: XtreamVodStream) => void;
  isPlaybackBackdrop?: boolean;
}

export const HomeView: React.FC<HomeViewProps> = ({
  liveStreams,
  movies,
  seriesList,
  liveCategories,
  vodCategories,
  seriesCategories,
  activeProfiles,
  userProfile,
  onPlayLive,
  onPlayMovie,
  onPlayHistoryItem,
  onNavigateTab,
  onOpenConnections,
  onPromptPinForStream,
  onPromptPinForMovie,
  isPlaybackBackdrop = false,
}) => {
  const [historyItems] = useState<WatchHistoryItem[]>(() => xtreamService.getHistory());
  const homeRef = useRef<HTMLDivElement | null>(null);

  const handleTVNavigation = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const current = e.target as HTMLElement;
    const isActionable = current.matches('button:not([disabled]), [data-tv-item]');
    if (!isActionable) return;

    if ((e.key === 'Enter' || e.key === ' ') && current.matches('[data-tv-item]:not(button)')) {
      e.preventDefault();
      e.stopPropagation();
      current.click();
      return;
    }

    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;

    const root = homeRef.current;
    if (!root) return;
    const items = Array.from(
      root.querySelectorAll<HTMLElement>('button:not([disabled]), [data-tv-item]')
    ).filter((item) => item.offsetParent !== null);
    const currentRect = current.getBoundingClientRect();
    const cx = currentRect.left + currentRect.width / 2;
    const cy = currentRect.top + currentRect.height / 2;

    const candidates = items
      .filter((item) => item !== current)
      .map((item) => {
        const rect = item.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        const dx = x - cx;
        const dy = y - cy;
        const valid =
          (e.key === 'ArrowRight' && dx > 8) ||
          (e.key === 'ArrowLeft' && dx < -8) ||
          (e.key === 'ArrowDown' && dy > 8) ||
          (e.key === 'ArrowUp' && dy < -8);
        if (!valid) return null;

        // Favor the intended axis heavily so Up/Down changes rows and
        // Left/Right stays within the current row whenever possible.
        const primary = e.key === 'ArrowLeft' || e.key === 'ArrowRight' ? Math.abs(dx) : Math.abs(dy);
        const cross = e.key === 'ArrowLeft' || e.key === 'ArrowRight' ? Math.abs(dy) : Math.abs(dx);
        return { item, score: primary + cross * 3 };
      })
      .filter((candidate): candidate is { item: HTMLElement; score: number } => Boolean(candidate))
      .sort((a, b) => a.score - b.score);

    const next = candidates[0]?.item;
    if (next) {
      e.preventDefault();
      e.stopPropagation();
      next.focus();
      next.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
      return;
    }

    // Up from the top Home row enters the persistent utility row instead of
    // falling back to browser scrolling.
    if (e.key === 'ArrowUp') {
      const topBarItem = document.querySelector<HTMLElement>(
        '[data-tv-topbar] .tv-focus-target, [data-tv-topbar] button:not([disabled]), [data-tv-topbar] select:not([disabled])'
      );
      if (topBarItem) {
        e.preventDefault();
        e.stopPropagation();
        topBarItem.focus();
      }
    }
  };

  // Home is always discreet, even in an unrestricted adult profile or when
  // parental hideLockedContentCompletely is disabled. Access rules are separate.
  const adultLiveIds = adultDiscoveryCategoryIds(liveCategories);
  const adultVodIds = adultDiscoveryCategoryIds(vodCategories);
  const adultSeriesIds = adultDiscoveryCategoryIds(seriesCategories);
  const visibleLive = liveStreams.filter((s) => !parentalControlService.isChannelHidden(s) && !isPrivateDiscoveryContent(s, adultLiveIds));
  const visibleMovies = movies.filter((m) => !parentalControlService.isMovieHidden(m) && !isPrivateDiscoveryContent(m, adultVodIds));
  const visibleSeries = seriesList.filter((s) => !parentalControlService.isSeriesHidden(s) && !isPrivateDiscoveryContent(s, adultSeriesIds));

  // Continue Watching items (vod/episodes or items with progress)
  // Stored watch-history thumbnails/titles are also discovery surfaces.
  // Fail closed for unrecognized movie/episode history identities until a
  // catalog match proves the item is safe for automatic display.
  const safeMovieHistoryIds = new Set(visibleMovies.map((m) => `vod_${m.stream_id}`));
  const continueWatching = historyItems.filter((h) => {
    if (isPrivateHistoryTitle(h)) return false;
    if (h.type === 'vod') return safeMovieHistoryIds.has(h.id);
    if (h.type === 'episode') return false; // Provider series/episode match still pending.
    return h.type === 'live' && Boolean(h.progressSeconds && h.progressSeconds > 0) &&
      visibleLive.some((stream) => `live_${stream.stream_id}` === h.id);
  });

  // Recent Live channels from history
  const recentLiveItems = historyItems.filter((h) => h.type === 'live');
  const recentLiveStreams: XtreamLiveStream[] = [];
  for (const h of recentLiveItems) {
    const stream = visibleLive.find((s) => `live_${s.stream_id}` === h.id);
    if (stream && !recentLiveStreams.some((s) => s.stream_id === stream.stream_id)) {
      recentLiveStreams.push(stream);
    }
  }

  // Favorite channels
  const favoriteChannels = visibleLive.filter((s) => s.isFavorite);

  // Recently Added / Top Movies (first 8)
  const recentMovies = visibleMovies.slice(0, 10);

  // Recently Added / Top Series (first 8)
  const recentSeries = visibleSeries.slice(0, 10);

  // Top Spotlight Item (Live NASA, top movie, or first channel)
  const featuredItem =
    recentLiveStreams[0] ||
    favoriteChannels[0] ||
    visibleLive[0] ||
    null;

  return (
    <div ref={homeRef} onKeyDownCapture={handleTVNavigation} className={`gs-full-canvas space-y-8 pb-12 animate-in fade-in duration-300 ${isPlaybackBackdrop ? 'watching-glass-home' : ''}`}>
      {/* Hero Spotlight Banner */}
      {featuredItem && (
        <section className="relative w-full rounded-xl overflow-hidden bg-gradient-to-t from-[#040b14] via-[#081523]/72 to-[#07111d]/55 border border-[#17304a] shadow-[0_18px_42px_rgba(0,0,0,.30)]">
          <div className="absolute inset-0 bg-gradient-to-r from-[#06090f] via-[#06090f]/75 to-transparent z-10" />

          {/* Background Ambient Backdrop */}
          <div
            className="absolute inset-0 bg-cover bg-center opacity-30 transform scale-105 transition-transform duration-1000"
            style={{
              backgroundImage: featuredItem.stream_icon
                ? `url(${featuredItem.stream_icon})`
                : 'linear-gradient(135deg, #0f172a 0%, #030712 100%)',
            }}
          />

          <div className="relative z-20 p-6 sm:p-10 lg:p-12 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-[#0a2d57]/70 border border-[#1b5f9b] text-[#79c4ff] text-[10px] font-bold mb-3 backdrop-blur-md uppercase tracking-[0.12em]">
              <Radio className="w-3.5 h-3.5 text-[#4baeff] animate-pulse" />
              <span>Get Smart Spotlight</span>
            </div>

            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white tracking-tight font-heading leading-tight drop-shadow-md">
              {featuredItem.name}
            </h1>

            {featuredItem.currentProgram && (
              <p className="text-xs sm:text-base text-slate-300 mt-2 line-clamp-2 leading-relaxed max-w-xl drop-shadow">
                Now Live: <span className="font-semibold text-white">{featuredItem.currentProgram}</span>
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3.5 mt-6">
              <button
                onClick={() => {
                  if (parentalControlService.isChannelLocked(featuredItem) && onPromptPinForStream) {
                    onPromptPinForStream(featuredItem);
                  } else {
                    onPlayLive(featuredItem);
                  }
                }}
                data-tv-item tabIndex={0} className="px-5 py-2.5 rounded-lg bg-[#0b63f6] hover:bg-[#1677ff] text-white font-semibold text-[12px] flex items-center gap-2 shadow-[0_8px_18px_rgba(0,70,180,.28)] transition-all tv-focus-target active:scale-95"
              >
                <Play className="w-4 h-4 fill-slate-950" />
                <span>Watch Live Now</span>
              </button>

              <button
                onClick={() => onNavigateTab('live')}
                data-tv-item tabIndex={0} className="px-4 py-2.5 rounded-lg bg-[#091522]/90 hover:bg-[#0d1d2f] text-[#c7d4df] font-medium text-[12px] border border-[#23415d] backdrop-blur-md transition-all tv-focus-target active:scale-95 flex items-center gap-2"
              >
                <Tv className="w-4 h-4 text-[#4baeff]" />
                <span>Browse All Channels</span>
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Continue Watching Section (Only when history exists) */}
      {continueWatching.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <RotateCcw className="w-5 h-5 text-[#4baeff]" />
              <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight font-heading">
                Continue Watching
              </h2>
            </div>
            <button
              onClick={() => onNavigateTab('favorites')}
              data-tv-item className="text-xs font-semibold text-[#78c1ff] hover:text-white flex items-center gap-1 group px-3 py-2 rounded-xl border border-transparent tv-focus-target"
            >
              <span>View History</span>
              <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>

          <div className="gs-landscape-grid">
            {continueWatching.slice(0, 5).map((item) => (
              <div
                key={item.id}
                data-tv-item
                tabIndex={0}
                role="button"
                onClick={() => onPlayHistoryItem(item)}
                data-tv-item tabIndex={0} className="group relative bg-[#091522] rounded-lg border border-[#17304a] hover:border-[#2d87ff]/70 p-3 transition-all duration-200 cursor-pointer shadow-lg hover:shadow-cyan-950/40 tv-focus-target"
              >
                <div className="relative aspect-video rounded-lg bg-[#0a1724] overflow-hidden mb-2.5 flex items-center justify-center">
                  {item.icon ? (
                    <img
                      src={item.icon}
                      alt={item.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <Film className="w-8 h-8 text-slate-600" />
                  )}

                  {/* Play Overlay */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <div className="w-10 h-10 rounded-full bg-cyan-500 text-slate-950 flex items-center justify-center shadow-lg">
                      <Play className="w-4 h-4 fill-current ml-0.5" />
                    </div>
                  </div>

                  {/* Progress Bar */}
                  {item.progressSeconds && item.durationSeconds && (
                    <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-slate-800">
                      <div
                        className="h-full bg-cyan-400"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.round((item.progressSeconds / item.durationSeconds) * 100)
                          )}%`,
                        }}
                      />
                    </div>
                  )}
                </div>

                <h3 className="text-xs font-bold text-white truncate group-hover:text-[#78c1ff] transition-colors">
                  {item.title}
                </h3>
                {item.subtitle && (
                  <p className="text-[11px] text-slate-400 truncate mt-0.5">{item.subtitle}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Favorite Channels Row (Only when favorites exist) */}
      {favoriteChannels.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
              <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight font-heading">
                Favorite Channels
              </h2>
            </div>
            <button
              onClick={() => onNavigateTab('favorites')}
              data-tv-item className="text-xs font-semibold text-[#78c1ff] hover:text-white flex items-center gap-1 group px-3 py-2 rounded-xl border border-transparent tv-focus-target"
            >
              <span>View All</span>
              <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>

          <div className="gs-channel-grid">
            {favoriteChannels.slice(0, 6).map((stream) => (
              <div
                key={stream.stream_id}
                data-tv-item
                tabIndex={0}
                role="button"
                onClick={() => {
                  if (parentalControlService.isChannelLocked(stream) && onPromptPinForStream) {
                    onPromptPinForStream(stream);
                  } else {
                    onPlayLive(stream);
                  }
                }}
                data-tv-item tabIndex={0} className="group relative bg-[#091522] rounded-lg border border-[#17304a] hover:border-amber-400/50 p-3.5 flex flex-col items-center text-center transition-all cursor-pointer shadow-md tv-focus-target"
              >
                <div className="w-14 h-14 rounded-lg bg-[#0a1724] border border-[#17304a] flex items-center justify-center p-2 mb-2 group-hover:border-amber-400/40 transition">
                  {stream.stream_icon ? (
                    <img
                      src={stream.stream_icon}
                      alt={stream.name}
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <Tv className="w-6 h-6 text-slate-500" />
                  )}
                </div>

                <div className="text-[11px] font-bold text-white truncate w-full group-hover:text-amber-300 transition">
                  {stream.name}
                </div>
                <div className="text-[10px] text-slate-400 truncate w-full mt-0.5">
                  {stream.currentProgram || 'Live Stream'}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recent Channels (Only when recent channel history exists) */}
      {recentLiveStreams.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Clock className="w-5 h-5 text-[#4baeff]" />
              <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight font-heading">
                Recent Channels
              </h2>
            </div>
            <button
              onClick={() => onNavigateTab('live')}
              data-tv-item className="text-xs font-semibold text-[#78c1ff] hover:text-white flex items-center gap-1 group px-3 py-2 rounded-xl border border-transparent tv-focus-target"
            >
              <span>Channel Guide</span>
              <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>

          <div className="gs-landscape-grid">
            {recentLiveStreams.slice(0, 4).map((stream) => (
              <div
                key={stream.stream_id}
                data-tv-item
                tabIndex={0}
                role="button"
                onClick={() => {
                  if (parentalControlService.isChannelLocked(stream) && onPromptPinForStream) {
                    onPromptPinForStream(stream);
                  } else {
                    onPlayLive(stream);
                  }
                }}
                data-tv-item tabIndex={0} className="group flex items-center gap-3.5 p-3 rounded-2xl bg-[#0e1422] border border-slate-800/80 hover:border-[#2d87ff]/70 cursor-pointer transition shadow-md tv-focus-target"
              >
                <div className="w-12 h-12 rounded-lg bg-[#0a1724] border border-[#17304a] flex items-center justify-center p-1.5 shrink-0">
                  {stream.stream_icon ? (
                    <img
                      src={stream.stream_icon}
                      alt={stream.name}
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <Tv className="w-5 h-5 text-[#4baeff]" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-white truncate group-hover:text-[#78c1ff] transition">
                    {stream.name}
                  </div>
                  <div className="text-[11px] text-slate-400 truncate mt-0.5">
                    {stream.currentProgram || 'Live Broadcast'}
                  </div>
                </div>

                <div className="w-8 h-8 rounded-xl bg-[#0b63f6]/12 text-[#4baeff] group-hover:bg-[#0b63f6] group-hover:text-white flex items-center justify-center shrink-0 transition">
                  <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recently Added Movies Row (Only when movies exist) */}
      {recentMovies.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Film className="w-5 h-5 text-[#4baeff]" />
              <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight font-heading">
                Recently Added Movies
              </h2>
            </div>
            <button
              onClick={() => onNavigateTab('movies')}
              data-tv-item className="text-xs font-semibold text-[#78c1ff] hover:text-white flex items-center gap-1 group px-3 py-2 rounded-xl border border-transparent tv-focus-target"
            >
              <span>View Movies</span>
              <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>

          <div className="gs-poster-grid">
            {recentMovies.map((movie) => {
              const isLocked = parentalControlService.isMovieLocked(movie);
              return (
                <div
                  key={movie.stream_id}
                  data-tv-item
                  tabIndex={0}
                  role="button"
                  onClick={() => {
                    if (isLocked && onPromptPinForMovie) {
                      onPromptPinForMovie(movie);
                    } else {
                      onPlayMovie(movie);
                    }
                  }}
                  data-tv-item tabIndex={0} className="group relative bg-[#091522] rounded-lg border border-[#17304a] hover:border-[#2d87ff]/70 overflow-hidden cursor-pointer transition shadow-md tv-focus-target"
                >
                  <div className="relative aspect-[2/3] bg-slate-900 overflow-hidden">
                    {movie.stream_icon ? (
                      <img
                        src={movie.stream_icon}
                        alt={movie.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-600">
                        <Film className="w-10 h-10" />
                      </div>
                    )}

                    {movie.rating_5based && (
                      <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-black/75 backdrop-blur-md text-amber-400 text-[10px] font-bold flex items-center gap-1">
                        <Star className="w-2.5 h-2.5 fill-current" />
                        <span>{movie.rating_5based.toFixed(1)}</span>
                      </div>
                    )}

                    {isLocked && (
                      <div className="absolute inset-0 bg-black/75 backdrop-blur-xs flex flex-col items-center justify-center p-2 text-center text-rose-400">
                        <Lock className="w-6 h-6 mb-1" />
                        <span className="text-[10px] font-bold">Locked</span>
                      </div>
                    )}
                  </div>

                  <div className="p-3">
                    <h3 className="text-xs font-bold text-white truncate group-hover:text-[#78c1ff] transition">
                      {movie.name}
                    </h3>
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400">
                      {movie.year && <span>{movie.year}</span>}
                      {movie.duration && <span>· {movie.duration}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Recently Added Series Row (Only when series exist) */}
      {recentSeries.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Layers className="w-5 h-5 text-[#4baeff]" />
              <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight font-heading">
                Recently Added TV Series
              </h2>
            </div>
            <button
              onClick={() => onNavigateTab('series')}
              data-tv-item className="text-xs font-semibold text-[#78c1ff] hover:text-white flex items-center gap-1 group px-3 py-2 rounded-xl border border-transparent tv-focus-target"
            >
              <span>View Series</span>
              <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>

          <div className="gs-poster-grid">
            {recentSeries.map((series) => (
              <div
                key={series.series_id}
                data-tv-item
                tabIndex={0}
                role="button"
                onClick={() => onNavigateTab('series')}
                data-tv-item tabIndex={0} className="group relative bg-[#091522] rounded-lg border border-[#17304a] hover:border-[#2d87ff]/70 overflow-hidden cursor-pointer transition shadow-md tv-focus-target"
              >
                <div className="relative aspect-[2/3] bg-slate-900 overflow-hidden">
                  {series.cover ? (
                    <img
                      src={series.cover}
                      alt={series.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-600">
                      <Layers className="w-10 h-10" />
                    </div>
                  )}

                  {series.rating_5based && (
                    <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-black/75 backdrop-blur-md text-amber-400 text-[10px] font-bold flex items-center gap-1">
                      <Star className="w-2.5 h-2.5 fill-current" />
                      <span>{series.rating_5based.toFixed(1)}</span>
                    </div>
                  )}
                </div>

                <div className="p-3">
                  <h3 className="text-xs font-bold text-white truncate group-hover:text-[#78c1ff] transition">
                    {series.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400">
                    {series.year && <span>{series.year}</span>}
                    {series.genre && <span>· {series.genre.split(',')[0]}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Active Servers Card (Intelligently surfaced) */}
      <section className="p-5 sm:p-6 rounded-xl bg-[#07111d] border border-[#17304a] flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-[#0b63f6]/10 border border-[#2d87ff]/35 flex items-center justify-center text-[#4baeff] shrink-0">
            <Server className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white font-heading">
                Multi-Server Streaming Pipeline
              </h3>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800/40">
                {activeProfiles.length} Active Sources
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Xtream Codes, Portal / STB emulation, M3U playlists, and direct streaming lines operating concurrently.
            </p>
          </div>
        </div>

        <button
          onClick={onOpenConnections}
          data-tv-item tabIndex={0} className="px-5 py-2.5 rounded-lg bg-[#091522] hover:bg-[#0d1d2f] border border-[#23415d] text-xs font-bold text-[#78c1ff] hover:text-cyan-200 transition tv-focus-target active:scale-95 flex items-center gap-2 shrink-0"
        >
          <span>Manage Connections</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </section>
    </div>
  );
};

import React, { useRef, useState } from 'react';
import {
  Star,
  Clock,
  Play,
  Tv,
  Film,
  Layers,
  Trash2,
} from 'lucide-react';
import {
  XtreamLiveStream,
  XtreamVodStream,
  XtreamSeries,
} from '../types/xtream';
import { xtreamService, WatchHistoryItem } from '../services/xtreamClient';

interface FavoritesViewProps {
  liveStreams: XtreamLiveStream[];
  movies: XtreamVodStream[];
  seriesList: XtreamSeries[];
  onPlayLiveStream: (stream: XtreamLiveStream) => void;
  onPlayMovie: (movie: XtreamVodStream) => void;
  onPlayHistoryItem: (item: WatchHistoryItem) => void;
  onToggleFavorite: (type: 'live' | 'vod' | 'series', id: number | string) => void;
}

export const FavoritesView: React.FC<FavoritesViewProps> = ({
  liveStreams,
  movies,
  seriesList,
  onPlayLiveStream,
  onPlayMovie,
  onPlayHistoryItem,
  onToggleFavorite,
}) => {
  const viewRef = useRef<HTMLDivElement | null>(null);
  const [activeTab, setActiveTab] = useState<'favorites' | 'history'>('favorites');
  const [historyItems, setHistoryItems] = useState<WatchHistoryItem[]>(() => xtreamService.getHistory());

  const favoriteLive = liveStreams.filter((s) => s.isFavorite);
  const favoriteMovies = movies.filter((m) => m.isFavorite);
  const favoriteSeries = seriesList.filter((s) => s.isFavorite);

  const totalFavorites = favoriteLive.length + favoriteMovies.length + favoriteSeries.length;

  const handleClearHistory = () => {
    xtreamService.clearHistory();
    setHistoryItems([]);
  };

  const handleTVNavigation = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const current = e.target as HTMLElement;
    if (!current.matches('[data-tv-item]')) return;

    if ((e.key === 'Enter' || e.key === ' ') && !current.matches('button')) {
      e.preventDefault();
      current.click();
      return;
    }

    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    const root = viewRef.current;
    if (!root) return;

    const items = Array.from(root.querySelectorAll<HTMLElement>('[data-tv-item]'))
      .filter((item) => item.offsetParent !== null);
    const rect = current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const horizontal = e.key === 'ArrowLeft' || e.key === 'ArrowRight';

    const next = items
      .filter((item) => item !== current)
      .map((item) => {
        const r = item.getBoundingClientRect();
        const dx = r.left + r.width / 2 - cx;
        const dy = r.top + r.height / 2 - cy;
        const valid =
          (e.key === 'ArrowRight' && dx > 8) ||
          (e.key === 'ArrowLeft' && dx < -8) ||
          (e.key === 'ArrowDown' && dy > 8) ||
          (e.key === 'ArrowUp' && dy < -8);
        if (!valid) return null;
        return { item, score: (horizontal ? Math.abs(dx) : Math.abs(dy)) + (horizontal ? Math.abs(dy) : Math.abs(dx)) * 3 };
      })
      .filter((entry): entry is { item: HTMLElement; score: number } => Boolean(entry))
      .sort((a, b) => a.score - b.score)[0]?.item;

    if (next) {
      e.preventDefault();
      next.focus({ preventScroll: true });
      next.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
      return;
    }

    if (e.key === 'ArrowLeft') {
      const rail = document.querySelector<HTMLElement>('[data-tv-nav-item][aria-current="page"]');
      if (rail) {
        e.preventDefault();
        rail.focus({ preventScroll: true });
      }
    }
  };

  return (
    <div ref={viewRef} onKeyDownCapture={handleTVNavigation} className="gs-full-canvas flex flex-col h-full space-y-5">
      {/* Sub-Tabs: Favorites vs History */}
      <div className="flex items-center justify-between">
        <div className="flex items-center p-1 bg-[#0a1724] border border-[#17304a] rounded-lg">
          <button
            data-tv-item
            onClick={() => setActiveTab('favorites')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition ${
              activeTab === 'favorites'
                ? 'bg-[#0b63f6] text-white shadow-[0_6px_16px_rgba(0,70,180,.24)]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Star className="w-3.5 h-3.5 fill-current" />
            <span>Favorites ({totalFavorites})</span>
          </button>
          <button
            data-tv-item
            onClick={() => {
              setActiveTab('history');
              setHistoryItems(xtreamService.getHistory());
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition ${
              activeTab === 'history'
                ? 'bg-[#0b63f6] text-white shadow-[0_6px_16px_rgba(0,70,180,.24)]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Watch History ({historyItems.length})</span>
          </button>
        </div>

        {activeTab === 'history' && historyItems.length > 0 && (
          <button
            data-tv-item
            onClick={handleClearHistory}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs text-rose-400 hover:bg-rose-500/10 border border-rose-500/20 transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear History</span>
          </button>
        )}
      </div>

      {activeTab === 'favorites' ? (
        totalFavorites === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center bg-[#07111d]/70 rounded-xl border border-[#17304a]/75 p-6">
            <Star className="w-12 h-12 text-slate-700 mb-3" />
            <h3 className="text-sm font-bold text-slate-300">No favorites starred yet</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm">
              Tap the star icon on any Live TV channel, movie, or series to access them quickly here.
            </p>
          </div>
        ) : (
          <div className="space-y-8 pb-12">
            {/* Live TV Favorites */}
            {favoriteLive.length > 0 && (
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#4baeff] flex items-center gap-2 mb-3">
                  <Tv className="w-4 h-4" />
                  <span>Live TV Channels ({favoriteLive.length})</span>
                </h3>
                <div className="gs-channel-grid">
                  {favoriteLive.map((stream) => (
                    <div
                      key={stream.stream_id}
                      data-tv-item tabIndex={0} role="button"
                      onClick={() => onPlayLiveStream(stream)}
                      className="group bg-[#091522]/90 hover:bg-slate-850 border border-[#17304a] hover:border-[#2d87ff]/70 rounded-lg p-3 flex flex-col justify-between cursor-pointer transition"
                    >
                      <div className="aspect-video w-full rounded-xl bg-slate-950 flex items-center justify-center overflow-hidden mb-2 relative">
                        {stream.stream_icon ? (
                          <img
                            src={stream.stream_icon}
                            alt={stream.name}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <Tv className="w-6 h-6 text-slate-600" />
                        )}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                          <Play className="w-6 h-6 text-[#4baeff] fill-cyan-400" />
                        </div>
                      </div>
                      <h4 className="text-xs font-bold text-white truncate">{stream.name}</h4>
                      <p className="text-[10px] text-slate-400 truncate mt-0.5">{stream.currentProgram || 'Live'}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Movies Favorites */}
            {favoriteMovies.length > 0 && (
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#4baeff] flex items-center gap-2 mb-3">
                  <Film className="w-4 h-4" />
                  <span>Movies ({favoriteMovies.length})</span>
                </h3>
                <div className="gs-poster-grid">
                  {favoriteMovies.map((movie) => (
                    <div
                      key={movie.stream_id}
                      data-tv-item tabIndex={0} role="button"
                      onClick={() => onPlayMovie(movie)}
                      className="group bg-[#091522]/90 hover:bg-slate-850 border border-[#17304a] hover:border-[#2d87ff]/70 rounded-lg overflow-hidden cursor-pointer transition flex flex-col"
                    >
                      <div className="aspect-[2/3] w-full bg-slate-950 relative overflow-hidden">
                        <img
                          src={movie.stream_icon}
                          alt={movie.name}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                          <Play className="w-8 h-8 text-[#4baeff] fill-cyan-400" />
                        </div>
                      </div>
                      <div className="p-2.5">
                        <h4 className="text-xs font-bold text-white truncate">{movie.name}</h4>
                        <span className="text-[10px] text-slate-400">{movie.year || '2026'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      ) : (
        /* History Tab */
        historyItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center bg-[#07111d]/70 rounded-xl border border-[#17304a]/75 p-6">
            <Clock className="w-12 h-12 text-slate-700 mb-3" />
            <h3 className="text-sm font-bold text-slate-300">No watch history yet</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm">
              Channels and films you stream will appear here for one-tap instant resumption.
            </p>
          </div>
        ) : (
          <div className="space-y-2 pb-12">
            {historyItems.map((item) => (
              <div
                key={item.id}
                data-tv-item tabIndex={0} role="button"
                onClick={() => onPlayHistoryItem(item)}
                className="group bg-[#091522]/82 hover:bg-slate-850 border border-[#17304a] hover:border-[#2d87ff]/60 rounded-lg p-3 sm:px-4 flex items-center justify-between cursor-pointer transition"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-12 h-9 rounded-xl bg-slate-950 border border-[#17304a] overflow-hidden flex items-center justify-center shrink-0">
                    {item.icon ? (
                      <img
                        src={item.icon}
                        alt={item.title}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <Tv className="w-4 h-4 text-slate-600" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-white group-hover:text-[#4baeff] transition truncate">
                      {item.title}
                    </h4>
                    <p className="text-[11px] text-slate-400 truncate mt-0.5">
                      {item.subtitle || 'Broadcast stream'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">
                    {new Date(item.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <div className="w-8 h-8 rounded-xl bg-[#0b63f6]/16 text-[#4baeff] group-hover:bg-[#0b63f6] group-hover:text-white flex items-center justify-center transition">
                    <Play className="w-3.5 h-3.5 ml-0.5 fill-current" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
};

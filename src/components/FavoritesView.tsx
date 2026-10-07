import React, { useState } from 'react';
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

  return (
    <div className="flex flex-col h-full space-y-6">
      {/* Sub-Tabs: Favorites vs History */}
      <div className="flex items-center justify-between">
        <div className="flex items-center p-1 bg-slate-900 border border-slate-800 rounded-2xl">
          <button
            onClick={() => setActiveTab('favorites')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition ${
              activeTab === 'favorites'
                ? 'bg-cyan-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Star className="w-3.5 h-3.5 fill-current" />
            <span>Favorites ({totalFavorites})</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('history');
              setHistoryItems(xtreamService.getHistory());
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition ${
              activeTab === 'history'
                ? 'bg-cyan-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Watch History ({historyItems.length})</span>
          </button>
        </div>

        {activeTab === 'history' && historyItems.length > 0 && (
          <button
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
          <div className="flex flex-col items-center justify-center py-20 text-center bg-slate-900/30 rounded-3xl border border-slate-800/60 p-6">
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
                <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-2 mb-3">
                  <Tv className="w-4 h-4" />
                  <span>Live TV Channels ({favoriteLive.length})</span>
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {favoriteLive.map((stream) => (
                    <div
                      key={stream.stream_id}
                      onClick={() => onPlayLiveStream(stream)}
                      className="group bg-slate-900/80 hover:bg-slate-850 border border-slate-800/80 hover:border-cyan-500/50 rounded-2xl p-3 flex flex-col justify-between cursor-pointer transition"
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
                          <Play className="w-6 h-6 text-cyan-400 fill-cyan-400" />
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
                <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-2 mb-3">
                  <Film className="w-4 h-4" />
                  <span>Movies ({favoriteMovies.length})</span>
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {favoriteMovies.map((movie) => (
                    <div
                      key={movie.stream_id}
                      onClick={() => onPlayMovie(movie)}
                      className="group bg-slate-900/80 hover:bg-slate-850 border border-slate-800/80 hover:border-cyan-500/50 rounded-2xl overflow-hidden cursor-pointer transition flex flex-col"
                    >
                      <div className="aspect-[2/3] w-full bg-slate-950 relative overflow-hidden">
                        <img
                          src={movie.stream_icon}
                          alt={movie.name}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                          <Play className="w-8 h-8 text-cyan-400 fill-cyan-400" />
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
          <div className="flex flex-col items-center justify-center py-20 text-center bg-slate-900/30 rounded-3xl border border-slate-800/60 p-6">
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
                onClick={() => onPlayHistoryItem(item)}
                className="group bg-slate-900/70 hover:bg-slate-850 border border-slate-800 hover:border-cyan-500/40 rounded-2xl p-3 sm:px-4 flex items-center justify-between cursor-pointer transition"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-12 h-9 rounded-xl bg-slate-950 border border-slate-800 overflow-hidden flex items-center justify-center shrink-0">
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
                    <h4 className="text-xs font-bold text-white group-hover:text-cyan-400 transition truncate">
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
                  <div className="w-8 h-8 rounded-xl bg-cyan-600/20 text-cyan-400 group-hover:bg-cyan-500 group-hover:text-white flex items-center justify-center transition">
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

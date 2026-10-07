import React, { useState, useMemo } from 'react';
import {
  Search,
  Tv,
  Film,
  Layers,
  Play,
  X,
  Star,
  Lock,
} from 'lucide-react';
import {
  XtreamLiveStream,
  XtreamVodStream,
  XtreamSeries,
} from '../types/xtream';
import { parentalControlService } from '../services/parentalControlService';

interface GlobalSearchViewProps {
  liveStreams: XtreamLiveStream[];
  movies: XtreamVodStream[];
  seriesList: XtreamSeries[];
  onPlayLive: (stream: XtreamLiveStream) => void;
  onPlayMovie: (movie: XtreamVodStream) => void;
  onSelectSeries: (series: XtreamSeries) => void;
  onPromptPinForStream?: (stream: XtreamLiveStream) => void;
  onPromptPinForMovie?: (movie: XtreamVodStream) => void;
}

export const GlobalSearchView: React.FC<GlobalSearchViewProps> = ({
  liveStreams,
  movies,
  seriesList,
  onPlayLive,
  onPlayMovie,
  onSelectSeries,
  onPromptPinForStream,
  onPromptPinForMovie,
}) => {
  const [query, setQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'live' | 'movies' | 'series'>('all');

  const cleanQuery = query.trim().toLowerCase();

  const results = useMemo(() => {
    if (!cleanQuery) return { live: [], movies: [], series: [] };

    const live = liveStreams
      .filter((s) => !parentalControlService.isChannelHidden(s))
      .filter(
        (s) =>
          s.name.toLowerCase().includes(cleanQuery) ||
          (s.currentProgram && s.currentProgram.toLowerCase().includes(cleanQuery))
      );

    const vod = movies
      .filter((m) => !parentalControlService.isMovieHidden(m))
      .filter(
        (m) =>
          m.name.toLowerCase().includes(cleanQuery) ||
          (m.plot && m.plot.toLowerCase().includes(cleanQuery))
      );

    const sList = seriesList
      .filter((s) => !parentalControlService.isSeriesHidden(s))
      .filter(
        (s) =>
          s.name.toLowerCase().includes(cleanQuery) ||
          (s.genre && s.genre.toLowerCase().includes(cleanQuery))
      );

    return { live, movies: vod, series: sList };
  }, [cleanQuery, liveStreams, movies, seriesList]);

  const totalResults =
    (filterType === 'all' || filterType === 'live' ? results.live.length : 0) +
    (filterType === 'all' || filterType === 'movies' ? results.movies.length : 0) +
    (filterType === 'all' || filterType === 'series' ? results.series.length : 0);

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12 animate-in fade-in duration-200">
      {/* Search Header Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-cyan-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search channels, live shows, movies, series across all servers..."
            autoFocus
            className="w-full bg-[#0d1424] border border-slate-700/80 rounded-2xl pl-12 pr-10 py-3.5 text-sm sm:text-base text-white placeholder-slate-400 focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/30 transition shadow-inner"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-2xl self-start sm:self-auto overflow-x-auto">
          {(['all', 'live', 'movies', 'series'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition capitalize ${
                filterType === type
                  ? 'bg-cyan-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {type === 'all' ? 'All' : type === 'live' ? 'Live TV' : type === 'movies' ? 'Movies' : 'Series'}
            </button>
          ))}
        </div>
      </div>

      {/* Empty State / Prompt */}
      {!cleanQuery && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-3xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mb-4">
            <Search className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-white font-heading">Global Media Search</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm">
            Search instantaneously across all configured IPTV servers, portals, and streaming playlists.
          </p>
        </div>
      )}

      {/* Query executed but zero results */}
      {cleanQuery && totalResults === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <h3 className="text-base font-bold text-slate-200">No media found for "{query}"</h3>
          <p className="text-xs text-slate-400 mt-1">
            Try a different search keyword or check other categories.
          </p>
        </div>
      )}

      {/* Live Channels Results */}
      {cleanQuery && (filterType === 'all' || filterType === 'live') && results.live.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Tv className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider font-heading">
              Live Channels ({results.live.length})
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {results.live.map((stream) => (
              <div
                key={stream.stream_id}
                onClick={() => {
                  if (parentalControlService.isChannelLocked(stream) && onPromptPinForStream) {
                    onPromptPinForStream(stream);
                  } else {
                    onPlayLive(stream);
                  }
                }}
                className="group flex items-center gap-3 p-3 rounded-2xl bg-[#0e1422] border border-slate-800 hover:border-cyan-500/50 cursor-pointer transition shadow tv-focus-target"
              >
                <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center p-1 shrink-0">
                  {stream.stream_icon ? (
                    <img
                      src={stream.stream_icon}
                      alt={stream.name}
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <Tv className="w-5 h-5 text-cyan-400" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-white truncate group-hover:text-cyan-300 transition">
                    {stream.name}
                  </div>
                  <div className="text-[11px] text-slate-400 truncate mt-0.5">
                    {stream.currentProgram || 'Live Stream'}
                  </div>
                </div>

                <div className="w-8 h-8 rounded-xl bg-cyan-600/10 text-cyan-400 group-hover:bg-cyan-500 group-hover:text-slate-950 flex items-center justify-center shrink-0 transition">
                  <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Movies Results */}
      {cleanQuery && (filterType === 'all' || filterType === 'movies') && results.movies.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Film className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider font-heading">
              Movies ({results.movies.length})
            </h3>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5">
            {results.movies.map((movie) => {
              const isLocked = parentalControlService.isMovieLocked(movie);
              return (
                <div
                  key={movie.stream_id}
                  onClick={() => {
                    if (isLocked && onPromptPinForMovie) {
                      onPromptPinForMovie(movie);
                    } else {
                      onPlayMovie(movie);
                    }
                  }}
                  className="group relative bg-[#0e1422] rounded-2xl border border-slate-800 hover:border-cyan-500/50 overflow-hidden cursor-pointer transition shadow tv-focus-target"
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
                        <Film className="w-8 h-8" />
                      </div>
                    )}

                    {isLocked && (
                      <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center p-2 text-rose-400">
                        <Lock className="w-5 h-5 mb-1" />
                        <span className="text-[10px] font-bold">Locked</span>
                      </div>
                    )}
                  </div>

                  <div className="p-2.5">
                    <h4 className="text-xs font-bold text-white truncate group-hover:text-cyan-300 transition">
                      {movie.name}
                    </h4>
                    {movie.year && (
                      <span className="text-[10px] text-slate-400">{movie.year}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Series Results */}
      {cleanQuery && (filterType === 'all' || filterType === 'series') && results.series.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider font-heading">
              TV Series ({results.series.length})
            </h3>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5">
            {results.series.map((series) => (
              <div
                key={series.series_id}
                onClick={() => onSelectSeries(series)}
                className="group relative bg-[#0e1422] rounded-2xl border border-slate-800 hover:border-cyan-500/50 overflow-hidden cursor-pointer transition shadow tv-focus-target"
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
                      <Layers className="w-8 h-8" />
                    </div>
                  )}
                </div>

                <div className="p-2.5">
                  <h4 className="text-xs font-bold text-white truncate group-hover:text-cyan-300 transition">
                    {series.name}
                  </h4>
                  {series.year && (
                    <span className="text-[10px] text-slate-400">{series.year}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

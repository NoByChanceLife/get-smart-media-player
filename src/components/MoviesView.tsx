import React, { useRef, useState } from 'react';
import {
  Film,
  Star,
  Search,
  Play,
  Clock,
  Calendar,
  X,
  Sparkles,
  Info,
  Lock,
  ShieldAlert,
} from 'lucide-react';
import { XtreamCategory, XtreamVodStream } from '../types/xtream';
import { parentalControlService } from '../services/parentalControlService';

interface MoviesViewProps {
  categories: XtreamCategory[];
  movies: XtreamVodStream[];
  selectedCategoryId: string;
  onSelectCategory: (categoryId: string) => void;
  onPlayMovie: (movie: XtreamVodStream) => void;
  onToggleFavorite: (movieId: number | string) => void;
  onPromptPinForMovie?: (movie: XtreamVodStream) => void;
}

export const MoviesView: React.FC<MoviesViewProps> = ({
  categories,
  movies,
  selectedCategoryId,
  onSelectCategory,
  onPlayMovie,
  onToggleFavorite,
  onPromptPinForMovie,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMovie, setSelectedMovie] = useState<XtreamVodStream | null>(null);
  const movieGridRef = useRef<HTMLDivElement | null>(null);
  const movieViewRef = useRef<HTMLDivElement | null>(null);

  const focusNavigationRailFromMedia = () => {
    const rail = document.querySelector<HTMLElement>(
      '[data-tv-navigation-rail] .tv-focus-target, nav .tv-focus-target, aside .tv-focus-target'
    );
    rail?.focus();
  };

  const focusTopBarFromMedia = () => {
    const target = document.querySelector<HTMLElement>(
      '[data-tv-topbar] .tv-focus-target, [data-tv-topbar] button:not([disabled]), [data-tv-topbar] select:not([disabled])'
    );
    target?.focus();
  };

  const focusZoneItem = (zone: string, preferredIndex = 0) => {
    const root = movieViewRef.current;
    if (!root) return false;
    const items = Array.from(
      root.querySelectorAll<HTMLElement>(`[data-tv-zone="${zone}"]`)
    ).filter((item) => item.offsetParent !== null);
    if (!items.length) return false;
    const target = items[Math.min(Math.max(preferredIndex, 0), items.length - 1)];
    target.focus();
    target.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
    return true;
  };

  const handleMediaViewNavigation = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const current = e.target as HTMLElement;
    if (current.closest('[data-media-card]')) return;
    if (!current.matches('button:not([disabled]), input:not([disabled]), [data-tv-zone]')) return;

    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    const root = movieViewRef.current;
    if (!root) return;

    const items = Array.from(
      root.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [data-tv-zone], [data-media-card]'
      )
    ).filter((item, index, all) => item.offsetParent !== null && all.indexOf(item) === index);

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

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      e.stopPropagation();
      focusNavigationRailFromMedia();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      // The featured Watch Movie action is the intentional first stop at the
      // top of Movies. Only move into the global utility bar after the user
      // presses Up again from the featured controls.
      const featured = root.querySelector<HTMLElement>('[data-tv-zone="featured"]');
      if (featured && current.dataset.tvZone !== 'featured') {
        window.scrollTo({ top: 0, behavior: 'auto' });
        featured.focus();
        return;
      }
      window.scrollTo({ top: 0, behavior: 'auto' });
      focusTopBarFromMedia();
    }
  };

  const handlePosterKeyDown = (e: React.KeyboardEvent<HTMLElement>, index: number, movie: XtreamVodStream) => {
    const cards = Array.from(movieGridRef.current?.querySelectorAll<HTMLElement>('[data-media-card]') ?? []);
    if (!cards.length) return;
    const columns = Math.max(1, Math.round(movieGridRef.current!.clientWidth / cards[0].getBoundingClientRect().width));
    let next = index;
    if (e.key === 'ArrowRight') next = Math.min(cards.length - 1, index + 1);
    else if (e.key === 'ArrowLeft') {
      if (index % columns === 0) {
        e.preventDefault();
        e.stopPropagation();
        focusNavigationRailFromMedia();
        return;
      }
      next = Math.max(0, index - 1);
    }
    else if (e.key === 'ArrowDown') next = Math.min(cards.length - 1, index + columns);
    else if (e.key === 'ArrowUp') {
      if (index < columns) {
        const root = movieViewRef.current;
        const candidates = Array.from(
          root?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [data-tv-zone]:not([data-media-card])') ?? []
        ).filter((item) => item.offsetParent !== null);
        const cardRect = cards[index].getBoundingClientRect();
        const cx = cardRect.left + cardRect.width / 2;
        const above = candidates
          .map((item) => {
            const rect = item.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            const dy = cardRect.top - y;
            if (dy <= 0) return null;
            return { item, score: dy + Math.abs(x - cx) * 3 };
          })
          .filter((candidate): candidate is { item: HTMLElement; score: number } => Boolean(candidate))
          .sort((a, b) => a.score - b.score)[0]?.item;
        if (above) {
          e.preventDefault();
          e.stopPropagation();
          above.focus();
          above.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
        }
        return;
      }
      next = Math.max(0, index - columns);
    }
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setSelectedMovie(movie);
      return;
    } else return;
    e.preventDefault();
    cards[next]?.focus();
    cards[next]?.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
  };

  const canAccess = parentalControlService.canAccessSection('movies');
  const parentalSettings = parentalControlService.getSettings();

  if (!canAccess) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center bg-[#091522] rounded-xl border border-[#17304a] p-8 max-w-lg mx-auto">
        <div className="w-16 h-16 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-4">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h3 className="text-base font-bold text-white font-heading">Movies Catalog Restricted</h3>
        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
          Access to VOD Movies is disabled for this user profile by the Master Administrator.
        </p>
      </div>
    );
  }

  // Filter categories
  const visibleCategories = categories.filter((cat) => {
    if (cat.category_id === 'all') return true;
    const isLocked = parentalControlService.isCategoryLocked(cat.category_id, 'vod');
    if (isLocked && parentalSettings.hideLockedContentCompletely) {
      return false;
    }
    return true;
  });

  // Filter movies
  const filteredMovies = movies.filter((m) => {
    const isLocked = parentalControlService.isMovieLocked(m);
    if (isLocked && parentalSettings.hideLockedContentCompletely) {
      return false;
    }
    const matchesSearch =
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.plot && m.plot.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesSearch;
  });

  const featuredMovie = filteredMovies[0];

  const handleMoviePlayRequest = (movie: XtreamVodStream) => {
    const isLocked = parentalControlService.isMovieLocked(movie);
    if (isLocked) {
      if (onPromptPinForMovie) {
        onPromptPinForMovie(movie);
      }
      return;
    }
    onPlayMovie(movie);
  };

  return (
    <div ref={movieViewRef} onKeyDownCapture={handleMediaViewNavigation} className="gs-full-canvas flex flex-col h-full space-y-5 animate-in fade-in duration-200">
      {/* Featured Movie Spotlight Banner */}
      {featuredMovie && !searchQuery && selectedCategoryId === 'all' && (
        <div className="relative w-full rounded-xl overflow-hidden border border-[#17304a] shadow-2xl group">
          <div className="aspect-[21/9] sm:aspect-[24/9] w-full bg-[#070b14] overflow-hidden relative">
            <img
              src={featuredMovie.stream_icon || '/src/assets/images/iptv_hero_banner_1791054500017.jpg'}
              alt={featuredMovie.name}
              className="w-full h-full object-cover object-center opacity-40 group-hover:scale-105 transition-transform duration-700"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#06090f] via-[#06090f]/70 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#06090f] via-[#06090f]/80 to-transparent" />
          </div>

          <div className="absolute bottom-0 left-0 p-6 sm:p-10 max-w-xl z-10">
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded-full bg-cyan-950 text-[#4baeff] border border-cyan-800/50 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                Featured Motion Picture
              </span>
              {featuredMovie.rating_5based && (
                <div className="flex items-center gap-1 text-amber-400 text-xs font-bold bg-black/60 px-2 py-0.5 rounded-full">
                  <Star className="w-3 h-3 fill-current" />
                  <span>{featuredMovie.rating_5based.toFixed(1)}</span>
                </div>
              )}
            </div>

            <h2 className="text-xl sm:text-3xl font-extrabold text-white tracking-tight font-heading mb-2 drop-shadow-md">
              {featuredMovie.name}
            </h2>

            <p className="text-xs sm:text-sm text-slate-300 line-clamp-2 mb-4 leading-relaxed drop-shadow">
              {featuredMovie.plot ||
                'High-definition on-demand motion picture available in ultra high-definition video.'}
            </p>

            <div className="flex items-center gap-3">
              <button
                data-tv-zone="featured" onClick={() => handleMoviePlayRequest(featuredMovie)}
                className="px-6 py-2.5 rounded-lg bg-[#0b63f6] hover:bg-[#1677ff] text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-cyan-500/25 active:scale-95 transition tv-focus-target"
              >
                <Play className="w-4 h-4 fill-slate-950" />
                <span>Watch Movie (Enter)</span>
              </button>

              <button
                data-tv-zone="featured" onClick={() => setSelectedMovie(featuredMovie)}
                className="px-4 py-2.5 rounded-lg bg-[#091522]/90 hover:bg-slate-800 text-slate-200 text-xs font-semibold border border-[#23415d] flex items-center gap-2 backdrop-blur-md transition tv-focus-target"
              >
                <Info className="w-4 h-4 text-[#4baeff]" />
                <span>Details</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Categories & Search */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {visibleCategories.map((cat) => {
            const isSelected = selectedCategoryId === cat.category_id;
            const isCategoryLocked = parentalControlService.isCategoryLocked(cat.category_id, 'vod');

            return (
              <button
                key={cat.category_id}
                data-tv-zone="categories"
                onClick={() => onSelectCategory(cat.category_id)}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition tv-focus-target ${
                  isSelected
                    ? 'bg-[#0b63f6] text-white shadow-[0_6px_16px_rgba(0,70,180,.24)] font-semibold'
                    : 'bg-[#091522]/90 text-slate-400 hover:text-white border border-[#17304a] hover:bg-slate-800'
                }`}
              >
                {isCategoryLocked && <Lock className="w-3 h-3 text-rose-400" />}
                <span>{cat.category_name}</span>
              </button>
            );
          })}
        </div>

        <div className="relative w-full max-w-md shrink-0">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            data-tv-zone="search"
            placeholder="Search movies..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#07111d] border border-[#17304a] rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#2d87ff] transition tv-focus-target"
          />
        </div>
      </div>

      {/* Movies Poster Grid */}
      <div ref={movieGridRef} className="gs-poster-grid">
        {filteredMovies.map((movie, movieIndex) => {
          const isLocked = parentalControlService.isMovieLocked(movie);

          return (
            <div
              key={movie.stream_id}
              data-media-card
              data-tv-zone="posters"
              tabIndex={0}
              role="button"
              aria-label={`Open ${movie.name}`}
              onKeyDown={(e) => handlePosterKeyDown(e, movieIndex, movie)}
              onClick={() => setSelectedMovie(movie)}
              className="group relative flex flex-col bg-[#091522] rounded-lg border border-[#17304a] hover:border-[#2d87ff]/70 overflow-hidden cursor-pointer transition-all duration-200 shadow-md tv-focus-target"
            >
              {/* Poster Image */}
              <div className="relative aspect-[2/3] w-full bg-slate-950 overflow-hidden">
                {movie.stream_icon ? (
                  <img
                    src={movie.stream_icon}
                    alt={movie.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-600 p-4">
                    <Film className="w-10 h-10 mb-2" />
                    <span className="text-[10px] text-center">No Poster</span>
                  </div>
                )}

                {/* Rating Badge */}
                {movie.rating_5based && (
                  <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-black/75 backdrop-blur-md text-amber-400 text-[10px] font-bold flex items-center gap-1 shadow">
                    <Star className="w-2.5 h-2.5 fill-current" />
                    <span>{movie.rating_5based.toFixed(1)}</span>
                  </div>
                )}

                {/* Parental Lock Overlay */}
                {isLocked && (
                  <div className="absolute inset-0 bg-black/80 backdrop-blur-xs flex flex-col items-center justify-center p-3 text-center text-rose-400">
                    <Lock className="w-7 h-7 mb-1" />
                    <span className="text-[11px] font-bold">Restricted</span>
                    <span className="text-[9px] text-slate-400 mt-0.5">PIN Required</span>
                  </div>
                )}

                {/* Quick Play Hover Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleMoviePlayRequest(movie);
                  }}
                  className="absolute bottom-3 right-3 w-10 h-10 rounded-full bg-cyan-500 text-slate-950 shadow-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 transform translate-y-2 group-hover:translate-y-0"
                  title="Play Movie"
                >
                  <Play className="w-4 h-4 fill-slate-950 ml-0.5" />
                </button>
              </div>

              {/* Title & Info */}
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

      {/* Cinematic Movie Details Modal */}
      {selectedMovie && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-2xl rounded-xl bg-[#07111d] border border-[#17304a] shadow-2xl overflow-hidden relative">
            <button
              onClick={() => setSelectedMovie(null)}
              className="absolute top-4 right-4 z-20 p-2 rounded-xl bg-black/60 text-slate-400 hover:text-white backdrop-blur-md transition tv-focus-target"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="relative aspect-[16/9] w-full bg-slate-950 overflow-hidden">
              <img
                src={selectedMovie.stream_icon || '/src/assets/images/iptv_hero_banner_1791054500017.jpg'}
                alt={selectedMovie.name}
                className="w-full h-full object-cover opacity-50"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0c121e] via-[#0c121e]/60 to-transparent" />

              <div className="absolute bottom-4 left-6 right-6">
                <div className="flex items-center gap-2 mb-1.5 text-xs">
                  {selectedMovie.year && (
                    <span className="font-mono text-[#4baeff] font-bold">{selectedMovie.year}</span>
                  )}
                  {selectedMovie.duration && (
                    <span className="text-slate-300">· {selectedMovie.duration}</span>
                  )}
                  {selectedMovie.rating_5based && (
                    <div className="flex items-center gap-1 text-amber-400 font-bold ml-1">
                      <Star className="w-3.5 h-3.5 fill-current" />
                      <span>{selectedMovie.rating_5based.toFixed(1)}</span>
                    </div>
                  )}
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-white font-heading">
                  {selectedMovie.name}
                </h2>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                {selectedMovie.plot ||
                  'High-definition on-demand motion picture available in ultra high-definition video.'}
              </p>

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={() => {
                    handleMoviePlayRequest(selectedMovie);
                    setSelectedMovie(null);
                  }}
                  className="flex-1 py-3 rounded-lg bg-[#0b63f6] hover:bg-[#1677ff] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/25 transition tv-focus-target active:scale-95"
                >
                  <Play className="w-4 h-4 fill-slate-950" />
                  <span>Watch Movie Now (Enter)</span>
                </button>

                <button
                  onClick={() => onToggleFavorite(selectedMovie.stream_id)}
                  className={`p-3 rounded-lg border transition ${
                    selectedMovie.isFavorite
                      ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                      : 'bg-[#0a1724] border-[#17304a] text-slate-400 hover:text-white'
                  } tv-focus-target`}
                  title="Toggle Favorite"
                >
                  <Star
                    className={`w-4 h-4 ${
                      selectedMovie.isFavorite ? 'fill-amber-400 text-amber-400' : ''
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

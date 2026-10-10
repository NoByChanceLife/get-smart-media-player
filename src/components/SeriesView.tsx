import React, { useEffect, useRef, useState } from 'react';
import {
  Tv,
  Star,
  Search,
  Play,
  Clock,
  Layers,
  ChevronRight,
  X,
  ListOrdered,
  Lock,
  ShieldAlert,
} from 'lucide-react';
import { XtreamCategory, XtreamSeries, XtreamSeason, XtreamEpisode } from '../types/xtream';
import { xtreamService } from '../services/xtreamClient';
import { parentalControlService } from '../services/parentalControlService';

interface SeriesViewProps {
  categories: XtreamCategory[];
  seriesList: XtreamSeries[];
  selectedCategoryId: string;
  onSelectCategory: (categoryId: string) => void;
  onPlayEpisode: (series: XtreamSeries, seasonNum: number, episode: XtreamEpisode) => void;
  onToggleFavorite: (seriesId: number | string) => void;
  onPromptPinForSeries?: (series: XtreamSeries) => void;
}

export const SeriesView: React.FC<SeriesViewProps> = ({
  categories,
  seriesList,
  selectedCategoryId,
  onSelectCategory,
  onPlayEpisode,
  onToggleFavorite,
  onPromptPinForSeries,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSeries, setSelectedSeries] = useState<XtreamSeries | null>(null);
  const [seasons, setSeasons] = useState<XtreamSeason[]>([]);
  const [activeSeasonNum, setActiveSeasonNum] = useState<number>(1);
  const [loadingSeasons, setLoadingSeasons] = useState<boolean>(false);
  const seriesGridRef = useRef<HTMLDivElement | null>(null);
  const seriesViewRef = useRef<HTMLDivElement | null>(null);
  const seriesDialogRef = useRef<HTMLDivElement | null>(null);

  const focusNavigationRailFromMedia = () => {
    const rail = document.querySelector<HTMLElement>(
      '[data-tv-navigation-rail] .tv-focus-target, nav .tv-focus-target, aside .tv-focus-target'
    );
    rail?.focus();
  };

  const focusTopBarFromMedia = () => {
    focusNavigationRailFromMedia();
  };

  const focusZoneItem = (zone: string, preferredIndex = 0) => {
    const root = seriesViewRef.current;
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
    const root = seriesViewRef.current;
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
      focusTopBarFromMedia();
    }
  };

  const handlePosterKeyDown = (e: React.KeyboardEvent<HTMLElement>, index: number, series: XtreamSeries) => {
    const cards = Array.from(seriesGridRef.current?.querySelectorAll<HTMLElement>('[data-media-card]') ?? []);
    if (!cards.length) return;
    const columns = Math.max(1, Math.round(seriesGridRef.current!.clientWidth / cards[0].getBoundingClientRect().width));
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
        const root = seriesViewRef.current;
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
      handleOpenSeries(series);
      return;
    } else return;
    e.preventDefault();
    cards[next]?.focus();
    cards[next]?.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
  };

  useEffect(() => {
    if (!selectedSeries) return;

    const previousFocus = document.activeElement as HTMLElement | null;
    const dialog = seriesDialogRef.current;
    const first = dialog?.querySelector<HTMLElement>('button:not([disabled]), [tabindex="0"]');
    requestAnimationFrame(() => first?.focus());

    const handleDialogKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Backspace') {
        event.preventDefault();
        event.stopPropagation();
        setSelectedSeries(null);
        requestAnimationFrame(() => previousFocus?.focus());
      }
    };

    window.addEventListener('keydown', handleDialogKey, true);
    return () => window.removeEventListener('keydown', handleDialogKey, true);
  }, [selectedSeries]);

  const canAccess = parentalControlService.canAccessSection('series');
  const parentalSettings = parentalControlService.getSettings();

  if (!canAccess) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center bg-[#091522] rounded-xl border border-[#17304a] p-8 max-w-lg mx-auto">
        <div className="w-16 h-16 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-4">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h3 className="text-base font-bold text-white font-heading">TV Series Catalog Restricted</h3>
        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
          Access to TV Series is disabled for this user profile by the Master Administrator.
        </p>
      </div>
    );
  }

  // Filter categories
  const visibleCategories = categories.filter((cat) => {
    if (cat.category_id === 'all') return true;
    const isLocked = parentalControlService.isCategoryLocked(cat.category_id, 'series');
    if (isLocked && parentalSettings.hideLockedContentCompletely) {
      return false;
    }
    return true;
  });

  // Filter series
  const filteredSeries = seriesList.filter((s) => {
    const isCatLocked = parentalControlService.isCategoryLocked(s.category_id, 'series');
    if (isCatLocked && parentalSettings.hideLockedContentCompletely) {
      return false;
    }
    const matchesSearch =
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.genre && s.genre.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesSearch;
  });

  const handleOpenSeries = async (series: XtreamSeries) => {
    const isLocked = parentalControlService.isCategoryLocked(series.category_id, 'series');
    if (isLocked) {
      if (onPromptPinForSeries) {
        onPromptPinForSeries(series);
      }
      return;
    }

    setSelectedSeries(series);
    setLoadingSeasons(true);
    try {
      const data = await xtreamService.getSeriesInfo(series.series_id);
      setSeasons(data);
      if (data.length > 0) {
        setActiveSeasonNum(data[0].season_num);
      }
    } catch {
      // Fallback
    } finally {
      setLoadingSeasons(false);
    }
  };

  const activeSeason = seasons.find((s) => s.season_num === activeSeasonNum) || seasons[0];

  return (
    <div ref={seriesViewRef} onKeyDownCapture={handleMediaViewNavigation} className="gs-full-canvas flex flex-col h-full space-y-5 animate-in fade-in duration-200">
      {/* Categories & Search Header */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {visibleCategories.map((cat) => {
            const isSelected = selectedCategoryId === cat.category_id;
            const isCategoryLocked = parentalControlService.isCategoryLocked(cat.category_id, 'series');

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
            data-tv-zone="categories"
            placeholder="Search TV series..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#07111d] border border-[#17304a] rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#2d87ff] transition tv-focus-target"
          />
        </div>
      </div>

      {/* Series Posters Grid */}
      <div ref={seriesGridRef} className="gs-poster-grid">
        {filteredSeries.map((series, seriesIndex) => {
          const isCatLocked = parentalControlService.isCategoryLocked(series.category_id, 'series');

          return (
            <div
              key={series.series_id}
              data-media-card
              data-tv-zone="posters"
              tabIndex={0}
              role="button"
              aria-label={`Open ${series.name}`}
              onKeyDown={(e) => handlePosterKeyDown(e, seriesIndex, series)}
              onClick={() => handleOpenSeries(series)}
              className="group relative flex flex-col bg-[#091522] rounded-lg border border-[#17304a] hover:border-[#2d87ff]/70 overflow-hidden cursor-pointer transition-all duration-200 shadow-md tv-focus-target"
            >
              {/* Cover Poster */}
              <div className="relative aspect-[2/3] w-full bg-slate-950 overflow-hidden">
                {series.cover ? (
                  <img
                    src={series.cover}
                    alt={series.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-600 p-4">
                    <Layers className="w-10 h-10 mb-2" />
                    <span className="text-[10px] text-center">No Cover</span>
                  </div>
                )}

                {/* Rating Badge */}
                {series.rating_5based && (
                  <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-black/75 backdrop-blur-md text-amber-400 text-[10px] font-bold flex items-center gap-1 shadow">
                    <Star className="w-2.5 h-2.5 fill-current" />
                    <span>{series.rating_5based.toFixed(1)}</span>
                  </div>
                )}

                {/* Restricted Overlay */}
                {isCatLocked && (
                  <div className="absolute inset-0 bg-black/80 backdrop-blur-xs flex flex-col items-center justify-center p-3 text-center text-rose-400">
                    <Lock className="w-7 h-7 mb-1" />
                    <span className="text-[11px] font-bold">Category Locked</span>
                    <span className="text-[9px] text-slate-400 mt-0.5">PIN Required</span>
                  </div>
                )}
              </div>

              {/* Title & Info */}
              <div className="p-3">
                <h3 className="text-xs font-bold text-white truncate group-hover:text-[#78c1ff] transition">
                  {series.name}
                </h3>
                <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400">
                  {series.year && <span>{series.year}</span>}
                  {series.genre && <span className="truncate">· {series.genre.split(',')[0]}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Cinematic Series Episodes & Seasons Modal */}
      {selectedSeries && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div ref={seriesDialogRef} className="w-full max-w-4xl max-h-[92vh] rounded-xl bg-[#07111d] border border-[#17304a] shadow-2xl overflow-hidden flex flex-col relative">
            {/* Header with Backdrop */}
            <div className="relative aspect-[21/9] sm:aspect-[24/9] w-full bg-slate-950 overflow-hidden shrink-0">
              <img
                src={selectedSeries.backdrop_path?.[0] || selectedSeries.cover || '/src/assets/images/iptv_hero_banner_1791054500017.jpg'}
                alt={selectedSeries.name}
                className="w-full h-full object-cover opacity-50"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0c121e] via-[#0c121e]/60 to-transparent" />

              <button
                onClick={() => setSelectedSeries(null)}
                className="absolute top-4 right-4 z-20 p-2 rounded-xl bg-black/60 text-slate-400 hover:text-white backdrop-blur-md transition tv-focus-target"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="absolute bottom-4 left-6 right-6 flex items-end justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1 text-xs">
                    {selectedSeries.year && (
                      <span className="font-mono text-[#4baeff] font-bold">{selectedSeries.year}</span>
                    )}
                    {selectedSeries.genre && (
                      <span className="text-slate-300">· {selectedSeries.genre}</span>
                    )}
                    {selectedSeries.rating_5based && (
                      <div className="flex items-center gap-1 text-amber-400 font-bold ml-1">
                        <Star className="w-3.5 h-3.5 fill-current" />
                        <span>{selectedSeries.rating_5based.toFixed(1)}</span>
                      </div>
                    )}
                  </div>
                  <h2 className="text-xl sm:text-3xl font-extrabold text-white font-heading">
                    {selectedSeries.name}
                  </h2>
                </div>

                <button
                  onClick={() => onToggleFavorite(selectedSeries.series_id)}
                  className={`p-2.5 rounded-lg border transition shrink-0 ${
                    selectedSeries.isFavorite
                      ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                      : 'bg-black/60 border-slate-700 text-slate-400 hover:text-white'
                  } tv-focus-target`}
                  title="Toggle Favorite Series"
                >
                  <Star
                    className={`w-4 h-4 ${
                      selectedSeries.isFavorite ? 'fill-amber-400 text-amber-400' : ''
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Plot synopsis */}
            {selectedSeries.plot && (
              <div className="px-6 pt-4 pb-2 text-xs text-slate-300 leading-relaxed border-b border-[#17304a]/80">
                {selectedSeries.plot}
              </div>
            )}

            {/* Seasons Tabs Selector */}
            <div className="px-6 py-3 border-b border-[#17304a] bg-[#07111d] flex items-center gap-2 overflow-x-auto scrollbar-none shrink-0">
              <span className="text-xs font-bold text-slate-400 mr-2 flex items-center gap-1 font-heading uppercase">
                <ListOrdered className="w-3.5 h-3.5" />
                <span>Seasons:</span>
              </span>

              {seasons.map((season) => (
                <button
                  key={season.season_num}
                  onClick={() => setActiveSeasonNum(season.season_num)}
                  className={`px-4 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap tv-focus-target ${
                    activeSeasonNum === season.season_num
                      ? 'bg-[#0b63f6] text-white shadow-[0_6px_16px_rgba(0,70,180,.24)]'
                      : 'bg-[#0a1724] border border-[#17304a] text-slate-400 hover:text-white'
                  }`}
                >
                  {season.name || `Season ${season.season_num}`}
                </button>
              ))}
            </div>

            {/* Episodes List */}
            <div className="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar">
              {loadingSeasons ? (
                <div className="py-12 flex flex-col items-center justify-center text-slate-400">
                  <div className="w-8 h-8 border-2 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin mb-3" />
                  <p className="text-xs">Loading episode list...</p>
                </div>
              ) : activeSeason && activeSeason.episodes.length > 0 ? (
                activeSeason.episodes.map((ep) => (
                  <div
                    key={ep.id}
                    tabIndex={0}
                    role="button"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onPlayEpisode(selectedSeries, activeSeasonNum, ep);
                        setSelectedSeries(null);
                      }
                    }}
                    onClick={() => {
                      onPlayEpisode(selectedSeries, activeSeasonNum, ep);
                      setSelectedSeries(null);
                    }}
                    className="group flex flex-col sm:flex-row items-start sm:items-center justify-between p-3.5 rounded-lg bg-[#07111d] border border-[#17304a] hover:border-[#2d87ff]/70 cursor-pointer transition tv-focus-target gap-3"
                  >
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      <div className="w-12 h-12 rounded-xl bg-[#0a1724] border border-[#17304a] flex items-center justify-center text-[#4baeff] shrink-0 font-mono font-bold text-xs">
                        E{ep.episode_num}
                      </div>

                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs font-bold text-white group-hover:text-[#78c1ff] transition truncate">
                          {ep.title || `Episode ${ep.episode_num}`}
                        </h4>
                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400">
                          {ep.duration && <span>{ep.duration}</span>}
                          {ep.rating && <span>· ★ {ep.rating}</span>}
                        </div>
                      </div>
                    </div>

                    <button className="px-4 py-2 rounded-xl bg-[#0b63f6]/18 group-hover:bg-[#0b63f6] text-[#78c1ff] group-hover:text-white font-bold text-xs flex items-center gap-1.5 transition shrink-0 self-end sm:self-center">
                      <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                      <span>Play (Enter)</span>
                    </button>
                  </div>
                ))
              ) : (
                <div className="py-12 text-center text-slate-500 text-xs">
                  No episode streams available for this season.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

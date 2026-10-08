import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Clock, Layers, Lock, Play, Search, ShieldAlert, Star, Tv } from 'lucide-react';
import { XtreamCategory, XtreamEPGProgramme, XtreamLiveStream } from '../types/xtream';
import { parentalControlService } from '../services/parentalControlService';
import { xtreamService } from '../services/xtreamClient';

interface LiveTVViewProps {
  categories: XtreamCategory[];
  streams: XtreamLiveStream[];
  selectedCategoryId: string;
  onSelectCategory: (categoryId: string) => void;
  onPlayStream: (stream: XtreamLiveStream) => void;
  onLaunchPiP?: (stream: XtreamLiveStream) => void;
  onToggleFavorite: (streamId: number | string) => void;
  onPromptPinForStream?: (stream: XtreamLiveStream) => void;
}

const ROW_HEIGHT = 58;
const OVERSCAN = 6;

const timeLabel = (value?: string) => {
  if (!value) return '';
  const time = value.split(' ')[1]?.slice(0, 5);
  return time || '';
};

export const LiveTVView: React.FC<LiveTVViewProps> = ({
  categories,
  streams,
  selectedCategoryId,
  onSelectCategory,
  onPlayStream,
  onToggleFavorite,
  onPromptPinForStream,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [quickFilter, setQuickFilter] = useState<'category' | 'favorites' | 'recent'>('category');
  const [epg, setEpg] = useState<Record<string, XtreamEPGProgramme[]>>({});
  const [selectedStreamId, setSelectedStreamId] = useState<string>('');
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(560);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const groupsRef = useRef<HTMLDivElement | null>(null);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const canAccess = parentalControlService.canAccessSection('live');
  const parentalSettings = parentalControlService.getSettings();

  const visibleCategories = useMemo(
    () =>
      categories.filter(
        (cat) =>
          cat.category_id === 'all' ||
          !(
            parentalSettings.hideLockedContentCompletely &&
            parentalControlService.isCategoryLocked(cat.category_id, 'live')
          )
      ),
    [categories, parentalSettings.hideLockedContentCompletely]
  );

  const filteredStreams = useMemo(() => {
    let list = streams.filter(
      (stream) =>
        !(
          parentalSettings.hideLockedContentCompletely &&
          parentalControlService.isChannelHidden(stream)
        )
    );

    if (quickFilter === 'favorites') list = list.filter((stream) => stream.isFavorite);
    if (quickFilter === 'recent') {
      const ids = new Set(
        xtreamService
          .getHistory()
          .filter((item) => item.type === 'live')
          .map((item) => item.id)
      );
      list = list.filter((stream) => ids.has(`live_${stream.stream_id}`));
    }

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((stream) => {
        const programs = epg[String(stream.stream_id)] || [];
        return (
          stream.name.toLowerCase().includes(q) ||
          programs.some((program) => program.title?.toLowerCase().includes(q))
        );
      });
    }
    return list;
  }, [streams, quickFilter, searchQuery, epg, parentalSettings.hideLockedContentCompletely]);

  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const visibleCount = Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN * 2;
  const endIndex = Math.min(filteredStreams.length, startIndex + visibleCount);
  const windowedStreams = filteredStreams.slice(startIndex, endIndex);

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;
    const update = () => setViewportHeight(node.clientHeight || 560);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const missing = windowedStreams.filter((stream) => epg[String(stream.stream_id)] === undefined);
    if (!missing.length) return;

    Promise.all(
      missing.map(async (stream) => {
        try {
          return [String(stream.stream_id), await xtreamService.getEPG(stream.stream_id)] as const;
        } catch {
          return [String(stream.stream_id), []] as const;
        }
      })
    ).then((entries) => {
      if (!cancelled) setEpg((current) => ({ ...current, ...Object.fromEntries(entries) }));
    });
    return () => {
      cancelled = true;
    };
  }, [startIndex, endIndex, filteredStreams]);

  useEffect(() => {
    if (filteredStreams.length && !filteredStreams.some((s) => String(s.stream_id) === selectedStreamId)) {
      setSelectedStreamId(String(filteredStreams[0].stream_id));
    }
  }, [filteredStreams, selectedStreamId]);

  if (!canAccess) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center bg-[#0d1424] rounded-2xl border border-slate-800 p-8 max-w-lg mx-auto">
        <ShieldAlert className="w-9 h-9 text-amber-400 mb-3" />
        <h3 className="font-bold text-white">Live TV Restricted</h3>
        <p className="text-xs text-slate-400 mt-1">Live TV is disabled for this profile.</p>
      </div>
    );
  }

  const play = (stream: XtreamLiveStream) => {
    if (parentalControlService.isChannelLocked(stream) && onPromptPinForStream) {
      onPromptPinForStream(stream);
    } else {
      onPlayStream(stream);
    }
  };

  const selectGroup = (categoryId: string) => {
    setQuickFilter('category');
    setScrollTop(0);
    scrollerRef.current?.scrollTo({ top: 0 });
    onSelectCategory(categoryId);
  };

  const focusRow = (index: number) => {
    const safeIndex = Math.min(filteredStreams.length - 1, Math.max(0, index));
    if (safeIndex < 0) return;

    const top = safeIndex * ROW_HEIGHT;
    const bottom = top + ROW_HEIGHT;
    const scroller = scrollerRef.current;
    if (scroller) {
      if (top < scroller.scrollTop) scroller.scrollTop = top;
      else if (bottom > scroller.scrollTop + scroller.clientHeight) {
        scroller.scrollTop = Math.max(0, bottom - scroller.clientHeight);
      }
    }

    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-live-row="${safeIndex}"]`)?.focus();
    });
  };

  const focusGroup = (index: number) => {
    const groups = Array.from(
      groupsRef.current?.querySelectorAll<HTMLButtonElement>('button.live-group') ?? []
    );
    if (!groups.length) return;
    const target = groups[Math.min(groups.length - 1, Math.max(0, index))];
    target?.focus();
    target?.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
  };

  const focusAppRail = () => {
    const activeRailItem =
      document.querySelector<HTMLElement>('[data-tv-nav-item][aria-current="page"]') ||
      document.querySelector<HTMLElement>('[data-tv-nav-item]');
    activeRailItem?.focus();
  };

  const activeGroupIndex = () =>
    quickFilter === 'favorites'
      ? 1
      : quickFilter === 'recent'
      ? 2
      : selectedCategoryId === 'all'
      ? 0
      : Math.max(
          3,
          visibleCategories
            .filter((cat) => cat.category_id !== 'all')
            .findIndex((cat) => cat.category_id === selectedCategoryId) + 3
        );

  const focusLiveCell = (rowIndex: number, column: number) => {
    const safeRow = Math.min(filteredStreams.length - 1, Math.max(0, rowIndex));
    if (safeRow < 0) return;
    const scroller = scrollerRef.current;
    if (scroller) {
      const top = safeRow * ROW_HEIGHT;
      const bottom = top + ROW_HEIGHT;
      if (top < scroller.scrollTop) scroller.scrollTop = top;
      else if (bottom > scroller.scrollTop + scroller.clientHeight) {
        scroller.scrollTop = Math.max(0, bottom - scroller.clientHeight);
      }
    }
    requestAnimationFrame(() => {
      workspaceRef.current
        ?.querySelector<HTMLElement>(`[data-live-row="${safeRow}"][data-live-col="${column}"]`)
        ?.focus();
    });
  };

  const handleCellKeyDown = (
    e: React.KeyboardEvent<HTMLElement>,
    rowIndex: number,
    column: number
  ) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusLiveCell(rowIndex + 1, column);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (rowIndex === 0) {
        workspaceRef.current?.querySelector<HTMLElement>('[data-live-search]')?.focus();
      } else {
        focusLiveCell(rowIndex - 1, column);
      }
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      focusLiveCell(rowIndex, Math.min(5, column + 1));
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (column === 0) focusGroup(activeGroupIndex());
      else focusLiveCell(rowIndex, column - 1);
    }
  };

  const handleGroupKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusGroup(index + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusGroup(index - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      focusLiveCell(
        Math.max(0, filteredStreams.findIndex((stream) => String(stream.stream_id) === selectedStreamId)),
        0
      );
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      focusAppRail();
    }
  };

  return (
    <section ref={workspaceRef} className="live-workspace -m-4 sm:-m-6 h-[calc(100vh-5.5rem)] min-h-[560px] overflow-hidden bg-[#05080e]">
      <div className="h-full flex min-w-0">
        <aside className="hidden lg:flex w-52 xl:w-60 shrink-0 flex-col border-r border-slate-800/80 bg-[#080d16]">
          <div className="h-12 px-3 flex items-center gap-2 border-b border-slate-800/80">
            <Layers className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-200">Groups</span>
          </div>
          <div ref={groupsRef} className="p-2 space-y-1 overflow-y-auto custom-scrollbar">
            <button onKeyDown={(e) => handleGroupKeyDown(e, 0)} onClick={() => selectGroup('all')} className={`live-group ${quickFilter === 'category' && selectedCategoryId === 'all' ? 'live-group-active' : ''}`}>
              <Tv className="w-4 h-4" /><span>All Channels</span><small>{streams.length}</small>
            </button>
            <button onKeyDown={(e) => handleGroupKeyDown(e, 1)} onClick={() => setQuickFilter('favorites')} className={`live-group ${quickFilter === 'favorites' ? 'live-group-active' : ''}`}>
              <Star className="w-4 h-4" /><span>Favorites</span>
            </button>
            <button onKeyDown={(e) => handleGroupKeyDown(e, 2)} onClick={() => setQuickFilter('recent')} className={`live-group ${quickFilter === 'recent' ? 'live-group-active' : ''}`}>
              <Clock className="w-4 h-4" /><span>Recently Watched</span>
            </button>
            <div className="px-2 pt-3 pb-1 text-[10px] uppercase tracking-widest text-slate-600">Provider groups</div>
            {visibleCategories.filter((cat) => cat.category_id !== 'all').map((cat, categoryIndex) => (
              <button key={cat.category_id} onKeyDown={(e) => handleGroupKeyDown(e, categoryIndex + 3)} onClick={() => selectGroup(cat.category_id)} className={`live-group ${quickFilter === 'category' && selectedCategoryId === cat.category_id ? 'live-group-active' : ''}`}>
                {parentalControlService.isCategoryLocked(cat.category_id, 'live') ? <Lock className="w-3.5 h-3.5 text-rose-400" /> : <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />}
                <span>{cat.category_name}</span>
              </button>
            ))}
          </div>
        </aside>

        <div className="flex-1 min-w-0 flex flex-col">
          <header className="h-14 shrink-0 flex items-center gap-3 px-3 sm:px-4 border-b border-slate-800/80 bg-[#070b13]">
            <select
              value={quickFilter === 'category' ? selectedCategoryId : quickFilter}
              onChange={(e) => {
                if (e.target.value === 'favorites' || e.target.value === 'recent') setQuickFilter(e.target.value);
                else selectGroup(e.target.value);
              }}
              className="lg:hidden max-w-36 bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-xs text-white"
              aria-label="Channel group"
            >
              <option value="all">All Channels</option>
              <option value="favorites">Favorites</option>
              <option value="recent">Recent</option>
              {visibleCategories.filter((c) => c.category_id !== 'all').map((c) => <option key={c.category_id} value={c.category_id}>{c.category_name}</option>)}
            </select>
            <div className="relative flex-1 max-w-xl">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input data-live-search value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  focusLiveCell(Math.max(0, filteredStreams.findIndex((stream) => String(stream.stream_id) === selectedStreamId)), 0);
                } else if (e.key === 'ArrowLeft') {
                  e.preventDefault();
                  focusGroup(activeGroupIndex());
                }
              }} placeholder="Search channels or programs" className="tv-focus-target w-full h-9 bg-[#0b111d] border border-slate-800 rounded-xl pl-8 pr-3 text-xs text-white focus:outline-none focus:border-cyan-400" />
            </div>
            <span className="hidden sm:block text-[11px] text-slate-500 tabular-nums">{filteredStreams.length.toLocaleString()} channels</span>
          </header>

          <div className="h-9 shrink-0 flex border-b border-slate-800 bg-[#060a11] text-[10px] uppercase tracking-wider text-slate-500">
            <div className="w-48 sm:w-56 shrink-0 px-3 flex items-center border-r border-slate-800">Channel</div>
            <div className="flex-1 grid grid-cols-3">
              <div className="px-3 flex items-center">Now</div>
              <div className="px-3 flex items-center border-l border-slate-800/60">Next</div>
              <div className="px-3 flex items-center border-l border-slate-800/60">Later</div>
            </div>
          </div>

          <div ref={scrollerRef} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)} className="flex-1 min-h-0 overflow-y-auto custom-scrollbar relative" role="grid" aria-label="Live channels and program guide">
            <div style={{ height: filteredStreams.length * ROW_HEIGHT, position: 'relative' }}>
              {windowedStreams.map((stream, localIndex) => {
                const index = startIndex + localIndex;
                const programs = epg[String(stream.stream_id)] || [];
                const selected = selectedStreamId === String(stream.stream_id);
                return (
                  <div key={stream.stream_id} style={{ position: 'absolute', top: index * ROW_HEIGHT, left: 0, right: 0, height: ROW_HEIGHT }} className={`flex border-b border-slate-800/60 ${selected ? 'bg-cyan-950/30' : 'bg-[#070b12] hover:bg-[#0b121e]'}`}>
                    <button
                      data-live-row={index}
                      data-live-col={0}
                      onFocus={() => setSelectedStreamId(String(stream.stream_id))}
                      onClick={() => setSelectedStreamId(String(stream.stream_id))}
                      onKeyDown={(e) => {
                        handleCellKeyDown(e, index, 0);
                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); play(stream); }
                      }}
                      className="w-48 sm:w-56 shrink-0 px-2 flex items-center gap-2 border-r border-slate-800 text-left tv-focus-target"
                    >
                      <span className="w-6 text-[10px] text-slate-500 font-mono text-right">{stream.num || index + 1}</span>
                      <div className="w-8 h-8 shrink-0 rounded-md bg-slate-900 flex items-center justify-center overflow-hidden p-1">
                        {stream.stream_icon ? <img src={stream.stream_icon} alt="" className="max-w-full max-h-full object-contain" loading="lazy" /> : <Tv className="w-4 h-4 text-slate-500" />}
                      </div>
                      <span className={`text-[11px] font-semibold truncate ${selected ? 'text-cyan-300' : 'text-slate-100'}`}>{stream.name}</span>
                    </button>

                    <div className="flex-1 min-w-0 grid grid-cols-3">
                      {[0, 1, 2].map((programIndex) => {
                        const program = programs[programIndex];
                        return (
                          <button
                            key={program?.id || programIndex}
                            data-live-row={index}
                            data-live-col={programIndex + 1}
                            onFocus={() => setSelectedStreamId(String(stream.stream_id))}
                            onKeyDown={(e) => {
                              handleCellKeyDown(e, index, programIndex + 1);
                              if ((e.key === 'Enter' || e.key === ' ') && programIndex === 0) {
                                e.preventDefault();
                                play(stream);
                              }
                            }}
                            onClick={() => {
                              setSelectedStreamId(String(stream.stream_id));
                              if (programIndex === 0) play(stream);
                            }}
                            className={`min-w-0 px-3 text-left border-l border-slate-800/50 tv-focus-target ${programIndex === 0 ? 'bg-cyan-950/10' : ''}`}
                            title={program?.description || program?.title || stream.currentProgram || stream.name}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-[11px] font-medium text-slate-200 truncate">{program?.title || (programIndex === 0 ? stream.currentProgram || 'Live' : 'No guide data')}</span>
                              {programIndex === 0 && <span className="text-[8px] font-bold text-rose-400 uppercase shrink-0">Live</span>}
                            </div>
                            {program && <div className="text-[9px] text-slate-600 font-mono mt-0.5">{timeLabel(program.start)}–{timeLabel(program.end)}</div>}
                          </button>
                        );
                      })}
                    </div>

                    <div className="w-16 shrink-0 flex items-center justify-center gap-1 border-l border-slate-800/60">
                      <button data-live-row={index} data-live-col={4} onFocus={() => setSelectedStreamId(String(stream.stream_id))} onKeyDown={(e) => handleCellKeyDown(e, index, 4)} onClick={() => onToggleFavorite(stream.stream_id)} className="p-1.5 rounded-md text-slate-500 hover:text-amber-400 tv-focus-target" aria-label={`${stream.isFavorite ? 'Remove' : 'Add'} ${stream.name} favorite`}>
                        <Star className={`w-3.5 h-3.5 ${stream.isFavorite ? 'fill-amber-400 text-amber-400' : ''}`} />
                      </button>
                      <button data-live-row={index} data-live-col={5} onFocus={() => setSelectedStreamId(String(stream.stream_id))} onKeyDown={(e) => { handleCellKeyDown(e, index, 5); if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); play(stream); } }} onClick={() => play(stream)} className="p-1.5 rounded-md bg-cyan-500 text-slate-950 tv-focus-target" aria-label={`Watch ${stream.name}`}>
                        <Play className="w-3.5 h-3.5 fill-current" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

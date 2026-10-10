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

type LiveZone = 'groups' | 'channels' | 'now' | 'next' | 'later' | 'favorite';
const ROW_HEIGHT = 58;
const OVERSCAN = 6;

const timeLabel = (value?: string) => {
  if (!value) return '';
  return value.split(' ')[1]?.slice(0, 5) || '';
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
  const [selectedStreamId, setSelectedStreamId] = useState('');
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(560);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const groupsRef = useRef<HTMLDivElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const canAccess = parentalControlService.canAccessSection('live');
  const parentalSettings = parentalControlService.getSettings();

  const visibleCategories = useMemo(
    () => categories.filter((cat) =>
      cat.category_id === 'all' ||
      !(parentalSettings.hideLockedContentCompletely && parentalControlService.isCategoryLocked(cat.category_id, 'live'))
    ),
    [categories, parentalSettings.hideLockedContentCompletely]
  );

  const filteredStreams = useMemo(() => {
    let list = streams.filter((stream) =>
      !(parentalSettings.hideLockedContentCompletely && parentalControlService.isChannelHidden(stream))
    );
    if (quickFilter === 'favorites') list = list.filter((stream) => stream.isFavorite);
    if (quickFilter === 'recent') {
      const ids = new Set(
        xtreamService.getHistory().filter((item) => item.type === 'live').map((item) => item.id)
      );
      list = list.filter((stream) => ids.has(`live_${stream.stream_id}`));
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((stream) =>
        stream.name.toLowerCase().includes(q) ||
        (epg[String(stream.stream_id)] || []).some((program) => program.title?.toLowerCase().includes(q))
      );
    }
    return list;
  }, [streams, quickFilter, searchQuery, epg, parentalSettings.hideLockedContentCompletely]);

  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const visibleCount = Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN * 2;
  const endIndex = Math.min(filteredStreams.length, startIndex + visibleCount);
  const windowedStreams = filteredStreams.slice(startIndex, endIndex);
  const selectedIndex = Math.max(0, filteredStreams.findIndex((s) => String(s.stream_id) === selectedStreamId));
  const selectedStream = filteredStreams[selectedIndex] || filteredStreams[0];
  const selectedPrograms = selectedStream ? epg[String(selectedStream.stream_id)] || [] : [];
  const selectedNow = selectedPrograms[0];

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
    return () => { cancelled = true; };
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
    if (parentalControlService.isChannelLocked(stream) && onPromptPinForStream) onPromptPinForStream(stream);
    else onPlayStream(stream);
  };

  const selectGroup = (categoryId: string) => {
    setQuickFilter('category');
    setScrollTop(0);
    scrollerRef.current?.scrollTo({ top: 0 });
    onSelectCategory(categoryId);
  };

  const groupButtons = () =>
    Array.from(groupsRef.current?.querySelectorAll<HTMLButtonElement>('[data-live-group]') ?? []);

  const activeGroupIndex = () => {
    if (quickFilter === 'favorites') return 1;
    if (quickFilter === 'recent') return 2;
    if (selectedCategoryId === 'all') return 0;
    const index = visibleCategories.filter((cat) => cat.category_id !== 'all')
      .findIndex((cat) => cat.category_id === selectedCategoryId);
    return index < 0 ? 0 : index + 3;
  };

  const focusGroup = (index = activeGroupIndex()) => {
    const groups = groupButtons();
    if (!groups.length) return;
    const target = groups[Math.max(0, Math.min(groups.length - 1, index))];
    target.focus({ preventScroll: true });
    target.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
  };

  const focusAppRail = () => {
    const target =
      document.querySelector<HTMLElement>('[data-tv-nav-item][aria-current="page"]') ||
      document.querySelector<HTMLElement>('[data-tv-nav-item]');
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
  };

  const selectorFor = (row: number, zone: LiveZone) =>
    `[data-live-row="${row}"][data-live-zone="${zone}"]`;

  const ensureRowVisible = (row: number) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const top = row * ROW_HEIGHT;
    const bottom = top + ROW_HEIGHT;
    if (top < scroller.scrollTop) scroller.scrollTop = top;
    else if (bottom > scroller.scrollTop + scroller.clientHeight) {
      scroller.scrollTop = Math.max(0, bottom - scroller.clientHeight);
    }
  };

  const focusCell = (row: number, zone: LiveZone) => {
    if (!filteredStreams.length) return;
    const safeRow = Math.max(0, Math.min(filteredStreams.length - 1, row));
    setSelectedStreamId(String(filteredStreams[safeRow].stream_id));
    ensureRowVisible(safeRow);

    const focusRenderedCell = () => {
      const target = workspaceRef.current?.querySelector<HTMLElement>(selectorFor(safeRow, zone));
      if (!target) return false;
      target.focus({ preventScroll: true });
      target.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
      return true;
    };

    // Rows already inside the virtualization window must hand off immediately.
    // If scrolling causes a new virtual row to mount, retry after React paints it.
    if (focusRenderedCell()) return;
    requestAnimationFrame(() => {
      if (focusRenderedCell()) return;
      requestAnimationFrame(focusRenderedCell);
    });
  };

  const zoneRight = (zone: LiveZone): LiveZone => {
    if (zone === 'channels') return 'now';
    if (zone === 'now') return 'next';
    if (zone === 'next') return 'later';
    if (zone === 'later') return 'favorite';
    return 'favorite';
  };

  const zoneLeft = (zone: LiveZone): LiveZone | 'groups' => {
    if (zone === 'channels') return 'groups';
    if (zone === 'now') return 'channels';
    if (zone === 'next') return 'now';
    if (zone === 'later') return 'next';
    return 'later';
  };

  const handleGridKey = (e: React.KeyboardEvent<HTMLElement>, row: number, zone: LiveZone) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault(); e.stopPropagation();
      focusCell(row + 1, zone);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault(); e.stopPropagation();
      if (row === 0) workspaceRef.current?.querySelector<HTMLElement>('[data-live-search]')?.focus();
      else focusCell(row - 1, zone);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault(); e.stopPropagation();
      focusCell(row, zoneRight(zone));
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault(); e.stopPropagation();
      const left = zoneLeft(zone);
      if (left === 'groups') focusGroup();
      else focusCell(row, left);
    }
  };

  const handleGroupKey = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault(); e.stopPropagation(); focusGroup(index + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault(); e.stopPropagation(); focusGroup(index - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault(); e.stopPropagation(); focusCell(selectedIndex, 'channels');
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault(); e.stopPropagation(); focusAppRail();
    }
  };

  const activateOnEnter = (e: React.KeyboardEvent<HTMLElement>, action: () => void) => {
    if (e.key === 'Enter' || e.key === 'NumpadEnter' || e.key === ' ') {
      e.preventDefault(); e.stopPropagation(); action();
    }
  };

  return (
    <section ref={workspaceRef} className="live-workspace -m-4 sm:-m-6 h-[calc(100dvh-4rem)] min-h-0 overflow-hidden bg-[#05080e]">
      <div className="h-full flex min-w-0">
        <aside className="flex w-36 sm:w-44 lg:w-52 xl:w-60 shrink-0 flex-col border-r border-slate-800/80 bg-[#080d16]">
          <div className="h-12 px-3 flex items-center gap-2 border-b border-slate-800/80">
            <Layers className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-200">Groups</span>
          </div>
          <div ref={groupsRef} className="p-2 space-y-1 overflow-y-auto custom-scrollbar">
            <button data-live-entry data-live-group onKeyDown={(e) => handleGroupKey(e, 0)} onClick={() => selectGroup('all')} className={`live-group tv-focus-target ${quickFilter === 'category' && selectedCategoryId === 'all' ? 'live-group-active' : ''}`}>
              <Tv className="w-4 h-4" /><span>All Channels</span><small>{streams.length}</small>
            </button>
            <button data-live-group onKeyDown={(e) => handleGroupKey(e, 1)} onClick={() => setQuickFilter('favorites')} className={`live-group tv-focus-target ${quickFilter === 'favorites' ? 'live-group-active' : ''}`}>
              <Star className="w-4 h-4" /><span>Favorites</span>
            </button>
            <button data-live-group onKeyDown={(e) => handleGroupKey(e, 2)} onClick={() => setQuickFilter('recent')} className={`live-group tv-focus-target ${quickFilter === 'recent' ? 'live-group-active' : ''}`}>
              <Clock className="w-4 h-4" /><span>Recently Watched</span>
            </button>
            <div className="px-2 pt-3 pb-1 text-[10px] uppercase tracking-widest text-slate-600">Provider groups</div>
            {visibleCategories.filter((cat) => cat.category_id !== 'all').map((cat, categoryIndex) => (
              <button key={cat.category_id} data-live-group onKeyDown={(e) => handleGroupKey(e, categoryIndex + 3)} onClick={() => selectGroup(cat.category_id)} className={`live-group tv-focus-target ${quickFilter === 'category' && selectedCategoryId === cat.category_id ? 'live-group-active' : ''}`}>
                {parentalControlService.isCategoryLocked(cat.category_id, 'live') ? <Lock className="w-3.5 h-3.5 text-rose-400" /> : <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />}
                <span>{cat.category_name}</span>
              </button>
            ))}
          </div>
        </aside>

        <div className="flex-1 min-w-0 flex flex-col">
          <div className="live-feature shrink-0 hidden xl:flex min-h-[138px] border-b border-slate-800/80 relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_30%,rgba(14,165,233,0.16),transparent_34%),linear-gradient(100deg,#08111f_0%,#0a1220_58%,#060a11_100%)]" />
            <div className="relative z-10 flex w-full items-center justify-between gap-8 px-6 py-4">
              <div className="flex min-w-0 items-center gap-4">
                <div className="w-16 h-16 shrink-0 rounded-2xl border border-slate-700/70 bg-[#0a1423] shadow-xl flex items-center justify-center overflow-hidden p-2">
                  {selectedStream?.stream_icon ? <img src={selectedStream.stream_icon} alt="" className="max-w-full max-h-full object-contain" /> : <Tv className="w-7 h-7 text-cyan-400" />}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-cyan-400 font-bold mb-1">
                    <span>Live TV</span><span className="w-1 h-1 rounded-full bg-slate-600" />
                    <span>{quickFilter === 'category' ? (visibleCategories.find((cat) => cat.category_id === selectedCategoryId)?.category_name || 'All Channels') : quickFilter === 'favorites' ? 'Favorites' : 'Recently Watched'}</span>
                  </div>
                  <h2 className="text-xl 2xl:text-2xl font-bold text-white font-heading truncate">{selectedNow?.title || selectedStream?.currentProgram || selectedStream?.name || 'Live TV'}</h2>
                  <div className="mt-1 text-xs text-slate-300 flex items-center gap-2">
                    <span className="font-semibold">{selectedStream?.name || 'Select a channel'}</span>
                    {selectedNow && <span className="text-slate-500 font-mono">{timeLabel(selectedNow.start)}–{timeLabel(selectedNow.end)}</span>}
                    {selectedStream && <span className="px-1.5 py-0.5 rounded bg-rose-500/15 border border-rose-500/30 text-[9px] font-black text-rose-400 uppercase">Live</span>}
                  </div>
                  <p className="mt-2 max-w-2xl text-[11px] leading-relaxed text-slate-400 line-clamp-2">{selectedNow?.description || 'Browse the guide, choose a channel, and keep your place while exploring what is on now and next.'}</p>
                </div>
              </div>
              {selectedStream && <button onClick={() => play(selectedStream)} className="tv-focus-target shrink-0 flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 border border-blue-400/40 px-4 py-2.5 text-xs font-bold text-white"><Play className="w-4 h-4 fill-current" /> Watch Live</button>}
            </div>
          </div>

          <header className="h-14 shrink-0 flex items-center gap-3 px-3 sm:px-4 border-b border-slate-800/80 bg-[#070b13]">
            <div className="relative flex-1 max-w-xl">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                data-live-search
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); focusCell(selectedIndex, 'channels'); }
                  else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); focusGroup(); }
                }}
                placeholder="Search channels or programs"
                className="tv-focus-target w-full h-9 bg-[#0b111d] border border-slate-800 rounded-xl pl-8 pr-3 text-xs text-white focus:outline-none focus:border-cyan-400"
              />
            </div>
            <span className="hidden sm:block text-[11px] text-slate-500 tabular-nums">{filteredStreams.length.toLocaleString()} channels</span>
          </header>

          <div className="h-10 shrink-0 flex border-b border-slate-800 bg-[#060a11] text-[10px] uppercase tracking-wider text-slate-500">
            <div className="w-40 sm:w-48 lg:w-56 shrink-0 px-3 flex items-center border-r border-slate-800">Channel</div>
            <div className="flex-1 grid grid-cols-3">
              <div className="px-3 flex items-center gap-2"><span className="text-cyan-400">Now</span><span className="h-px flex-1 bg-cyan-900/50" /></div>
              <div className="px-3 flex items-center border-l border-slate-800/60">Next</div>
              <div className="px-3 flex items-center border-l border-slate-800/60">Later</div>
            </div>
            <div className="w-16 shrink-0 border-l border-slate-800/60" />
          </div>

          <div ref={scrollerRef} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)} className="flex-1 min-h-0 overflow-y-auto custom-scrollbar relative" role="grid" aria-label="Live channels and program guide">
            <div style={{ height: filteredStreams.length * ROW_HEIGHT, position: 'relative' }}>
              {windowedStreams.map((stream, localIndex) => {
                const row = startIndex + localIndex;
                const programs = epg[String(stream.stream_id)] || [];
                const selected = selectedStreamId === String(stream.stream_id);
                const cellProps = (zone: LiveZone) => ({
                  'data-live-row': row,
                  'data-live-zone': zone,
                  onFocus: () => setSelectedStreamId(String(stream.stream_id)),
                  onMouseEnter: () => setSelectedStreamId(String(stream.stream_id)),
                  onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => handleGridKey(e, row, zone),
                });
                return (
                  <div key={stream.stream_id} style={{ position: 'absolute', top: row * ROW_HEIGHT, left: 0, right: 0, height: ROW_HEIGHT }} className={`live-guide-row flex border-b border-slate-800/60 ${selected ? 'live-guide-row-selected' : 'bg-[#070b12] hover:bg-[#0b121e]'}`}>
                    <button {...cellProps('channels')} onClick={() => play(stream)} onKeyDown={(e) => { handleGridKey(e, row, 'channels'); activateOnEnter(e, () => play(stream)); }} className="w-40 sm:w-48 lg:w-56 shrink-0 px-2 flex items-center gap-2 border-r border-slate-800 text-left tv-focus-target">
                      <span className="w-6 text-[10px] text-slate-500 font-mono text-right">{stream.num || row + 1}</span>
                      <div className="w-8 h-8 shrink-0 rounded-md bg-slate-900 flex items-center justify-center overflow-hidden p-1">
                        {stream.stream_icon ? <img src={stream.stream_icon} alt="" className="max-w-full max-h-full object-contain" loading="lazy" /> : <Tv className="w-4 h-4 text-slate-500" />}
                      </div>
                      <span className={`text-[11px] font-semibold truncate ${selected ? 'text-cyan-300' : 'text-slate-100'}`}>{stream.name}</span>
                    </button>

                    <div className="flex-1 min-w-0 grid grid-cols-3">
                      {(['now', 'next', 'later'] as LiveZone[]).map((zone, programIndex) => {
                        const program = programs[programIndex];
                        return (
                          <button
                            key={program?.id || zone}
                            {...cellProps(zone)}
                            onClick={() => { setSelectedStreamId(String(stream.stream_id)); if (zone === 'now') play(stream); }}
                            onKeyDown={(e) => { handleGridKey(e, row, zone); if (zone === 'now') activateOnEnter(e, () => play(stream)); }}
                            className={`min-w-0 px-3 text-left border-l border-slate-800/50 tv-focus-target ${zone === 'now' ? 'bg-cyan-950/10' : ''}`}
                            title={program?.description || program?.title || stream.currentProgram || stream.name}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-[11px] font-medium text-slate-200 truncate">{program?.title || (zone === 'now' ? stream.currentProgram || 'Live' : 'No guide data')}</span>
                              {zone === 'now' && <span className="text-[8px] font-bold text-rose-400 uppercase shrink-0">Live</span>}
                            </div>
                            {program && <div className="text-[9px] text-slate-600 font-mono mt-0.5">{timeLabel(program.start)}–{timeLabel(program.end)}</div>}
                          </button>
                        );
                      })}
                    </div>

                    <div className="w-16 shrink-0 flex items-center justify-center border-l border-slate-800/60">
                      <button {...cellProps('favorite')} onClick={() => onToggleFavorite(stream.stream_id)} onKeyDown={(e) => { handleGridKey(e, row, 'favorite'); activateOnEnter(e, () => onToggleFavorite(stream.stream_id)); }} className="p-2 rounded-md text-slate-500 hover:text-amber-400 tv-focus-target" aria-label={`${stream.isFavorite ? 'Remove' : 'Add'} ${stream.name} favorite`}>
                        <Star className={`w-3.5 h-3.5 ${stream.isFavorite ? 'fill-amber-400 text-amber-400' : ''}`} />
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

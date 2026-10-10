import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Home, Layers, Star, Tv } from 'lucide-react';
import { XtreamCategory, XtreamLiveStream } from '../types/xtream';

// Keep only the visible channels mounted; providers can expose 8,000+ entries.
const ROW_HEIGHT = 58;
const OVERSCAN = 6;

interface WatchingGuideOverlayProps {
  categories: XtreamCategory[];
  streams: XtreamLiveStream[];
  currentStream: XtreamLiveStream;
  onPlayStream: (stream: XtreamLiveStream) => void;
  onClose: () => void;
  onOpenAppNavigation: () => void;
}

export const WatchingGuideOverlay: React.FC<WatchingGuideOverlayProps> = ({
  categories,
  streams,
  currentStream,
  onPlayStream,
  onClose,
  onOpenAppNavigation,
}) => {
  const [groupId, setGroupId] = useState<string>('all');
  const [focusedStreamId, setFocusedStreamId] = useState<string>(String(currentStream.stream_id));
  const rowRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const groupRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const homeButtonRef = useRef<HTMLButtonElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(360);

  const groups = useMemo(() => [
    { id: 'all', name: 'All Channels' },
    { id: 'favorites', name: 'Favorites' },
    ...categories
      .filter((category) => category.category_id !== 'all')
      .map((category) => ({ id: category.category_id, name: category.category_name })),
  ], [categories]);

  const visibleStreams = useMemo(() => {
    if (groupId === 'favorites') return streams.filter((stream) => stream.isFavorite);
    if (groupId === 'all') return streams;
    return streams.filter((stream) => stream.category_id === groupId);
  }, [groupId, streams]);

  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const count = Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN * 2;
  const windowedStreams = visibleStreams.slice(startIndex, startIndex + count);

  useEffect(() => {
    const node = listRef.current;
    if (!node) return;
    const update = () => setViewportHeight(node.clientHeight || 360);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleOverlayKeys = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Backspace') {
        event.preventDefault();
        event.stopImmediatePropagation();
        onClose();
        return;
      }

      const target = event.target as HTMLElement | null;
      if (event.key === 'ArrowLeft' && target?.hasAttribute('data-watching-channel')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const activeGroup = groupRefs.current[groupId] || groupRefs.current.all;
        activeGroup?.focus();
        activeGroup?.scrollIntoView({ block: 'nearest' });
        return;
      }

      if (event.key === 'ArrowLeft' && target?.hasAttribute('data-watching-group')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        onOpenAppNavigation();
      }
    };

    // Capture phase makes the temporary Watching Guide the sole owner of its
    // spatial Left/Back routes before App-level TV navigation can intercept them.
    window.addEventListener('keydown', handleOverlayKeys, true);
    return () => window.removeEventListener('keydown', handleOverlayKeys, true);
  }, [groupId, onClose, onOpenAppNavigation]);

  useEffect(() => {
    // On open or group switch, reveal the playing channel (or the first row).
    // A virtualized row is mounted only after the scroller is moved.
    if (!visibleStreams.length) return;
    const selectedIndex = visibleStreams.findIndex(
      (stream) => String(stream.stream_id) === String(currentStream.stream_id)
    );
    const index = selectedIndex >= 0 ? selectedIndex : 0;
    const id = String(visibleStreams[index].stream_id);
    const scroller = listRef.current;
    if (scroller) {
      scroller.scrollTop = Math.max(0, index * ROW_HEIGHT - scroller.clientHeight / 2);
      setScrollTop(scroller.scrollTop);
    }
    setFocusedStreamId(id);
    requestAnimationFrame(() => requestAnimationFrame(() => rowRefs.current[id]?.focus({ preventScroll: true })));
  }, [groupId, currentStream.stream_id]);

  const focusStream = (index: number) => {
    if (!visibleStreams.length) return;
    const safeIndex = Math.max(0, Math.min(index, visibleStreams.length - 1));
    const id = String(visibleStreams[safeIndex].stream_id);
    const scroller = listRef.current;
    if (scroller) {
      const top = safeIndex * ROW_HEIGHT;
      if (top < scroller.scrollTop) scroller.scrollTop = top;
      else if (top + ROW_HEIGHT > scroller.scrollTop + scroller.clientHeight) {
        scroller.scrollTop = top + ROW_HEIGHT - scroller.clientHeight;
      }
      setScrollTop(scroller.scrollTop);
    }
    setFocusedStreamId(id);
    requestAnimationFrame(() => requestAnimationFrame(() => rowRefs.current[id]?.focus({ preventScroll: true })));
  };

  const handleRowKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusStream(index - 1);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusStream(index + 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      event.stopPropagation();
      const activeGroup = groupRefs.current[groupId] || groupRefs.current.all;
      activeGroup?.focus();
      activeGroup?.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      homeButtonRef.current?.focus();
    } else if (event.key === 'Escape' || event.key === 'Backspace') {
      event.preventDefault();
      onClose();
    }
  };

  const handleGroupKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const groupButtons = groups
      .map((group) => groupRefs.current[group.id])
      .filter((button): button is HTMLButtonElement => Boolean(button));

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      groupButtons[Math.max(0, index - 1)]?.focus();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      groupButtons[Math.min(groupButtons.length - 1, index + 1)]?.focus();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      const currentIndex = Math.max(
        0,
        visibleStreams.findIndex((stream) => String(stream.stream_id) === focusedStreamId)
      );
      focusStream(currentIndex);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      event.stopPropagation();
      onOpenAppNavigation();
    } else if (event.key === 'Escape' || event.key === 'Backspace') {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <div
      data-watching-guide
      className="fixed inset-0 z-[60] pointer-events-none"
      aria-label="Watching guide"
    >
      <div className="absolute inset-0 bg-gradient-to-r from-black/88 via-black/48 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-[min(74dvh,620px)] pointer-events-auto flex items-end">
        <section className="w-full max-h-[min(72dvh,600px)] border-t border-white/10 bg-gradient-to-r from-[#050912]/94 via-[#07101b]/84 to-black/35 backdrop-blur-md shadow-[0_-24px_80px_rgba(0,0,0,0.45)]">
          <div className="h-14 px-6 flex items-center justify-between border-b border-white/10">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-400"><span>Live TV</span><span className="text-slate-600">•</span><span className="text-slate-400">Watching</span></div>
              <div className="text-sm font-semibold text-white truncate">
                {currentStream.name}
                <span className="ml-3 text-xs font-normal text-slate-400">
                  {currentStream.currentProgram || 'Now playing'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
            <button
              ref={homeButtonRef}
              onClick={onOpenAppNavigation}
              onKeyDown={(event) => {
                if (event.key === 'ArrowRight') {
                  event.preventDefault();
                  closeButtonRef.current?.focus();
                } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
                  event.preventDefault();
                  const currentIndex = Math.max(0, visibleStreams.findIndex((stream) => String(stream.stream_id) === focusedStreamId));
                  focusStream(currentIndex);
                }
              }}
              className="tv-focus-target flex items-center gap-2 rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-400/95"
            >
              <Home className="w-3.5 h-3.5" /> Home
            </button>
            <button
              ref={closeButtonRef}
              onClick={onClose}
              onKeyDown={(event) => {
                if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
                  event.preventDefault();
                  const currentIndex = Math.max(0, visibleStreams.findIndex((stream) => String(stream.stream_id) === focusedStreamId));
                  focusStream(currentIndex);
                }
              }}
              className="tv-focus-target flex items-center gap-2 rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-400/95"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Video
            </button>
            </div>
          </div>

          <div className="flex h-[clamp(260px,52dvh,500px)] min-h-0">
            <aside className="w-[var(--gs-group-rail-width)] shrink-0 border-r border-white/10 bg-black/28 p-2.5 overflow-y-auto custom-scrollbar">
              <div className="flex items-center gap-2 px-2 pb-2 text-[10px] uppercase tracking-widest text-slate-400">
                <Layers className="w-3.5 h-3.5" /> Groups
              </div>
              {groups.map((group, index) => (
                <button
                  key={group.id}
                  ref={(element) => { groupRefs.current[group.id] = element; }}
                  data-watching-group
                  onKeyDown={(event) => handleGroupKeyDown(event, index)}
                  onClick={() => {
                    // Group change effect scrolls to a row in the NEW group.
                    setGroupId(group.id);
                  }}
                  className={`watching-group ${groupId === group.id ? 'watching-group-active' : ''} tv-focus-target w-full rounded-xl px-3 py-2.5 mb-1 flex items-center gap-2 text-left text-xs transition bg-white/0 hover:bg-white/8 focus:outline-none focus:ring-2 focus:ring-cyan-400/90 ${groupId === group.id ? 'bg-cyan-500/14 text-cyan-200' : 'text-slate-300'}`}
                >
                  {group.id === 'favorites' ? <Star className="w-3.5 h-3.5" /> : <Tv className="w-3.5 h-3.5" />}
                  <span className="truncate">{group.name}</span>
                </button>
              ))}
            </aside>

            <div
              ref={listRef}
              onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
              className="flex-1 min-w-0 overflow-y-auto custom-scrollbar pr-2 sm:pr-4"
            >
              <div className="relative" style={{ height: visibleStreams.length * ROW_HEIGHT }}>
              {windowedStreams.map((stream, windowIndex) => {
                const index = startIndex + windowIndex;
                const isPlaying = String(stream.stream_id) === String(currentStream.stream_id);
                return (
                  <button
                    key={stream.stream_id}
                    style={{ position: 'absolute', left: 0, right: 0, top: index * ROW_HEIGHT, height: ROW_HEIGHT - 2 }}
                    ref={(element) => { rowRefs.current[String(stream.stream_id)] = element; }}
                    data-watching-channel
                    onFocus={() => setFocusedStreamId(String(stream.stream_id))}
                    onKeyDown={(event) => handleRowKeyDown(event, index)}
                    onClick={() => onPlayStream(stream)}
                    className={`tv-focus-target mx-2 w-[calc(100%-1rem)] min-h-14 rounded-xl px-3 flex items-center gap-3 text-left border transition focus:outline-none focus:ring-2 focus:ring-cyan-400/95 ${isPlaying ? 'border-cyan-400/35 bg-cyan-500/12' : 'border-transparent bg-black/10 hover:bg-white/7'}`}
                  >
                    <span className="w-8 text-right text-[10px] tabular-nums text-slate-500">{stream.num || index + 1}</span>
                    <div className="w-9 h-9 shrink-0 rounded-lg bg-black/35 flex items-center justify-center overflow-hidden p-1">
                      {stream.stream_icon ? <img src={stream.stream_icon} alt="" className="max-w-full max-h-full object-contain" /> : <Tv className="w-4 h-4 text-slate-500" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className={`text-sm font-semibold truncate ${isPlaying ? 'text-cyan-200' : 'text-white'}`}>{stream.name}</div>
                      <div className="text-[11px] text-slate-400 truncate">{stream.currentProgram || 'Live'}</div>
                    </div>
                    {isPlaying && <span className="text-[9px] font-black uppercase tracking-wider text-cyan-300">Playing</span>}
                  </button>
                );
              })}
              </div>
              {!visibleStreams.length && (
                <div className="p-8 text-sm text-slate-400">No channels in this group.</div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

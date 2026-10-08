import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Layers, Star, Tv } from 'lucide-react';
import { XtreamCategory, XtreamLiveStream } from '../types/xtream';

interface WatchingGuideOverlayProps {
  categories: XtreamCategory[];
  streams: XtreamLiveStream[];
  currentStream: XtreamLiveStream;
  onPlayStream: (stream: XtreamLiveStream) => void;
  onClose: () => void;
}

export const WatchingGuideOverlay: React.FC<WatchingGuideOverlayProps> = ({
  categories,
  streams,
  currentStream,
  onPlayStream,
  onClose,
}) => {
  const [groupId, setGroupId] = useState<string>('all');
  const [focusedStreamId, setFocusedStreamId] = useState<string>(String(currentStream.stream_id));
  const rowRefs = useRef<Record<string, HTMLButtonElement | null>>({});

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

  useEffect(() => {
    const id = String(currentStream.stream_id);
    setFocusedStreamId(id);
    requestAnimationFrame(() => {
      const row = rowRefs.current[id];
      row?.focus();
      row?.scrollIntoView({ block: 'center' });
    });
  }, [currentStream.stream_id]);

  const focusStream = (index: number) => {
    if (!visibleStreams.length) return;
    const safeIndex = Math.max(0, Math.min(index, visibleStreams.length - 1));
    const id = String(visibleStreams[safeIndex].stream_id);
    setFocusedStreamId(id);
    requestAnimationFrame(() => {
      rowRefs.current[id]?.focus();
      rowRefs.current[id]?.scrollIntoView({ block: 'nearest' });
    });
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
      const activeGroup = document.querySelector<HTMLElement>('[data-watching-group].watching-group-active');
      activeGroup?.focus();
    } else if (event.key === 'Escape' || event.key === 'Backspace') {
      event.preventDefault();
      onClose();
    }
  };

  const handleGroupKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const groupButtons = Array.from(document.querySelectorAll<HTMLElement>('[data-watching-group]'));
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      groupButtons[Math.max(0, index - 1)]?.focus();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      groupButtons[Math.min(groupButtons.length - 1, index + 1)]?.focus();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      const currentIndex = Math.max(0, visibleStreams.findIndex((stream) => String(stream.stream_id) === focusedStreamId));
      focusStream(currentIndex);
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
      <div className="absolute inset-x-0 bottom-0 h-[76vh] min-h-[430px] pointer-events-auto flex items-end">
        <section className="w-full max-h-[72vh] border-t border-white/10 bg-gradient-to-r from-[#050912]/94 via-[#07101b]/84 to-black/35 backdrop-blur-md shadow-[0_-24px_80px_rgba(0,0,0,0.45)]">
          <div className="h-14 px-6 flex items-center justify-between border-b border-white/10">
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-400">Live TV</div>
              <div className="text-sm font-semibold text-white truncate">
                {currentStream.name}
                <span className="ml-3 text-xs font-normal text-slate-400">
                  {currentStream.currentProgram || 'Now playing'}
                </span>
              </div>
            </div>
            <div className="text-[11px] text-slate-400">Back to video · Enter to watch</div>
          </div>

          <div className="flex h-[min(58vh,520px)] min-h-[330px]">
            <aside className="w-56 shrink-0 border-r border-white/10 bg-black/28 p-3 overflow-y-auto custom-scrollbar">
              <div className="flex items-center gap-2 px-2 pb-2 text-[10px] uppercase tracking-widest text-slate-400">
                <Layers className="w-3.5 h-3.5" /> Groups
              </div>
              {groups.map((group, index) => (
                <button
                  key={group.id}
                  data-watching-group
                  onKeyDown={(event) => handleGroupKeyDown(event, index)}
                  onClick={() => {
                    setGroupId(group.id);
                    requestAnimationFrame(() => focusStream(0));
                  }}
                  className={`watching-group ${groupId === group.id ? 'watching-group-active' : ''} tv-focus-target w-full rounded-xl px-3 py-2.5 mb-1 flex items-center gap-2 text-left text-xs transition bg-white/0 hover:bg-white/8 focus:outline-none focus:ring-2 focus:ring-cyan-400/90 ${groupId === group.id ? 'bg-cyan-500/14 text-cyan-200' : 'text-slate-300'}`}
                >
                  {group.id === 'favorites' ? <Star className="w-3.5 h-3.5" /> : <Tv className="w-3.5 h-3.5" />}
                  <span className="truncate">{group.name}</span>
                </button>
              ))}
            </aside>

            <div className="flex-1 min-w-0 overflow-y-auto custom-scrollbar py-2 pr-[18vw]">
              {visibleStreams.map((stream, index) => {
                const isPlaying = String(stream.stream_id) === String(currentStream.stream_id);
                return (
                  <button
                    key={stream.stream_id}
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

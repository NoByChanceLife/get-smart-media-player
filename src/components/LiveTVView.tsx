import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Tv,
  Star,
  Search,
  Radio,
  Play,
  PictureInPicture2,
  Lock,
  ShieldAlert,
  Clock,
  Calendar,
  Layers,
  ChevronRight,
  Maximize2,
  Info,
  Sliders,
  Filter,
} from 'lucide-react';
import { XtreamCategory, XtreamLiveStream } from '../types/xtream';
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

export const LiveTVView: React.FC<LiveTVViewProps> = ({
  categories,
  streams,
  selectedCategoryId,
  onSelectCategory,
  onPlayStream,
  onLaunchPiP,
  onToggleFavorite,
  onPromptPinForStream,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeGroupFilter, setActiveGroupFilter] = useState<'category' | 'favorites' | 'recent'>('category');
  const [focusedChannelIndex, setFocusedChannelIndex] = useState<number>(0);
  const [previewStream, setPreviewStream] = useState<XtreamLiveStream | null>(null);

  const canAccess = parentalControlService.canAccessSection('live');
  const parentalSettings = parentalControlService.getSettings();

  // If section access is restricted for this profile
  if (!canAccess) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center bg-[#0d1424] rounded-3xl border border-slate-800 p-8 max-w-lg mx-auto">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-4">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h3 className="text-base font-bold text-white font-heading">Live TV Restricted</h3>
        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
          Access to Live TV channels is disabled for this user profile by the Master Administrator.
        </p>
      </div>
    );
  }

  // Filter categories according to parental policy
  const visibleCategories = useMemo(() => {
    return categories.filter((cat) => {
      if (cat.category_id === 'all') return true;
      const isLocked = parentalControlService.isCategoryLocked(cat.category_id, 'live');
      if (isLocked && parentalSettings.hideLockedContentCompletely) {
        return false;
      }
      return true;
    });
  }, [categories, parentalSettings.hideLockedContentCompletely]);

  // Filter streams
  const filteredStreams = useMemo(() => {
    let list = streams.filter((stream) => {
      if (parentalSettings.hideLockedContentCompletely && parentalControlService.isChannelHidden(stream)) {
        return false;
      }
      return true;
    });

    if (activeGroupFilter === 'favorites') {
      list = list.filter((s) => s.isFavorite);
    } else if (activeGroupFilter === 'recent') {
      const history = xtreamService.getHistory().filter((h) => h.type === 'live');
      const recentIds = new Set(history.map((h) => h.id));
      list = list.filter((s) => recentIds.has(`live_${s.stream_id}`));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.currentProgram && s.currentProgram.toLowerCase().includes(q))
      );
    }

    return list;
  }, [streams, activeGroupFilter, searchQuery, parentalSettings.hideLockedContentCompletely]);

  // Keep preview stream in sync with active stream
  useEffect(() => {
    if (filteredStreams.length > 0) {
      if (!previewStream || !filteredStreams.some((s) => s.stream_id === previewStream.stream_id)) {
        setPreviewStream(filteredStreams[0]);
        setFocusedChannelIndex(0);
      }
    } else {
      setPreviewStream(null);
    }
  }, [filteredStreams, previewStream]);

  const handleChannelClick = (stream: XtreamLiveStream) => {
    setPreviewStream(stream);
    const isLocked = parentalControlService.isChannelLocked(stream);
    if (isLocked && onPromptPinForStream) {
      onPromptPinForStream(stream);
    } else {
      onPlayStream(stream);
    }
  };

  const handleChannelSelectOnly = (stream: XtreamLiveStream, index: number) => {
    setPreviewStream(stream);
    setFocusedChannelIndex(index);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-5.5rem)] min-h-[580px] -m-4 sm:-m-6 p-4 sm:p-6 overflow-hidden">
      {/* 3-Column Television Live TV Architecture */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-4 h-full min-h-0">
        
        {/* AREA 1: GROUPS / CATEGORIES (3 Cols on desktop) */}
        <div className="hidden lg:flex md:col-span-3 lg:col-span-3 flex-col bg-[#090e1a] rounded-3xl border border-slate-800/80 p-3 h-full min-h-0 overflow-hidden shadow-xl">
          <div className="px-3 py-2 flex items-center justify-between border-b border-slate-800/60 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-cyan-400 font-heading flex items-center gap-2">
              <Layers className="w-3.5 h-3.5" />
              <span>Channel Groups</span>
            </span>
            <span className="text-[10px] font-mono text-slate-500">{visibleCategories.length + 2}</span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-1 custom-scrollbar pr-1">
            {/* Quick Filter: All Channels */}
            <button
              onClick={() => {
                setActiveGroupFilter('category');
                onSelectCategory('all');
              }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-2xl text-xs font-bold transition-all tv-focus-target ${
                activeGroupFilter === 'category' && selectedCategoryId === 'all'
                  ? 'bg-cyan-600 text-white shadow-md shadow-cyan-950/50'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center gap-2.5 truncate">
                <Tv className="w-4 h-4 shrink-0 text-cyan-400" />
                <span className="truncate">All Channels</span>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/40 text-slate-400">
                {streams.length}
              </span>
            </button>

            {/* Quick Filter: Favorites */}
            <button
              onClick={() => {
                setActiveGroupFilter('favorites');
              }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-2xl text-xs font-bold transition-all tv-focus-target ${
                activeGroupFilter === 'favorites'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-950/50'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center gap-2.5 truncate">
                <Star className="w-4 h-4 shrink-0 fill-current text-amber-400" />
                <span className="truncate">Starred Favorites</span>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/40 text-slate-400">
                {streams.filter((s) => s.isFavorite).length}
              </span>
            </button>

            {/* Quick Filter: Recent Channels */}
            <button
              onClick={() => {
                setActiveGroupFilter('recent');
              }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-2xl text-xs font-bold transition-all tv-focus-target ${
                activeGroupFilter === 'recent'
                  ? 'bg-cyan-600 text-white shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center gap-2.5 truncate">
                <Clock className="w-4 h-4 shrink-0 text-cyan-400" />
                <span className="truncate">Recent Channels</span>
              </div>
            </button>

            <div className="pt-2 pb-1 px-3">
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                Categories
              </span>
            </div>

            {/* Standard Category List */}
            {visibleCategories
              .filter((c) => c.category_id !== 'all')
              .map((cat) => {
                const isSelected = activeGroupFilter === 'category' && selectedCategoryId === cat.category_id;
                const isCatLocked = parentalControlService.isCategoryLocked(cat.category_id, 'live');

                return (
                  <button
                    key={cat.category_id}
                    onClick={() => {
                      setActiveGroupFilter('category');
                      onSelectCategory(cat.category_id);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-2xl text-xs font-semibold transition-all tv-focus-target ${
                      isSelected
                        ? 'bg-cyan-600 text-white shadow-md shadow-cyan-950/50 font-bold'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      {isCatLocked ? (
                        <Lock className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      ) : (
                        <span className="w-2 h-2 rounded-full bg-cyan-500 shrink-0" />
                      )}
                      <span className="truncate">{cat.category_name}</span>
                    </div>

                    {isCatLocked && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-950/80 text-rose-400 border border-rose-800/50">
                        PIN
                      </span>
                    )}
                  </button>
                );
              })}
          </div>
        </div>

        {/* AREA 2: CHANNELS LIST (5 Cols on desktop / 6 on tablet / full on mobile) */}
        <div className="md:col-span-6 lg:col-span-5 flex flex-col bg-[#090e1a] rounded-3xl border border-slate-800/80 p-3.5 h-full min-h-0 overflow-hidden shadow-xl">
          {/* Channel Search & Mobile Category Toggle */}
          <div className="flex items-center gap-2 mb-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search channel or program..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#05080e] border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition"
              />
            </div>

            {/* Mobile Category Dropdown */}
            <div className="lg:hidden flex items-center">
              <select
                value={selectedCategoryId}
                onChange={(e) => {
                  setActiveGroupFilter('category');
                  onSelectCategory(e.target.value);
                }}
                className="bg-slate-900 border border-slate-800 rounded-xl px-2 py-2 text-xs text-cyan-300 font-semibold focus:outline-none"
              >
                <option value="all">⭐ All Channels</option>
                {visibleCategories.map((c) => (
                  <option key={c.category_id} value={c.category_id}>
                    {c.category_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Channels Count & Header */}
          <div className="flex items-center justify-between px-2 pb-2 text-[11px] text-slate-400 border-b border-slate-800/60 mb-1">
            <span>{filteredStreams.length} Channels Available</span>
            <span className="hidden sm:inline text-slate-500">Press OK to play Fullscreen</span>
          </div>

          {/* Channel Rows */}
          <div className="flex-1 overflow-y-auto space-y-1.5 custom-scrollbar pr-1">
            {filteredStreams.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400">
                <Tv className="w-10 h-10 text-slate-600 mb-2" />
                <p className="text-xs">No channels found in this group.</p>
              </div>
            ) : (
              filteredStreams.map((stream, idx) => {
                const isSelected = previewStream?.stream_id === stream.stream_id;
                const isLocked = parentalControlService.isChannelLocked(stream);

                return (
                  <div
                    key={stream.stream_id}
                    onClick={() => handleChannelSelectOnly(stream, idx)}
                    onDoubleClick={() => handleChannelClick(stream)}
                    className={`group flex items-center justify-between p-2.5 rounded-2xl border transition-all duration-150 cursor-pointer select-none tv-focus-target ${
                      isSelected
                        ? 'bg-cyan-950/70 border-cyan-500 shadow-md shadow-cyan-950/40'
                        : 'bg-[#06090f]/70 border-slate-800/80 hover:bg-slate-850 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {/* Channel Number */}
                      <span className="w-7 text-[11px] font-mono font-bold text-slate-500 text-center shrink-0">
                        {stream.num || idx + 1}
                      </span>

                      {/* Channel Logo */}
                      <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center p-1 shrink-0 overflow-hidden">
                        {stream.stream_icon ? (
                          <img
                            src={stream.stream_icon}
                            alt={stream.name}
                            className="max-h-full max-w-full object-contain"
                            loading="lazy"
                          />
                        ) : (
                          <Tv className="w-4 h-4 text-cyan-400" />
                        )}
                      </div>

                      {/* Channel & Current Program */}
                      <div className="min-w-0 flex-1 pr-2">
                        <div className="flex items-center gap-1.5">
                          <h4
                            className={`text-xs font-bold truncate ${
                              isSelected ? 'text-cyan-300' : 'text-white'
                            }`}
                          >
                            {stream.name}
                          </h4>
                          {isLocked && <Lock className="w-3 h-3 text-rose-400 shrink-0" />}
                        </div>

                        <p className="text-[11px] text-slate-400 truncate mt-0.5">
                          {stream.currentProgram || 'Live Programming'}
                        </p>
                      </div>
                    </div>

                    {/* Channel Actions: Subtle Server indicator + Play Button */}
                    <div className="flex items-center gap-1 shrink-0">
                      {stream.serverName && (
                        <span className="hidden xl:inline text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono truncate max-w-[70px]">
                          {stream.serverName}
                        </span>
                      )}

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleFavorite(stream.stream_id);
                        }}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-amber-400 transition"
                        title="Star Favorite"
                      >
                        <Star
                          className={`w-3.5 h-3.5 ${
                            stream.isFavorite ? 'fill-amber-400 text-amber-400' : ''
                          }`}
                        />
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleChannelClick(stream);
                        }}
                        className={`w-8 h-8 rounded-xl flex items-center justify-center transition active:scale-95 ${
                          isSelected
                            ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/40'
                            : 'bg-slate-800 text-slate-300 hover:bg-cyan-500 hover:text-slate-950'
                        }`}
                        title="Watch Fullscreen"
                      >
                        <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* AREA 3: PROGRAM / PREVIEW INFO PANEL (4 Cols on desktop / 6 on tablet / hidden on mobile unless drawer) */}
        <div className="hidden md:flex md:col-span-6 lg:col-span-4 flex-col bg-[#090e1a] rounded-3xl border border-slate-800/80 p-5 h-full min-h-0 overflow-y-auto custom-scrollbar shadow-2xl justify-between">
          {previewStream ? (
            <div className="space-y-5">
              {/* Preview Window Header / Mock Stream Screen */}
              <div className="relative aspect-video rounded-2xl bg-black border border-slate-800 overflow-hidden shadow-xl group">
                <div
                  className="absolute inset-0 bg-cover bg-center opacity-30 transform scale-105"
                  style={{
                    backgroundImage: previewStream.stream_icon
                      ? `url(${previewStream.stream_icon})`
                      : 'linear-gradient(135deg, #0f172a 0%, #030712 100%)',
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />

                {/* Center Channel Watermark */}
                <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-black/60 border border-white/10 flex items-center justify-center p-2 mb-2 shadow-lg backdrop-blur-md">
                    {previewStream.stream_icon ? (
                      <img
                        src={previewStream.stream_icon}
                        alt={previewStream.name}
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <Tv className="w-7 h-7 text-cyan-400" />
                    )}
                  </div>
                  <span className="text-xs font-bold text-white tracking-wide drop-shadow">
                    {previewStream.name}
                  </span>
                </div>

                {/* Direct Play Action Overlay */}
                <button
                  onClick={() => handleChannelClick(previewStream)}
                  className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity backdrop-blur-xs"
                >
                  <div className="px-4 py-2 rounded-xl bg-cyan-500 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-xl">
                    <Maximize2 className="w-4 h-4" />
                    <span>Watch Fullscreen</span>
                  </div>
                </button>
              </div>

              {/* Channel Meta & Live Status */}
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="px-2 py-0.5 rounded-md bg-rose-600 text-[10px] font-bold text-white uppercase tracking-wider animate-pulse flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-white" />
                    LIVE
                  </span>
                  {previewStream.serverName && (
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-mono">
                      Source: {previewStream.serverName}
                    </span>
                  )}
                </div>

                <h3 className="text-lg font-bold text-white font-heading">
                  {previewStream.name}
                </h3>
              </div>

              {/* Now Playing Block */}
              <div className="p-4 rounded-2xl bg-[#06090f] border border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-cyan-400 flex items-center gap-1.5">
                    <Radio className="w-3.5 h-3.5 animate-pulse" />
                    <span>Now Playing</span>
                  </span>
                  <span className="text-slate-400 font-mono">LIVE HD</span>
                </div>

                <h4 className="text-sm font-bold text-white">
                  {previewStream.currentProgram || 'General Broadcast Feed'}
                </h4>

                <p className="text-xs text-slate-400 leading-relaxed">
                  Real-time high-definition video stream broadcast via Xtream Codes protocol. Smooth HLS low-latency streaming active.
                </p>

                {/* Progress Bar Mock */}
                <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden mt-2">
                  <div className="h-full bg-cyan-400 rounded-full w-2/3" />
                </div>
              </div>

              {/* Quick Actions (Fullscreen, PiP, Star) */}
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  onClick={() => handleChannelClick(previewStream)}
                  className="w-full py-3 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/25 transition active:scale-95 tv-focus-target"
                >
                  <Play className="w-4 h-4 fill-slate-950" />
                  <span>Watch (Enter)</span>
                </button>

                {onLaunchPiP && (
                  <button
                    onClick={() => onLaunchPiP(previewStream)}
                    className="w-full py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-semibold flex items-center justify-center gap-2 border border-slate-700 transition active:scale-95 tv-focus-target"
                    title="Launch Picture-in-Picture"
                  >
                    <PictureInPicture2 className="w-4 h-4" />
                    <span>Floating PiP</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center text-slate-500">
              <Tv className="w-12 h-12 mb-3 text-slate-700" />
              <p className="text-xs">Select any channel to view live program details.</p>
            </div>
          )}

          {/* Quick TV Remote Navigation Guide */}
          <div className="mt-4 pt-3 border-t border-slate-800/60 text-[10px] text-slate-500 flex items-center justify-between">
            <span>Remote: Up/Down to navigate</span>
            <span>OK: Play Fullscreen</span>
          </div>
        </div>

      </div>
    </div>
  );
};

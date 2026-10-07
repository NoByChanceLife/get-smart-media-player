import React, { useState, useEffect, useRef } from 'react';
import {
  Calendar,
  Clock,
  Tv,
  Play,
  Info,
  ChevronRight,
  ChevronLeft,
  X,
  Bell,
  Check,
  Radio,
  Maximize2,
} from 'lucide-react';
import { XtreamLiveStream, XtreamEPGProgramme } from '../types/xtream';
import { xtreamService } from '../services/xtreamClient';

interface EPGViewProps {
  streams: XtreamLiveStream[];
  onPlayStream: (stream: XtreamLiveStream) => void;
}

export const EPGView: React.FC<EPGViewProps> = ({ streams, onPlayStream }) => {
  const [channelEPGMap, setChannelEPGMap] = useState<Record<string, XtreamEPGProgramme[]>>({});
  const [selectedProgramme, setSelectedProgramme] = useState<{
    programme: XtreamEPGProgramme;
    channel: XtreamLiveStream;
  } | null>(null);
  const [selectedChannelIdx, setSelectedChannelIdx] = useState(0);
  const [selectedProgramIdx, setSelectedProgramIdx] = useState(0);

  // Load EPG for streams
  useEffect(() => {
    const loadEPGData = async () => {
      const map: Record<string, XtreamEPGProgramme[]> = {};
      for (const stream of streams.slice(0, 16)) {
        try {
          const progs = await xtreamService.getEPG(stream.stream_id);
          map[String(stream.stream_id)] = progs;
        } catch {
          // ignore
        }
      }
      setChannelEPGMap(map);

      // Pre-select first channel's first program for preview panel
      if (streams.length > 0 && !selectedProgramme) {
        const firstStream = streams[0];
        const progs = map[String(firstStream.stream_id)] || [];
        if (progs.length > 0) {
          setSelectedProgramme({ programme: progs[0], channel: firstStream });
        }
      }
    };

    if (streams.length > 0) {
      loadEPGData();
    }
  }, [streams]);

  const activeChannel = streams[selectedChannelIdx] || streams[0];
  const activeProgs = activeChannel ? channelEPGMap[String(activeChannel.stream_id)] || [] : [];

  // Generate timeline slots around current hour
  const now = new Date();
  const currentHour = now.getHours();
  const timeSlots = [-1, 0, 1, 2, 3, 4].map((offset) => {
    const h = (currentHour + offset + 24) % 24;
    return `${h.toString().padStart(2, '0')}:00`;
  });

  return (
    <div className="flex flex-col h-[calc(100vh-5.5rem)] min-h-[580px] -m-4 sm:-m-6 p-4 sm:p-6 space-y-4 overflow-hidden">
      {/* Top TV Guide Status Header */}
      <div className="flex items-center justify-between bg-[#0a0f1c] px-5 py-3 rounded-2xl border border-slate-800/80 shadow-md">
        <div className="flex items-center gap-3 text-xs">
          <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <Calendar className="w-4 h-4" />
          </div>
          <div>
            <span className="font-heading font-bold text-white text-sm">
              Live TV Electronic Programme Guide
            </span>
            <span className="text-slate-400 hidden sm:inline ml-2">
              · High-precision real-time channel schedule
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono font-bold text-cyan-300 bg-cyan-950/60 border border-cyan-800/40 px-3 py-1.5 rounded-xl">
          <Clock className="w-3.5 h-3.5 text-cyan-400" />
          <span className="tabular-nums">
            {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse ml-1" />
        </div>
      </div>

      {/* Main EPG Grid Container */}
      <div className="flex-1 flex flex-col bg-[#090e1a] border border-slate-800/80 rounded-3xl overflow-hidden shadow-2xl min-h-0">
        {/* Horizontal Time Axis Header */}
        <div className="flex border-b border-slate-800 bg-[#06090f]/90 sticky top-0 z-20">
          {/* Fixed Left Header Corner */}
          <div className="w-48 sm:w-60 p-3.5 text-xs font-bold text-slate-400 border-r border-slate-800 shrink-0 flex items-center gap-2 font-heading uppercase tracking-wider">
            <Tv className="w-4 h-4 text-cyan-400" />
            <span>Channels ({streams.length})</span>
          </div>

          {/* Time Columns with Current-Time Indicator */}
          <div className="flex-1 flex overflow-x-auto scrollbar-none relative">
            {timeSlots.map((slot, idx) => (
              <div
                key={idx}
                className="w-56 sm:w-64 p-3.5 text-xs font-mono font-bold text-slate-300 border-r border-slate-800/60 shrink-0 flex items-center justify-between"
              >
                <span>{slot}</span>
                {idx === 1 && (
                  <span className="text-[10px] font-bold text-cyan-300 bg-cyan-950 border border-cyan-800/50 px-2 py-0.5 rounded-md flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                    Now
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Channels Rows and Program Blocks */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-800/50 custom-scrollbar">
          {streams.slice(0, 16).map((channel, cIdx) => {
            const programs = channelEPGMap[String(channel.stream_id)] || [];
            const isChannelActive = selectedChannelIdx === cIdx;

            return (
              <div
                key={channel.stream_id}
                className={`flex transition-colors ${
                  isChannelActive ? 'bg-[#0f1728]' : 'hover:bg-slate-850/40'
                }`}
              >
                {/* Fixed Channel Cell on Left */}
                <div
                  onClick={() => {
                    setSelectedChannelIdx(cIdx);
                    if (programs.length > 0) {
                      setSelectedProgramme({ programme: programs[0], channel });
                    }
                  }}
                  onDoubleClick={() => onPlayStream(channel)}
                  className="w-48 sm:w-60 p-3 border-r border-slate-800 shrink-0 flex items-center gap-3 cursor-pointer group bg-[#070b14]/80 hover:bg-slate-800/70 transition tv-focus-target"
                >
                  <span className="text-xs font-mono font-bold text-cyan-400 w-6 shrink-0 text-center">
                    {channel.num || cIdx + 1}
                  </span>

                  <div className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-800 overflow-hidden shrink-0 flex items-center justify-center p-1">
                    {channel.stream_icon ? (
                      <img
                        src={channel.stream_icon}
                        alt={channel.name}
                        className="max-h-full max-w-full object-contain"
                        loading="lazy"
                      />
                    ) : (
                      <Tv className="w-4 h-4 text-slate-500" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-white group-hover:text-cyan-400 transition truncate">
                      {channel.name}
                    </p>
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider block truncate">
                      {channel.category_id}
                    </span>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onPlayStream(channel);
                    }}
                    className="p-1 rounded-lg bg-cyan-500 text-slate-950 opacity-0 group-hover:opacity-100 transition shadow"
                    title="Watch Channel"
                  >
                    <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                  </button>
                </div>

                {/* Horizontal Program Blocks for this Channel */}
                <div className="flex-1 flex overflow-x-auto p-1.5 gap-2 scrollbar-none items-center">
                  {programs.length > 0 ? (
                    programs.map((prog, pIdx) => {
                      const isNow = pIdx === 0;
                      const isSelectedProg =
                        selectedProgramme?.programme.id === prog.id &&
                        selectedProgramme?.channel.stream_id === channel.stream_id;

                      return (
                        <div
                          key={prog.id || pIdx}
                          onClick={() => {
                            setSelectedChannelIdx(cIdx);
                            setSelectedProgramIdx(pIdx);
                            setSelectedProgramme({ programme: prog, channel });
                          }}
                          onDoubleClick={() => onPlayStream(channel)}
                          className={`w-56 sm:w-64 p-3 rounded-2xl border cursor-pointer transition-all duration-150 shrink-0 flex flex-col justify-between tv-focus-target ${
                            isSelectedProg
                              ? 'bg-cyan-950/80 border-cyan-400 ring-2 ring-cyan-500/50 shadow-lg shadow-cyan-950/50'
                              : isNow
                              ? 'bg-[#0d1627] border-cyan-500/30 hover:border-cyan-400'
                              : 'bg-[#080d17] border-slate-800 hover:bg-slate-800/80 hover:border-slate-700'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono mb-1">
                              <span>
                                {prog.start.split(' ')[1]?.slice(0, 5) || '12:00'} -{' '}
                                {prog.end.split(' ')[1]?.slice(0, 5) || '13:00'}
                              </span>
                              {isNow && (
                                <span className="text-[10px] font-bold text-rose-400 flex items-center gap-1 uppercase tracking-wider">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
                                  Live
                                </span>
                              )}
                            </div>

                            <h4
                              className={`text-xs font-bold truncate ${
                                isSelectedProg ? 'text-cyan-300' : 'text-white'
                              }`}
                            >
                              {prog.title}
                            </h4>
                          </div>

                          <p className="text-[11px] text-slate-400 line-clamp-1 mt-1">
                            {prog.description || 'Program guide presentation'}
                          </p>
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-3 text-xs text-slate-500 italic">
                      EPG data schedule syncing...
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Selected Program Information Panel at the Bottom */}
        {selectedProgramme && (
          <div className="p-4 sm:p-5 border-t border-slate-800 bg-[#06090f] flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-in slide-in-from-bottom-2 duration-200">
            <div className="flex items-start gap-3.5 min-w-0 flex-1">
              <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center p-1 shrink-0 overflow-hidden">
                {selectedProgramme.channel.stream_icon ? (
                  <img
                    src={selectedProgramme.channel.stream_icon}
                    alt={selectedProgramme.channel.name}
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <Tv className="w-5 h-5 text-cyan-400" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-cyan-400">
                    {selectedProgramme.channel.name}
                  </span>
                  <span className="text-slate-500">·</span>
                  <span className="text-xs font-mono text-slate-400">
                    {selectedProgramme.programme.start.split(' ')[1]?.slice(0, 5)} -{' '}
                    {selectedProgramme.programme.end.split(' ')[1]?.slice(0, 5)}
                  </span>
                </div>

                <h3 className="text-sm sm:text-base font-bold text-white font-heading truncate mt-0.5">
                  {selectedProgramme.programme.title}
                </h3>

                <p className="text-xs text-slate-400 line-clamp-2 mt-1 leading-relaxed max-w-4xl">
                  {selectedProgramme.programme.description ||
                    'Comprehensive television broadcast schedule information provided via Xtream XMLTV standard.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0 self-end md:self-center">
              <button
                onClick={() => onPlayStream(selectedProgramme.channel)}
                className="px-6 py-2.5 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg shadow-cyan-500/25 transition active:scale-95 tv-focus-target"
              >
                <Play className="w-4 h-4 fill-slate-950" />
                <span>Watch Channel (Enter)</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

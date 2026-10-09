import React, { useState, useEffect, useRef } from 'react';
import {
  Home,
  Tv,
  Film,
  Layers,
  Star,
  Search,
  Server,
  Users,
  Shield,
  ChevronRight,
  ChevronLeft,
  Radio,
  Crown,
  Smile,
  User,
  Settings,
  Activity,
} from 'lucide-react';
import { SavedProfile, UserProfile } from '../types/xtream';
import { PWAInstallButton } from './PWAInstallButton';

export type NavTab = 'home' | 'live' | 'movies' | 'series' | 'favorites' | 'search';

interface TVNavigationRailProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  activeProfiles: SavedProfile[];
  userProfile: UserProfile;
  onOpenConnections: () => void;
  onOpenProfiles: () => void;
  onOpenSettings: () => void;
  onOpenPlaybackSettings?: () => void;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  onFocusContent?: () => void;
}

export const TVNavigationRail: React.FC<TVNavigationRailProps> = ({
  currentTab,
  onSelectTab,
  activeProfiles,
  userProfile,
  onOpenConnections,
  onOpenProfiles,
  onOpenSettings,
  onOpenPlaybackSettings,
  isExpanded,
  onToggleExpanded,
  onFocusContent,
}) => {
  const [hovered, setHovered] = useState(false);
  const railRef = useRef<HTMLDivElement | null>(null);

  const getFocusableItems = () =>
    Array.from(
      railRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex="0"]') ?? []
    ).filter((element) => element.offsetParent !== null);

  const focusRelativeItem = (direction: 1 | -1) => {
    const items = getFocusableItems();
    if (!items.length) return;

    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    const nextIndex =
      currentIndex < 0
        ? direction > 0
          ? 0
          : items.length - 1
        : Math.min(items.length - 1, Math.max(0, currentIndex + direction));

    items[nextIndex]?.focus();
  };

  const effectiveExpanded = isExpanded || hovered;

  const primaryNavItems: Array<{
    id: NavTab;
    label: string;
    icon: React.ReactNode;
    keyHint: string;
  }> = [
    { id: 'home', label: 'Home', icon: <Home className="w-5 h-5 shrink-0" />, keyHint: '1' },
    { id: 'live', label: 'Live TV', icon: <Tv className="w-5 h-5 shrink-0" />, keyHint: '2' },
    { id: 'movies', label: 'Movies', icon: <Film className="w-5 h-5 shrink-0" />, keyHint: '3' },
    { id: 'series', label: 'Series', icon: <Layers className="w-5 h-5 shrink-0" />, keyHint: '4' },
    { id: 'favorites', label: 'Favorites', icon: <Star className="w-5 h-5 shrink-0" />, keyHint: '5' },
    { id: 'search', label: 'Search', icon: <Search className="w-5 h-5 shrink-0" />, keyHint: '/' },
  ];

  // Deterministic TV/keyboard navigation inside the rail.
  // Android TV WebView can deliver the remote center/OK button without
  // consistently performing the browser's implicit button click, so we
  // explicitly activate the focused control. Arrow handling remains useful
  // for desktop keyboards and maps directly to Android TV D-pad events.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusRelativeItem(1);
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusRelativeItem(-1);
      return;
    }

    if (e.key === 'ArrowRight' && onFocusContent) {
      e.preventDefault();
      onFocusContent();
      return;
    }

    if (e.key === 'Enter' || e.key === 'NumpadEnter') {
      e.preventDefault();
      e.stopPropagation();

      const focused = document.activeElement as HTMLElement | null;
      if (focused && railRef.current?.contains(focused)) {
        focused.click();
      }
    }
  };

  return (
    <aside
      ref={railRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onKeyDown={handleKeyDown}
      className={`hidden md:flex flex-col justify-between fixed top-0 left-0 bottom-0 z-[70] bg-[#070b13]/95 backdrop-blur-2xl border-r border-slate-800/80 transition-all duration-300 ease-out select-none shadow-2xl ${
        effectiveExpanded ? 'w-64' : 'w-[74px]'
      }`}
      aria-label="Main Navigation"
    >
      {/* Top Branding Section */}
      <div className="p-3.5 pb-2">
        <div
          onClick={onToggleExpanded}
          className="flex items-center gap-3 p-2 rounded-2xl hover:bg-slate-800/60 cursor-pointer transition-all active:scale-95 group"
          title={effectiveExpanded ? 'Collapse Navigation (Left Arrow)' : 'Expand Navigation (Right Arrow)'}
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/25 shrink-0 text-white group-hover:scale-105 transition-transform">
            <Radio className="w-5 h-5 animate-pulse" />
          </div>

          {effectiveExpanded && (
            <div className="overflow-hidden whitespace-nowrap animate-in fade-in duration-200">
              <div className="font-heading font-extrabold text-base text-white tracking-tight leading-none">
                Get Smart
              </div>
              <div className="text-[11px] font-semibold text-cyan-400 tracking-wider uppercase mt-1 flex items-center gap-1.5">
                <span>Media Player</span>
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Center Navigation Links */}
      <nav className="flex-1 px-3 py-2 space-y-1.5 overflow-y-auto custom-scrollbar">
        {primaryNavItems.map((item) => {
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`w-full flex items-center gap-3.5 px-3 py-3 rounded-2xl text-sm font-semibold transition-all duration-200 tv-focus-target group relative ${
                isActive
                  ? 'bg-gradient-to-r from-cyan-600/90 to-cyan-500 text-white shadow-lg shadow-cyan-950/60 font-bold'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
              title={`${item.label} [${item.keyHint}]`}
            >
              {/* Active Indicator Bar on Left */}
              {isActive && (
                <span className="absolute -left-1 top-2 bottom-2 w-1.5 rounded-full bg-cyan-300 shadow-md shadow-cyan-300/80" />
              )}

              <span
                className={`transition-transform group-hover:scale-110 ${
                  isActive ? 'text-white' : 'text-slate-400 group-hover:text-cyan-400'
                }`}
              >
                {item.icon}
              </span>

              {effectiveExpanded && (
                <span className="truncate flex-1 text-left animate-in fade-in duration-200">
                  {item.label}
                </span>
              )}

              {effectiveExpanded && (
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded transition ${
                    isActive ? 'bg-cyan-800/80 text-cyan-100' : 'bg-slate-800 text-slate-400 group-hover:text-slate-300'
                  }`}
                >
                  {item.keyHint}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom Section: Connections, Profiles, Settings, Collapse */}
      <div className="p-3 border-t border-slate-800/70 space-y-1.5 bg-[#05080e]/60">
        {/* Connections / Server Manager Button */}
        <button
          onClick={onOpenConnections}
          className="w-full flex items-center gap-3.5 px-3 py-2.5 rounded-2xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800/70 transition-all tv-focus-target group"
          title="Connections & Streaming Lines (S)"
        >
          <div className="relative shrink-0">
            <Server className="w-5 h-5 text-cyan-400 group-hover:scale-110 transition-transform" />
            <span
              className={`absolute -top-1 -right-1 w-2 h-2 rounded-full border-2 border-slate-900 ${
                activeProfiles.length > 0 ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            />
          </div>

          {effectiveExpanded && (
            <div className="flex-1 text-left truncate animate-in fade-in duration-200">
              <div className="font-bold text-slate-200 truncate">Connections</div>
              <div className="text-[10px] text-cyan-400 truncate">
                {activeProfiles.length === 1
                  ? activeProfiles[0].name
                  : `${activeProfiles.length} Active Sources`}
              </div>
            </div>
          )}
        </button>

        {/* Profiles Button */}
        <button
          onClick={onOpenProfiles}
          className="w-full flex items-center gap-3.5 px-3 py-2.5 rounded-2xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800/70 transition-all tv-focus-target group"
          title={`Active Profile: ${userProfile.name} (U)`}
        >
          <div
            className="w-5 h-5 rounded-lg flex items-center justify-center text-white text-[10px] shrink-0 shadow group-hover:scale-110 transition-transform"
            style={{ backgroundColor: userProfile.avatarColor }}
          >
            {userProfile.role === 'master_admin' ? (
              <Crown className="w-3 h-3" />
            ) : userProfile.isKids ? (
              <Smile className="w-3 h-3" />
            ) : (
              <User className="w-3 h-3" />
            )}
          </div>

          {effectiveExpanded && (
            <div className="flex-1 text-left truncate animate-in fade-in duration-200">
              <div className="font-bold text-slate-200 truncate">{userProfile.name}</div>
              <div className="text-[10px] text-slate-400 capitalize">
                {userProfile.role === 'master_admin'
                  ? 'Master Admin'
                  : userProfile.isKids
                  ? 'Kids Safe'
                  : 'Family'}
              </div>
            </div>
          )}
        </button>

        {/* Playback & Streaming Performance Button */}
        {onOpenPlaybackSettings && (
          <button
            onClick={onOpenPlaybackSettings}
            className="w-full flex items-center gap-3.5 px-3 py-2.5 rounded-2xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800/70 transition-all tv-focus-target group"
            title="Streaming Performance & Smart Playback (P)"
          >
            <Activity className="w-5 h-5 text-amber-400 shrink-0 group-hover:scale-110 transition-transform" />
            {effectiveExpanded && (
              <div className="flex-1 text-left truncate animate-in fade-in duration-200">
                <div className="font-bold text-slate-200 truncate">Streaming Performance</div>
                <div className="text-[10px] text-amber-400 truncate">Anti-Buffering Engine</div>
              </div>
            )}
          </button>
        )}

        {/* Settings / Parental Controls Button */}
        <button
          onClick={onOpenSettings}
          className="w-full flex items-center gap-3.5 px-3 py-2.5 rounded-2xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800/70 transition-all tv-focus-target group"
          title="Parental Controls & Privileges"
        >
          <Shield className="w-5 h-5 text-cyan-400 shrink-0 group-hover:scale-110 transition-transform" />
          {effectiveExpanded && (
            <span className="flex-1 text-left truncate font-bold text-slate-200 animate-in fade-in duration-200">
              Settings & Privacy
            </span>
          )}
        </button>

        {/* Rail Collapse Toggle */}
        <button
          onClick={onToggleExpanded}
          className="w-full flex items-center justify-center py-2 text-slate-500 hover:text-slate-200 hover:bg-slate-800/40 rounded-xl transition"
          title={effectiveExpanded ? 'Collapse Rail' : 'Expand Rail'}
        >
          {effectiveExpanded ? (
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
              <ChevronLeft className="w-4 h-4" />
              <span>Collapse</span>
            </div>
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>
      </div>
    </aside>
  );
};

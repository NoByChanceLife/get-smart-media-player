import React, { useRef } from 'react';
import {
  Tv,
  Film,
  Layers,
  Star,
  Server,
  Radio,
  Filter,
  Shield,
  Crown,
  Smile,
  User,
  Search,
  Activity,
} from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';
import { SavedProfile, UserProfile } from '../types/xtream';
import { NavTab } from './TVNavigationRail';

export type { NavTab };

interface TopBarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  activeProfiles: SavedProfile[];
  serverFilter: string;
  onSelectServerFilter: (filter: string) => void;
  onOpenSettings: () => void;
  onOpenPlaybackSettings?: () => void;
  userProfile: UserProfile;
  onOpenProfileSwitcher: () => void;
  onOpenParentalControls: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  currentTab,
  onSelectTab,
  activeProfiles,
  serverFilter,
  onSelectServerFilter,
  onOpenSettings,
  onOpenPlaybackSettings,
  userProfile,
  onOpenProfileSwitcher,
  onOpenParentalControls,
}) => {
  const topBarRef = useRef<HTMLElement | null>(null);

  const handleTVNavigation = (e: React.KeyboardEvent<HTMLElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowDown'].includes(e.key)) return;
    const current = e.target as HTMLElement;
    if (!current.matches('button, select, [tabindex="0"]')) return;

    if (e.key === 'ArrowDown') {
      // Let App hand focus back to the active page content.
      return;
    }

    const items = Array.from(
      topBarRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), select:not([disabled]), [tabindex="0"]') ?? []
    ).filter((item) => item.offsetParent !== null);
    const index = items.indexOf(current);
    if (index < 0) return;

    const nextIndex = e.key === 'ArrowRight' ? index + 1 : index - 1;
    const next = items[nextIndex];
    if (next) {
      e.preventDefault();
      e.stopPropagation();
      next.focus();
      next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  };

  const getTabTitle = (tab: NavTab) => {
    switch (tab) {
      case 'home':
        return 'Home';
      case 'live':
        return 'Live TV Channels';
      case 'movies':
        return 'Movies & Cinema';
      case 'series':
        return 'TV Series';
      case 'favorites':
        return 'Starred & History';
      case 'search':
        return 'Search';
      default:
        return '';
    }
  };

  return (
    <header ref={topBarRef} onKeyDownCapture={handleTVNavigation} data-tv-topbar className="sticky top-0 z-40 bg-[#06101b]/96 backdrop-blur-xl border-b border-[#17304a] px-3 sm:px-4 lg:px-5 py-2 transition-colors shadow-[0_8px_24px_rgba(0,0,0,.12)]">
      <div className="w-full flex items-center justify-between gap-4">
        {/* Left Section: Mobile Brand or View Header on Desktop */}
        <div className="flex items-center gap-3">
          {/* Mobile Only Brand Wordmark */}
          <div className="md:hidden flex items-center gap-2.5 shrink-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 text-white">
              <Radio className="w-4 h-4 animate-pulse" />
            </div>
            <span className="text-base font-extrabold tracking-tight text-white font-heading flex items-center gap-1.5">
              Get Smart <span className="text-[#4baeff] font-semibold text-xs px-1.5 py-0.5 rounded bg-cyan-950 border border-cyan-800/50">Media</span>
            </span>
          </div>

          {/* Desktop/TV Active View Label */}
          <div className="hidden md:flex items-center gap-2">
            <h1 className="text-[15px] font-semibold text-white font-heading tracking-[0.01em]">
              {getTabTitle(currentTab)}
            </h1>
          </div>
        </div>

        {/* Right Section: Multi-Server Filter, User Profile, Parental, PWA */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* Active Server Dropdown filter if > 1 active server */}
          {activeProfiles.length > 1 && (
            <div className="hidden lg:flex items-center gap-1.5 bg-[#091522] border border-[#19334e] rounded-lg px-2.5 py-1.5 text-[11px]">
              <Filter className="w-3.5 h-3.5 text-[#4baeff] shrink-0" />
              <select
                value={serverFilter}
                onChange={(e) => onSelectServerFilter(e.target.value)}
                className="bg-transparent text-[11px] text-[#78c1ff] font-medium focus:outline-none cursor-pointer pr-1"
              >
                <option value="all" className="bg-slate-900 text-white">
                  ⚡ All Active Sources ({activeProfiles.length})
                </option>
                {activeProfiles.map((p) => (
                  <option key={p.id} value={p.id} className="bg-slate-900 text-white">
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Search Button for Mobile */}
          <button
            onClick={() => onSelectTab('search')}
            className={`p-2 rounded-xl border transition tv-focus-target ${
              currentTab === 'search'
                ? 'bg-[#0b63f6] text-white border-[#2d87ff]'
                : 'bg-[#091522] border-[#19334e] text-[#95aabd] hover:text-white hover:border-[#2d5c84]'
            }`}
            title="Global Search (/)"
          >
            <Search className="w-4 h-4" />
          </button>

          {/* User Profile Button */}
          <button
            onClick={onOpenProfileSwitcher}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[#091522] border border-[#19334e] hover:border-[#2d5c84] hover:bg-[#0d1d2f] transition active:scale-95 tv-focus-target"
            title={`Active Profile: ${userProfile.name} (U)`}
          >
            <div
              className="w-5 h-5 rounded-lg flex items-center justify-center text-white text-[10px] shrink-0"
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
            <span className="text-xs font-bold text-white hidden sm:inline truncate max-w-[90px]">
              {userProfile.name}
            </span>
          </button>

          {/* Streaming Performance Button */}
          {onOpenPlaybackSettings && (
            <button
              onClick={onOpenPlaybackSettings}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#091522] border border-[#19334e] hover:border-[#2d5c84] hover:bg-[#0d1d2f] text-[11px] font-medium text-[#a7b8c8] hover:text-[#78c1ff] transition active:scale-95 tv-focus-target"
              title="Streaming Performance & Anti-Buffering (P)"
            >
              <Activity className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="hidden sm:inline">Performance</span>
            </button>
          )}

          {/* Parental Controls Button */}
          <button
            onClick={onOpenParentalControls}
            className="p-2 rounded-lg bg-[#091522] border border-[#19334e] hover:border-[#2d5c84] hover:bg-[#0d1d2f] text-[#9fb1c2] hover:text-[#78c1ff] transition active:scale-95 tv-focus-target"
            title="Parental Controls & Privacy"
          >
            <Shield className="w-4 h-4 text-[#4baeff]" />
          </button>

          <PWAInstallButton />

          {/* Connections Settings Button */}
          <button
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#091522] border border-[#19334e] hover:border-[#2d5c84] hover:bg-[#0d1d2f] text-[11px] font-medium text-[#a7b8c8] transition active:scale-95 tv-focus-target"
            title="Manage IPTV Connections & Sources (S)"
          >
            <Server className="w-3.5 h-3.5 text-[#4baeff]" />
            <span className="hidden xl:inline">
              {activeProfiles.length === 1 ? activeProfiles[0].name : `${activeProfiles.length} Sources`}
            </span>
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
          </button>
        </div>
      </div>
    </header>
  );
};

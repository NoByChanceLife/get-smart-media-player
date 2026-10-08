import React, { useState, useEffect, useCallback, useRef } from 'react';
import { TopBar } from './components/TopBar';
import { TVNavigationRail, NavTab } from './components/TVNavigationRail';
import { BottomNavBar } from './components/BottomNavBar';
import { HomeView } from './components/HomeView';
import { LiveTVView } from './components/LiveTVView';
import { MoviesView } from './components/MoviesView';
import { SeriesView } from './components/SeriesView';
import { FavoritesView } from './components/FavoritesView';
import { GlobalSearchView } from './components/GlobalSearchView';
import { VideoPlayer } from './components/VideoPlayer';
import { WatchingGuideOverlay } from './components/WatchingGuideOverlay';
import { FloatingPiPPlayer } from './components/FloatingPiPPlayer';
import { ServerSettingsModal } from './components/ServerSettingsModal';
import { ParentalControlsModal } from './components/ParentalControlsModal';
import { ProfileSwitcherModal } from './components/ProfileSwitcherModal';
import { StreamingPerformanceModal } from './components/StreamingPerformanceModal';
import { PinModal } from './components/PinModal';
import { OfflineIndicator } from './components/OfflineIndicator';
import {
  XtreamCategory,
  XtreamLiveStream,
  XtreamVodStream,
  XtreamSeries,
  XtreamEpisode,
  PlaybackTarget,
  SavedProfile,
  UserProfile,
} from './types/xtream';
import { xtreamService, WatchHistoryItem } from './services/xtreamClient';
import { parentalControlService } from './services/parentalControlService';

export default function App() {
  const [currentTab, setCurrentTab] = useState<NavTab>('home');
  const [isRailExpanded, setIsRailExpanded] = useState<boolean>(false);
  const [activeProfiles, setActiveProfiles] = useState<SavedProfile[]>(() => xtreamService.getActiveProfiles());
  const [serverFilter, setServerFilter] = useState<string>('all');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPerformanceModalOpen, setIsPerformanceModalOpen] = useState(false);

  // User Profile & Parental Controls State
  const [userProfile, setUserProfile] = useState<UserProfile>(() => parentalControlService.getActiveProfile());
  const [allUserProfiles, setAllUserProfiles] = useState<UserProfile[]>(() => parentalControlService.getProfiles());
  const [isParentalControlsOpen, setIsParentalControlsOpen] = useState(false);
  const [isProfileSwitcherOpen, setIsProfileSwitcherOpen] = useState(false);

  // General PIN Prompt modal state
  const [pinPromptState, setPinPromptState] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    onSuccess: () => void;
  }>({
    isOpen: false,
    title: 'Enter Master PIN',
    description: '',
    onSuccess: () => {},
  });

  // Data states
  const [liveCategories, setLiveCategories] = useState<XtreamCategory[]>([]);
  const [liveStreams, setLiveStreams] = useState<XtreamLiveStream[]>([]);
  const [selectedLiveCat, setSelectedLiveCat] = useState<string>('all');

  const [vodCategories, setVodCategories] = useState<XtreamCategory[]>([]);
  const [vodStreams, setVodStreams] = useState<XtreamVodStream[]>([]);
  const [selectedVodCat, setSelectedVodCat] = useState<string>('all');

  const [seriesCategories, setSeriesCategories] = useState<XtreamCategory[]>([]);
  const [seriesList, setSeriesList] = useState<XtreamSeries[]>([]);
  const [selectedSeriesCat, setSelectedSeriesCat] = useState<string>('all');

  // Playback & Picture-in-Picture states
  const [playbackTarget, setPlaybackTarget] = useState<PlaybackTarget | null>(null);
  const [secondaryPlaybackTarget, setSecondaryPlaybackTarget] = useState<PlaybackTarget | null>(null);
  const [isFloatingPiP, setIsFloatingPiP] = useState(false);
  // Playback presentation is separate from playback ownership. Browsing hides
  // the fullscreen surface without destroying the active player session.
  const [isBrowsingDuringPlayback, setIsBrowsingDuringPlayback] = useState(false);
  const [isWatchingGuideOpen, setIsWatchingGuideOpen] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);

  const mainContentRef = useRef<HTMLDivElement | null>(null);

  const focusFirstContentControl = useCallback(() => {
    const root = mainContentRef.current;
    if (!root) return;

    // On Movies/Series the useful TV handoff target is the first poster, not
    // the featured/header buttons above the grid. This keeps Right from the
    // rail aligned with the customer's intent to browse content.
    if (currentTab === 'movies' || currentTab === 'series') {
      const firstCard = root.querySelector<HTMLElement>('[data-media-card]');
      if (firstCard) {
        firstCard.focus();
        firstCard.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        return;
      }
    }

    const first = root.querySelector<HTMLElement>(
      '.tv-focus-target, button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex="0"]'
    );
    first?.focus();
  }, [currentTab]);

  const focusTopBar = useCallback(() => {
    const first = document.querySelector<HTMLElement>(
      '[data-tv-topbar] .tv-focus-target, [data-tv-topbar] button:not([disabled]), [data-tv-topbar] select:not([disabled])'
    );
    first?.focus();
  }, []);

  const focusNavigationRail = useCallback(() => {
    const first = document.querySelector<HTMLElement>(
      '[aria-label="Main Navigation"] .tv-focus-target, [aria-label="Main Navigation"] button:not([disabled])'
    );
    first?.focus();
  }, []);

  // Load all IPTV data across active servers
  const loadData = useCallback(async () => {
    setIsLoadingData(true);
    try {
      xtreamService.setServerFilter(serverFilter);
      const [liveCats, liveStrms, vodCats, vodStrms, sCats, sList] = await Promise.all([
        xtreamService.getLiveCategories(),
        xtreamService.getLiveStreams(selectedLiveCat),
        xtreamService.getVodCategories(),
        xtreamService.getVodStreams(selectedVodCat),
        xtreamService.getSeriesCategories(),
        xtreamService.getSeriesList(selectedSeriesCat),
      ]);

      setLiveCategories(liveCats);
      setLiveStreams(liveStrms);
      setVodCategories(vodCats);
      setVodStreams(vodStrms);
      setSeriesCategories(sCats);
      setSeriesList(sList);
    } catch (err) {
      console.error('Error loading aggregated IPTV data:', err);
    } finally {
      setIsLoadingData(false);
    }
  }, [selectedLiveCat, selectedVodCat, selectedSeriesCat, serverFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle live stream category switch
  const handleSelectLiveCategory = async (catId: string) => {
    setSelectedLiveCat(catId);
    const streams = await xtreamService.getLiveStreams(catId);
    setLiveStreams(streams);
  };

  // Handle VOD category switch
  const handleSelectVodCategory = async (catId: string) => {
    setSelectedVodCat(catId);
    const movies = await xtreamService.getVodStreams(catId);
    setVodStreams(movies);
  };

  // Handle Series category switch
  const handleSelectSeriesCategory = async (catId: string) => {
    setSelectedSeriesCat(catId);
    const list = await xtreamService.getSeriesList(catId);
    setSeriesList(list);
  };

  // Favorites toggles
  const handleToggleLiveFavorite = (streamId: number | string) => {
    xtreamService.toggleFavorite(`live_${streamId}`);
    setLiveStreams((prev) =>
      prev.map((s) => (s.stream_id === streamId ? { ...s, isFavorite: !s.isFavorite } : s))
    );
  };

  const handleToggleMovieFavorite = (movieId: number | string) => {
    xtreamService.toggleFavorite(`vod_${movieId}`);
    setVodStreams((prev) =>
      prev.map((m) => (m.stream_id === movieId ? { ...m, isFavorite: !m.isFavorite } : m))
    );
  };

  const handleToggleSeriesFavorite = (seriesId: number | string) => {
    xtreamService.toggleFavorite(`series_${seriesId}`);
    setSeriesList((prev) =>
      prev.map((s) => (s.series_id === seriesId ? { ...s, isFavorite: !s.isFavorite } : s))
    );
  };

  // Playback handlers
  const handlePlayLiveStream = (stream: XtreamLiveStream) => {
    setPlaybackTarget({ type: 'live', stream });
    setIsFloatingPiP(false);
    setIsBrowsingDuringPlayback(false);
    setIsWatchingGuideOpen(false);
  };

  const handlePlayMovie = (movie: XtreamVodStream) => {
    setPlaybackTarget({ type: 'vod', movie });
    setIsFloatingPiP(false);
    setIsBrowsingDuringPlayback(false);
  };

  const handlePlayEpisode = (series: XtreamSeries, seasonNum: number, episode: XtreamEpisode) => {
    setPlaybackTarget({ type: 'episode', series, seasonNum, episode });
    setIsFloatingPiP(false);
    setIsBrowsingDuringPlayback(false);
  };

  // PIN Unlock prompts for restricted content
  const handlePromptPinForStream = (stream: XtreamLiveStream) => {
    setPinPromptState({
      isOpen: true,
      title: 'Restricted Channel',
      description: `Channel "${stream.name}" is protected by Parental Controls. Enter Master PIN to unlock.`,
      onSuccess: () => {
        setPinPromptState((prev) => ({ ...prev, isOpen: false }));
        handlePlayLiveStream(stream);
      },
    });
  };

  const handlePromptPinForMovie = (movie: XtreamVodStream) => {
    setPinPromptState({
      isOpen: true,
      title: 'Restricted Movie',
      description: `Movie "${movie.name}" exceeds the content rating limit or is locked. Enter Master PIN to unlock.`,
      onSuccess: () => {
        setPinPromptState((prev) => ({ ...prev, isOpen: false }));
        handlePlayMovie(movie);
      },
    });
  };

  const handlePromptPinForSeries = (series: XtreamSeries) => {
    setPinPromptState({
      isOpen: true,
      title: 'Restricted Series',
      description: `Series "${series.name}" is in a locked category. Enter Master PIN to unlock.`,
      onSuccess: () => {
        setPinPromptState((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  // Handle Server Settings with Parental Protection
  const handleOpenServerSettings = () => {
    if (parentalControlService.canManageServers()) {
      setIsSettingsOpen(true);
    } else {
      setPinPromptState({
        isOpen: true,
        title: 'Master Admin Access Required',
        description: 'Server & streaming line management is restricted. Enter Master PIN to proceed.',
        onSuccess: () => {
          setPinPromptState((prev) => ({ ...prev, isOpen: false }));
          setIsSettingsOpen(true);
        },
      });
    }
  };

  // Handle Parental Controls button with PIN check
  const handleOpenParentalControls = () => {
    // First-run setup must remain reachable because there is intentionally no default PIN.
    if (!parentalControlService.isPinConfigured() || parentalControlService.isSessionUnlocked()) {
      setIsParentalControlsOpen(true);
    } else {
      setPinPromptState({
        isOpen: true,
        title: 'Parental Controls Locked',
        description: 'Enter Master Admin PIN to configure parental controls and user profiles.',
        onSuccess: () => {
          setPinPromptState((prev) => ({ ...prev, isOpen: false }));
          setIsParentalControlsOpen(true);
        },
      });
    }
  };

  // Launch Picture-in-Picture directly from channel list
  const handleLaunchDirectPiP = (stream: XtreamLiveStream) => {
    if (!playbackTarget) {
      setPlaybackTarget({ type: 'live', stream });
      setIsFloatingPiP(true);
    } else {
      setSecondaryPlaybackTarget({ type: 'live', stream });
      setIsFloatingPiP(true);
    }
  };

  // Launch Dual PiP from player drawer
  const handleLaunchDualPiP = (secondTarget: PlaybackTarget) => {
    setSecondaryPlaybackTarget(secondTarget);
    setIsFloatingPiP(true);
  };

  // Swap primary and secondary streams in multi-view
  const handleSwapPipStreams = () => {
    if (playbackTarget && secondaryPlaybackTarget) {
      const temp = playbackTarget;
      setPlaybackTarget(secondaryPlaybackTarget);
      setSecondaryPlaybackTarget(temp);
    }
  };

  const handlePlayHistoryItem = (item: WatchHistoryItem) => {
    if (item.type === 'live') {
      const found = liveStreams.find((s) => `live_${s.stream_id}` === item.id);
      if (found) {
        setPlaybackTarget({ type: 'live', stream: found });
        setIsFloatingPiP(false);
      }
    } else if (item.type === 'vod') {
      const found = vodStreams.find((m) => `vod_${m.stream_id}` === item.id);
      if (found) {
        setPlaybackTarget({ type: 'vod', movie: found });
        setIsFloatingPiP(false);
      }
    }
  };

  // Keyboard shortcut remote navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
        return;
      }

      // Browser development maps Backspace to the same app-level Back action
      // as Escape. Do not let the browser navigate its own history.
      const isAppBack = e.key === 'Escape' || e.key === 'Backspace';

      // Dialog dismiss on app Back
      if (isAppBack) {
        if (isPerformanceModalOpen) {
          setIsPerformanceModalOpen(false);
          return;
        }
        if (isSettingsOpen) {
          setIsSettingsOpen(false);
          return;
        }
        if (isParentalControlsOpen) {
          setIsParentalControlsOpen(false);
          return;
        }
        if (isProfileSwitcherOpen) {
          setIsProfileSwitcherOpen(false);
          return;
        }
        if (pinPromptState.isOpen) {
          setPinPromptState((prev) => ({ ...prev, isOpen: false }));
          return;
        }
      }

      if (playbackTarget && isBrowsingDuringPlayback && !isFloatingPiP && isAppBack) {
        e.preventDefault();
        setIsBrowsingDuringPlayback(false);
        return;
      }

      if (!playbackTarget || isFloatingPiP || isBrowsingDuringPlayback) {
        const target = e.target as HTMLElement;
        const focusIsOnPage =
          target === document.body ||
          target === document.documentElement ||
          target === mainContentRef.current;

        // TV/remote entry behavior: prevent the browser from treating arrows as
        // page-scroll keys when no application control currently owns focus.
        if (focusIsOnPage && ['ArrowUp', 'ArrowDown', 'ArrowRight'].includes(e.key)) {
          e.preventDefault();
          focusFirstContentControl();
          return;
        }

        if (focusIsOnPage && e.key === 'ArrowLeft') {
          e.preventDefault();
          focusNavigationRail();
          return;
        }

        if (
          e.key === 'ArrowUp' &&
          mainContentRef.current?.contains(target) &&
          !target.closest('input, textarea, select')
        ) {
          const rect = target.getBoundingClientRect();
          const contentRect = mainContentRef.current.getBoundingClientRect();
          if (rect.top <= contentRect.top + 180) {
            e.preventDefault();
            focusTopBar();
            return;
          }
        }

        if (e.key === 'ArrowDown' && target.closest('[data-tv-topbar]')) {
          e.preventDefault();
          focusFirstContentControl();
          return;
        }

        // From any control in the main content, Left provides a predictable
        // escape path to the application navigation rail.
        if (
          e.key === 'ArrowLeft' &&
          mainContentRef.current?.contains(target) &&
          !target.closest('input, textarea, select') &&
          !target.matches('[data-media-card]') &&
          !target.closest('[data-media-card]') &&
          !target.matches('[data-media-navigation]') &&
          !target.closest('[data-media-navigation]') &&
          !target.matches('[data-tv-zone]') &&
          !target.closest('[data-tv-zone]')
        ) {
          e.preventDefault();
          focusNavigationRail();
          return;
        }

        switch (e.key) {
          case '1':
            setCurrentTab('home');
            break;
          case '2':
            setCurrentTab('live');
            break;
          case '3':
            setCurrentTab('movies');
            break;
          case '4':
            setCurrentTab('series');
            break;
          case '5':
            setCurrentTab('favorites');
            break;
          case '/':
            e.preventDefault();
            setCurrentTab('search');
            break;
          case 's':
          case 'S':
            handleOpenServerSettings();
            break;
          case 'u':
          case 'U':
            setIsProfileSwitcherOpen(true);
            break;
          case 'p':
          case 'P':
            if (playbackTarget) {
              setIsFloatingPiP(!isFloatingPiP);
            } else {
              setIsPerformanceModalOpen(true);
            }
            break;
          default:
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    playbackTarget,
    isFloatingPiP,
    isBrowsingDuringPlayback,
    isSettingsOpen,
    isParentalControlsOpen,
    isProfileSwitcherOpen,
    pinPromptState.isOpen,
    focusFirstContentControl,
    focusNavigationRail,
    focusTopBar,
  ]);

  return (
    <div className={`min-h-screen text-slate-100 flex flex-col selection:bg-cyan-500 selection:text-white ${playbackTarget && isBrowsingDuringPlayback ? 'bg-transparent' : 'bg-[#06090f]'}`}>
      {/* Television Collapsible Left Rail (Desktop / Android TV) */}
      <TVNavigationRail
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        activeProfiles={activeProfiles}
        userProfile={userProfile}
        onOpenConnections={handleOpenServerSettings}
        onOpenProfiles={() => setIsProfileSwitcherOpen(true)}
        onOpenSettings={handleOpenParentalControls}
        onOpenPlaybackSettings={() => setIsPerformanceModalOpen(true)}
        isExpanded={isRailExpanded}
        onToggleExpanded={() => setIsRailExpanded(!isRailExpanded)}
        onFocusContent={focusFirstContentControl}
      />

      {/* Main Layout Container */}
      <div
        className={`flex-1 flex flex-col transition-all duration-300 ${
          isRailExpanded ? 'md:ml-64' : 'md:ml-[74px]'
        } ${playbackTarget && isBrowsingDuringPlayback ? 'relative z-[55] bg-black/10' : ''}`}
      >
        {/* Top Header */}
        <TopBar
          currentTab={currentTab}
          onSelectTab={setCurrentTab}
          activeProfiles={activeProfiles}
          serverFilter={serverFilter}
          onSelectServerFilter={(filter) => {
            setServerFilter(filter);
          }}
          onOpenSettings={handleOpenServerSettings}
          onOpenPlaybackSettings={() => setIsPerformanceModalOpen(true)}
          userProfile={userProfile}
          onOpenProfileSwitcher={() => setIsProfileSwitcherOpen(true)}
          onOpenParentalControls={handleOpenParentalControls}
        />

        {/* Main Content Area */}
        <main
          ref={mainContentRef}
          tabIndex={-1}
          className={`flex-1 w-full mx-auto p-4 sm:p-6 pb-24 md:pb-8 outline-none focus-visible:outline-none ${playbackTarget && isBrowsingDuringPlayback ? 'bg-transparent' : ''}`}
        >
          {isLoadingData ? (
            <div className="flex flex-col items-center justify-center py-32 text-center">
              <div className="w-12 h-12 border-4 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin mb-4" />
              <h3 className="text-base font-bold text-white tracking-wide font-heading">
                Aggregating Sources & Channels ({activeProfiles.length} Connections)
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Synchronizing Xtream Codes, Portal / STB emulation, and streaming lines in parallel...
              </p>
            </div>
          ) : (
            <>
              {currentTab === 'home' && (
                <HomeView
                  liveStreams={liveStreams}
                  movies={vodStreams}
                  seriesList={seriesList}
                  activeProfiles={activeProfiles}
                  userProfile={userProfile}
                  onPlayLive={handlePlayLiveStream}
                  onPlayMovie={handlePlayMovie}
                  onPlayHistoryItem={handlePlayHistoryItem}
                  onNavigateTab={(tab) => setCurrentTab(tab)}
                  onOpenConnections={handleOpenServerSettings}
                  onPromptPinForStream={handlePromptPinForStream}
                  onPromptPinForMovie={handlePromptPinForMovie}
                  isPlaybackBackdrop={Boolean(playbackTarget && isBrowsingDuringPlayback)}
                />
              )}

              {currentTab === 'live' && (
                <LiveTVView
                  categories={liveCategories}
                  streams={liveStreams}
                  selectedCategoryId={selectedLiveCat}
                  onSelectCategory={handleSelectLiveCategory}
                  onPlayStream={handlePlayLiveStream}
                  onLaunchPiP={handleLaunchDirectPiP}
                  onToggleFavorite={handleToggleLiveFavorite}
                  onPromptPinForStream={handlePromptPinForStream}
                />
              )}

              {currentTab === 'movies' && (
                <MoviesView
                  categories={vodCategories}
                  movies={vodStreams}
                  selectedCategoryId={selectedVodCat}
                  onSelectCategory={handleSelectVodCategory}
                  onPlayMovie={handlePlayMovie}
                  onToggleFavorite={handleToggleMovieFavorite}
                  onPromptPinForMovie={handlePromptPinForMovie}
                />
              )}

              {currentTab === 'series' && (
                <SeriesView
                  categories={seriesCategories}
                  seriesList={seriesList}
                  selectedCategoryId={selectedSeriesCat}
                  onSelectCategory={handleSelectSeriesCategory}
                  onPlayEpisode={handlePlayEpisode}
                  onToggleFavorite={handleToggleSeriesFavorite}
                  onPromptPinForSeries={handlePromptPinForSeries}
                />
              )}

              {currentTab === 'favorites' && (
                <FavoritesView
                  liveStreams={liveStreams}
                  movies={vodStreams}
                  seriesList={seriesList}
                  onPlayLiveStream={handlePlayLiveStream}
                  onPlayMovie={handlePlayMovie}
                  onPlayHistoryItem={handlePlayHistoryItem}
                  onToggleFavorite={(type, id) => {
                    if (type === 'live') handleToggleLiveFavorite(id);
                    else if (type === 'vod') handleToggleMovieFavorite(id);
                    else handleToggleSeriesFavorite(id);
                  }}
                />
              )}

              {currentTab === 'search' && (
                <GlobalSearchView
                  liveStreams={liveStreams}
                  movies={vodStreams}
                  seriesList={seriesList}
                  onPlayLive={handlePlayLiveStream}
                  onPlayMovie={handlePlayMovie}
                  onSelectSeries={(series) => {
                    setCurrentTab('series');
                  }}
                  onPromptPinForStream={handlePromptPinForStream}
                  onPromptPinForMovie={handlePromptPinForMovie}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Lightweight guide shown over a still-running live stream. The full Live TV
          workspace remains separate for deliberate browsing/management. */}
      {playbackTarget?.type === 'live' && isBrowsingDuringPlayback && isWatchingGuideOpen && !isFloatingPiP && (
        <WatchingGuideOverlay
          categories={liveCategories}
          streams={liveStreams}
          currentStream={playbackTarget.stream}
          onPlayStream={handlePlayLiveStream}
          onClose={() => {
            setIsWatchingGuideOpen(false);
            setIsBrowsingDuringPlayback(false);
          }}
          onOpenAppNavigation={() => {
            // Dismiss the temporary Watching Guide and reveal the real Home
            // surface while the same playback session continues underneath.
            setCurrentTab('home');
            setIsWatchingGuideOpen(false);
            setIsBrowsingDuringPlayback(true);
            requestAnimationFrame(() => focusNavigationRail());
          }}
        />
      )}

      {/* Fullscreen Video Player Modal */}
      {playbackTarget && !isFloatingPiP && (
        <VideoPlayer
          target={playbackTarget}
          onClose={() => {
            // Player Back/Close is navigation, not Stop. Keep the session alive
            // and reveal Home over it. Explicit Stop owns session termination.
            setCurrentTab('home');
            setIsBrowsingDuringPlayback(true);
            requestAnimationFrame(() => focusNavigationRail());
          }}
          onMinimizeToPiP={() => setIsFloatingPiP(true)}
          onLaunchDualPiP={handleLaunchDualPiP}
          allLiveStreams={liveStreams}
          onSelectLiveStream={handlePlayLiveStream}
          onOpenPerformanceSettings={() => setIsPerformanceModalOpen(true)}
          onOpenGuide={() => {
            setCurrentTab('live');
            setIsWatchingGuideOpen(true);
            setIsBrowsingDuringPlayback(true);
          }}
          isVisuallyHidden={isBrowsingDuringPlayback}
        />
      )}

      {/* Floating In-App PiP Player & Multi-View Dual Screen */}
      {playbackTarget && isFloatingPiP && (
        <FloatingPiPPlayer
          primaryTarget={playbackTarget}
          secondaryTarget={secondaryPlaybackTarget}
          onExpandPrimary={() => setIsFloatingPiP(false)}
          onClose={() => {
            setPlaybackTarget(null);
            setSecondaryPlaybackTarget(null);
            setIsFloatingPiP(false);
          }}
          onCloseSecondary={() => setSecondaryPlaybackTarget(null)}
          onSwapTargets={handleSwapPipStreams}
        />
      )}

      {/* Streaming Performance & Anti-Buffering Settings Modal */}
      <StreamingPerformanceModal
        isOpen={isPerformanceModalOpen}
        onClose={() => setIsPerformanceModalOpen(false)}
      />

      {/* Server & Streaming Lines Settings Modal */}
      <ServerSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onProfileChanged={() => {
          setActiveProfiles(xtreamService.getActiveProfiles());
          loadData();
        }}
      />

      {/* Parental Controls & Privileges Modal */}
      <ParentalControlsModal
        isOpen={isParentalControlsOpen}
        onClose={() => setIsParentalControlsOpen(false)}
        categories={liveCategories}
        streams={liveStreams}
        onConfigChanged={() => {
          setUserProfile(parentalControlService.getActiveProfile());
          setAllUserProfiles(parentalControlService.getProfiles());
        }}
      />

      {/* Profile Switcher Modal */}
      <ProfileSwitcherModal
        isOpen={isProfileSwitcherOpen}
        onClose={() => setIsProfileSwitcherOpen(false)}
        activeProfile={userProfile}
        profiles={allUserProfiles}
        onSelectProfile={(selected) => {
          parentalControlService.setActiveProfile(selected.id);
          setUserProfile(selected);
        }}
        onOpenParentalControls={handleOpenParentalControls}
      />

      {/* Global PIN Prompt Modal */}
      <PinModal
        isOpen={pinPromptState.isOpen}
        title={pinPromptState.title}
        description={pinPromptState.description}
        onSuccess={pinPromptState.onSuccess}
        onCancel={() => setPinPromptState((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* Mobile Bottom Navigation Bar */}
      <BottomNavBar currentTab={currentTab} onSelectTab={setCurrentTab} />

      {/* Offline Toast */}
      <OfflineIndicator />
    </div>
  );
}

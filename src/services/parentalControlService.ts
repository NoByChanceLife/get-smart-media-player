import {
  UserProfile,
  UserPrivileges,
  ParentalControlsSettings,
  XtreamLiveStream,
  XtreamVodStream,
  XtreamSeries,
} from '../types/xtream';

const PARENTAL_SETTINGS_KEY = 'getsmart_parental_settings';
const LEGACY_PARENTAL_SETTINGS_KEY = 'streampulse_parental_settings';
const USER_PROFILES_KEY = 'getsmart_user_profiles';
const LEGACY_USER_PROFILES_KEY = 'streampulse_user_profiles';
const ACTIVE_USER_PROFILE_KEY = 'getsmart_active_user_id';
const LEGACY_ACTIVE_USER_PROFILE_KEY = 'streampulse_active_user_id';
const UNLOCKED_UNTIL_KEY = 'getsmart_unlocked_until';
const LEGACY_UNLOCKED_UNTIL_KEY = 'streampulse_unlocked_until';

export const DEFAULT_PARENTAL_SETTINGS: ParentalControlsSettings = {
  masterPin: '0000',
  hideLockedContentCompletely: false,
  lockedCategoryIds: ['news'], // default example locked category
  lockedChannelIds: [],
  lockedVodCategoryIds: [],
  lockedSeriesCategoryIds: [],
  globalMaxRating: 'all',
  restrictServerSettings: true,
  unlockTimeoutMinutes: 30,
};

export const DEFAULT_PROFILES: UserProfile[] = [
  {
    id: 'profile_admin',
    name: 'Master Admin',
    avatarColor: '#06b6d4', // cyan
    avatarIcon: 'crown',
    role: 'master_admin',
    isKids: false,
    privileges: {
      canAccessLiveTV: true,
      canAccessMovies: true,
      canAccessSeries: true,
      canManageServers: true,
      canModifyParentalControls: true,
      maxContentRating: 'all',
      blockedCategories: [],
      blockedChannelIds: [],
    },
    createdAt: new Date().toISOString(),
  },
  {
    id: 'profile_kids',
    name: 'Kids Profile',
    avatarColor: '#10b981', // emerald
    avatarIcon: 'smile',
    role: 'kids',
    isKids: true,
    privileges: {
      canAccessLiveTV: true,
      canAccessMovies: true,
      canAccessSeries: true,
      canManageServers: false,
      canModifyParentalControls: false,
      maxContentRating: 'PG',
      blockedCategories: ['news', 'action', 'scifi', 'crime'],
      blockedChannelIds: [],
    },
    createdAt: new Date().toISOString(),
  },
  {
    id: 'profile_family',
    name: 'Family & Guests',
    avatarColor: '#8b5cf6', // purple
    avatarIcon: 'user',
    role: 'standard',
    isKids: false,
    privileges: {
      canAccessLiveTV: true,
      canAccessMovies: true,
      canAccessSeries: true,
      canManageServers: false,
      canModifyParentalControls: false,
      maxContentRating: 'PG-13',
      blockedCategories: [],
      blockedChannelIds: [],
    },
    createdAt: new Date().toISOString(),
  },
];

class ParentalControlService {
  private settings: ParentalControlsSettings;
  private profiles: UserProfile[];
  private activeProfileId: string;
  private sessionUnlockedUntil: number = 0;

  constructor() {
    this.settings = this.loadSettings();
    this.profiles = this.loadProfiles();
    this.activeProfileId = this.loadActiveProfileId();
  }

  // Settings
  private loadSettings(): ParentalControlsSettings {
    try {
      const data = localStorage.getItem(PARENTAL_SETTINGS_KEY) || localStorage.getItem(LEGACY_PARENTAL_SETTINGS_KEY);
      if (data) {
        const parsed = { ...DEFAULT_PARENTAL_SETTINGS, ...JSON.parse(data) };
        if (!localStorage.getItem(PARENTAL_SETTINGS_KEY)) {
          localStorage.setItem(PARENTAL_SETTINGS_KEY, JSON.stringify(parsed));
        }
        return parsed;
      }
    } catch {
      // fallback
    }
    return DEFAULT_PARENTAL_SETTINGS;
  }

  public getSettings(): ParentalControlsSettings {
    return { ...this.settings };
  }

  public saveSettings(updates: Partial<ParentalControlsSettings>): void {
    this.settings = { ...this.settings, ...updates };
    localStorage.setItem(PARENTAL_SETTINGS_KEY, JSON.stringify(this.settings));
  }

  // Profiles
  private loadProfiles(): UserProfile[] {
    try {
      const data = localStorage.getItem(USER_PROFILES_KEY) || localStorage.getItem(LEGACY_USER_PROFILES_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed) && parsed.length > 0) {
          if (!localStorage.getItem(USER_PROFILES_KEY)) {
            localStorage.setItem(USER_PROFILES_KEY, JSON.stringify(parsed));
          }
          return parsed;
        }
      }
    } catch {
      // fallback
    }
    this.saveProfiles(DEFAULT_PROFILES);
    return DEFAULT_PROFILES;
  }

  public getProfiles(): UserProfile[] {
    return [...this.profiles];
  }

  public saveProfiles(profiles: UserProfile[]): void {
    this.profiles = profiles;
    localStorage.setItem(USER_PROFILES_KEY, JSON.stringify(profiles));
  }

  private loadActiveProfileId(): string {
    const saved = localStorage.getItem(ACTIVE_USER_PROFILE_KEY) || localStorage.getItem(LEGACY_ACTIVE_USER_PROFILE_KEY);
    const exists = this.profiles.some((p) => p.id === saved);
    if (exists && saved) return saved;
    return this.profiles[0]?.id || 'profile_admin';
  }

  public getActiveProfile(): UserProfile {
    const found = this.profiles.find((p) => p.id === this.activeProfileId);
    return found || this.profiles[0];
  }

  public setActiveProfile(profileId: string): void {
    const exists = this.profiles.some((p) => p.id === profileId);
    if (exists) {
      this.activeProfileId = profileId;
      localStorage.setItem(ACTIVE_USER_PROFILE_KEY, profileId);
      // Reset session unlock when switching profiles
      this.relockSession();
    }
  }

  public addUserProfile(profileData: Omit<UserProfile, 'id' | 'createdAt'>): UserProfile {
    const newProfile: UserProfile = {
      ...profileData,
      id: `profile_${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    const updated = [...this.profiles, newProfile];
    this.saveProfiles(updated);
    return newProfile;
  }

  public updateUserProfile(id: string, updates: Partial<UserProfile>): void {
    const updated = this.profiles.map((p) => {
      if (p.id === id) {
        return {
          ...p,
          ...updates,
          privileges: {
            ...p.privileges,
            ...(updates.privileges || {}),
          },
        };
      }
      return p;
    });
    this.saveProfiles(updated);
  }

  public deleteUserProfile(id: string): void {
    // Cannot delete the master admin
    const profile = this.profiles.find((p) => p.id === id);
    if (profile?.role === 'master_admin') {
      return;
    }
    const remaining = this.profiles.filter((p) => p.id !== id);
    this.saveProfiles(remaining);
    if (this.activeProfileId === id) {
      this.setActiveProfile(remaining[0]?.id || 'profile_admin');
    }
  }

  // PIN Verification & Session Unlocking
  public verifyMasterPin(inputPin: string): boolean {
    const isValid = inputPin.trim() === this.settings.masterPin.trim();
    if (isValid) {
      this.unlockSession(this.settings.unlockTimeoutMinutes || 30);
    }
    return isValid;
  }

  public updateMasterPin(oldPin: string, newPin: string): boolean {
    if (oldPin.trim() !== this.settings.masterPin.trim()) {
      return false;
    }
    if (newPin.trim().length < 4) {
      return false;
    }
    this.saveSettings({ masterPin: newPin.trim() });
    return true;
  }

  public unlockSession(minutes: number): void {
    this.sessionUnlockedUntil = Date.now() + minutes * 60 * 1000;
  }

  public relockSession(): void {
    this.sessionUnlockedUntil = 0;
  }

  public isSessionUnlocked(): boolean {
    const active = this.getActiveProfile();
    // Master admin is always unlocked
    if (active.role === 'master_admin') return true;
    return Date.now() < this.sessionUnlockedUntil;
  }

  // Restriction Checks
  public isChannelLocked(channel: XtreamLiveStream): boolean {
    if (this.isSessionUnlocked()) return false;

    const active = this.getActiveProfile();
    // Check channel ID in global locked channels or user blocked channels
    const isChannelIdLocked =
      this.settings.lockedChannelIds.includes(String(channel.stream_id)) ||
      (active.privileges.blockedChannelIds && active.privileges.blockedChannelIds.includes(String(channel.stream_id)));

    if (isChannelIdLocked) return true;

    // Check category in global locked or user blocked
    const isCategoryBlocked =
      this.settings.lockedCategoryIds.includes(channel.category_id) ||
      (active.privileges.blockedCategories && active.privileges.blockedCategories.includes(channel.category_id));

    if (isCategoryBlocked) return true;

    // Kids profile check: restrict non-animation / non-kids channels if category is adult/news/action
    if (active.isKids) {
      if (['news', 'sports', 'movies', 'action', 'crime'].includes(channel.category_id)) {
        return true;
      }
    }

    return false;
  }

  public isCategoryLocked(categoryId: string, type: 'live' | 'vod' | 'series' = 'live'): boolean {
    if (this.isSessionUnlocked()) return false;
    if (categoryId === 'all') return false;

    const active = this.getActiveProfile();

    let lockedList = this.settings.lockedCategoryIds;
    if (type === 'vod') lockedList = this.settings.lockedVodCategoryIds;
    if (type === 'series') lockedList = this.settings.lockedSeriesCategoryIds;

    const isGlobal = lockedList.includes(categoryId);
    const isUserBlocked = active.privileges.blockedCategories?.includes(categoryId) || false;

    if (isGlobal || isUserBlocked) return true;

    if (active.isKids) {
      return ['news', 'sports', 'movies', 'action', 'scifi', 'crime'].includes(categoryId);
    }

    return false;
  }

  public isMovieLocked(movie: XtreamVodStream): boolean {
    if (this.isSessionUnlocked()) return false;

    const active = this.getActiveProfile();

    if (this.settings.lockedVodCategoryIds.includes(movie.category_id)) return true;
    if (active.privileges.blockedCategories?.includes(movie.category_id)) return true;

    // Check rating constraint for profile
    const profileRating = active.privileges.maxContentRating || 'all';
    if (profileRating === 'PG' && (movie.category_id === 'action' || movie.category_id === 'scifi')) {
      return true;
    }

    return false;
  }

  public canAccessSection(section: 'live' | 'movies' | 'series'): boolean {
    const active = this.getActiveProfile();
    if (active.role === 'master_admin') return true;

    if (section === 'live') return active.privileges.canAccessLiveTV;
    if (section === 'movies') return active.privileges.canAccessMovies;
    if (section === 'series') return active.privileges.canAccessSeries;
    return true;
  }

  public canManageServers(): boolean {
    const active = this.getActiveProfile();
    if (active.role === 'master_admin') return true;
    if (!this.settings.restrictServerSettings) return true;
    return active.privileges.canManageServers && this.isSessionUnlocked();
  }

  // Toggle Category Lock
  public toggleCategoryLock(categoryId: string, type: 'live' | 'vod' | 'series' = 'live'): void {
    if (type === 'live') {
      const list = new Set(this.settings.lockedCategoryIds);
      if (list.has(categoryId)) list.delete(categoryId);
      else list.add(categoryId);
      this.saveSettings({ lockedCategoryIds: Array.from(list) });
    } else if (type === 'vod') {
      const list = new Set(this.settings.lockedVodCategoryIds);
      if (list.has(categoryId)) list.delete(categoryId);
      else list.add(categoryId);
      this.saveSettings({ lockedVodCategoryIds: Array.from(list) });
    } else {
      const list = new Set(this.settings.lockedSeriesCategoryIds);
      if (list.has(categoryId)) list.delete(categoryId);
      else list.add(categoryId);
      this.saveSettings({ lockedSeriesCategoryIds: Array.from(list) });
    }
  }

  // Toggle Channel Lock
  public toggleChannelLock(channelId: string | number): void {
    const id = String(channelId);
    const list = new Set(this.settings.lockedChannelIds);
    if (list.has(id)) list.delete(id);
    else list.add(id);
    this.saveSettings({ lockedChannelIds: Array.from(list) });
  }

  public isChannelHidden(channel: XtreamLiveStream): boolean {
    if (!this.settings.hideLockedContentCompletely) return false;
    return this.isChannelLocked(channel);
  }

  public isMovieHidden(movie: XtreamVodStream): boolean {
    if (!this.settings.hideLockedContentCompletely) return false;
    return this.isMovieLocked(movie);
  }

  public isSeriesHidden(series: XtreamSeries): boolean {
    if (!this.settings.hideLockedContentCompletely) return false;
    return this.isCategoryLocked(series.category_id, 'series');
  }
}

export const parentalControlService = new ParentalControlService();

import {
  XtreamCredentials,
  XtreamAuthResponse,
  XtreamCategory,
  XtreamLiveStream,
  XtreamVodStream,
  XtreamSeries,
  XtreamSeason,
  XtreamEpisode,
  XtreamEPGProgramme,
  SavedProfile,
} from '../types/xtream';
import {
  DEMO_AUTH_DATA,
  DEMO_LIVE_CATEGORIES,
  DEMO_LIVE_STREAMS,
  DEMO_VOD_CATEGORIES,
  DEMO_VOD_STREAMS,
  DEMO_SERIES_CATEGORIES,
  DEMO_SERIES_LIST,
  DEMO_SERIES_SEASONS,
  generateDemoEPG,
} from '../data/demoXtreamData';
import { parseM3uContent, ParsedM3uResult } from './m3uParser';
import { fetchStalkerChannels, resolveStalkerStreamLink } from './stalkerClient';
import { getProviderTransport } from './providerTransport';

const PROFILES_STORAGE_KEY = 'getsmart_xtream_profiles_v2';
const LEGACY_PROFILES_STORAGE_KEY = 'streampulse_xtream_profiles_v2';
const FAVORITES_STORAGE_KEY = 'getsmart_favorites';
const LEGACY_FAVORITES_STORAGE_KEY = 'streampulse_favorites';
const HISTORY_STORAGE_KEY = 'getsmart_history';
const LEGACY_HISTORY_STORAGE_KEY = 'streampulse_history';
const SERVER_FILTER_KEY = 'getsmart_server_filter';
const LEGACY_SERVER_FILTER_KEY = 'streampulse_server_filter';

export interface WatchHistoryItem {
  id: string;
  type: 'live' | 'vod' | 'episode';
  title: string;
  subtitle?: string;
  icon?: string;
  streamUrl?: string; // Optional; deprecated for localStorage to avoid storing authenticated URLs
  progressSeconds?: number;
  durationSeconds?: number;
  updatedAt: number;
  serverId?: string;
  serverName?: string;
}

export const SERVER_COLORS = [
  '#06b6d4', // cyan
  '#f59e0b', // amber
  '#10b981', // emerald
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#3b82f6', // blue
];

class XtreamService {
  private profiles: SavedProfile[] = [];
  private serverFilter: string = 'all';
  private m3uCache = new Map<string, { data: ParsedM3uResult; timestamp: number }>();

  constructor() {
    this.loadProfiles();
  }

  public async getM3uData(profile: SavedProfile): Promise<ParsedM3uResult | null> {
    if (profile.type !== 'm3u' || !profile.m3uConfig) return null;

    const cacheKey = profile.id;
    const cached = this.m3uCache.get(cacheKey);
    const now = Date.now();
    if (cached && now - cached.timestamp < 300000) {
      return cached.data;
    }

    let content = profile.m3uConfig.rawM3uContent || '';
    if (!content && profile.m3uConfig.playlistUrl) {
      try {
        const res = await fetch('/api/xtream/proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: profile.m3uConfig.playlistUrl }),
        });
        if (res.ok) {
          content = await res.text();
        }
      } catch {
        return null;
      }
    }

    if (!content) return null;

    try {
      const parsed = parseM3uContent(
        content,
        profile.id,
        profile.name,
        profile.colorBadge || SERVER_COLORS[2]
      );
      this.m3uCache.set(cacheKey, { data: parsed, timestamp: now });
      return parsed;
    } catch {
      return null;
    }
  }

  /**
   * Normalizes server URLs properly handling http/https, explicit ports,
   * trailing slashes, and subpaths.
   */
  public normalizeUrl(rawUrl: string): string {
    let clean = (rawUrl || '').trim();
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = 'http://' + clean;
    }
    try {
      const u = new URL(clean);
      u.pathname = u.pathname
        .replace(/\/player_api\.php$/i, '')
        .replace(/\/get\.php$/i, '')
        .replace(/\/c\/?$/i, '')
        .replace(/\/+$/, '');
      u.search = '';
      u.hash = '';
      return u.toString().replace(/\/+$/, '');
    } catch {
      return clean
        .replace(/\/player_api\.php$/i, '')
        .replace(/\/get\.php$/i, '')
        .replace(/\/c\/?$/i, '')
        .replace(/\/+$/, '');
    }
  }

  // Load profiles from storage
  public loadProfiles(): SavedProfile[] {
    try {
      const data =
        localStorage.getItem(PROFILES_STORAGE_KEY) ||
        localStorage.getItem(LEGACY_PROFILES_STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        this.profiles = parsed.map((p: SavedProfile) => ({
          ...p,
          name: p.name?.replace('StreamPulse Demo Server', 'Get Smart Demo Server') || p.name,
        }));
        this.saveProfiles(this.profiles);
        return this.profiles;
      }
    } catch {
      // Fallback
    }

    // Default profile list: includes demo server pre-enabled
    const demoProfile: SavedProfile = {
      id: 'demo_xtream',
      name: 'Get Smart Demo Server',
      type: 'xtream',
      isActive: true,
      colorBadge: SERVER_COLORS[0],
      serverUrl: 'https://demo.getsmartmedia.tv:8080',
      username: 'demo_user',
      password: 'demo_password',
      isDemo: true,
      lastConnected: new Date().toISOString(),
      userInfo: DEMO_AUTH_DATA.user_info,
      serverInfo: DEMO_AUTH_DATA.server_info,
    };

    this.profiles = [demoProfile];
    this.saveProfiles(this.profiles);
    return this.profiles;
  }

  public getProfiles(): SavedProfile[] {
    return this.profiles;
  }

  public saveProfiles(profiles: SavedProfile[]): void {
    this.profiles = profiles;
    try {
      localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(profiles));
    } catch {
      // Storage full
    }
  }

  public getActiveProfiles(): SavedProfile[] {
    const active = this.profiles.filter((p) => p.isActive);
    return active.length > 0 ? active : [this.profiles[0]];
  }

  public toggleProfileActive(id: string): void {
    const updated = this.profiles.map((p) => {
      if (p.id === id) {
        return { ...p, isActive: !p.isActive };
      }
      return p;
    });

    // Ensure at least one profile is active
    if (!updated.some((p) => p.isActive)) {
      const target = updated.find((p) => p.id === id);
      if (target) target.isActive = true;
    }

    this.saveProfiles(updated);
  }

  // Server Filter State (All active servers or specific server)
  public getServerFilter(): string {
    return this.serverFilter;
  }

  public setServerFilter(filter: string): void {
    this.serverFilter = filter;
  }

  // Provider protocol calls go through a transport boundary so the same Xtream
  // logic can run over the web backend today and native Android networking later.
  public async fetchViaProxy<T>(url: string, mac?: string, token?: string): Promise<T> {
    return getProviderTransport().requestJson<T>({
      url,
      mac,
      token,
      userAgent: mac ? undefined : 'okhttp/3.12.11',
    });
  }

  // Authenticate Xtream credentials without logging passwords
  public async authenticate(creds: XtreamCredentials): Promise<XtreamAuthResponse> {
    if (creds.isDemo) {
      return DEMO_AUTH_DATA;
    }

    const base = this.normalizeUrl(creds.serverUrl);
    const authUrl = `${base}/player_api.php?username=${encodeURIComponent(
      creds.username
    )}&password=${encodeURIComponent(creds.password)}`;

    try {
      const data = await this.fetchViaProxy<XtreamAuthResponse>(authUrl);
      if (!data || !data.user_info) {
        throw new Error('Unsupported API response: missing user_info structure.');
      }

      const u = data.user_info;
      if (u.auth === 0 || u.auth === false) {
        throw new Error('Invalid credentials: Username or password rejected by server.');
      }
      if (u.status === 'Banned') {
        throw new Error('Account has been banned by IPTV provider.');
      }
      if (u.status === 'Disabled') {
        throw new Error('Account has been disabled by IPTV provider.');
      }
      if (u.status === 'Expired') {
        throw new Error('Account subscription has expired.');
      }

      // Check expiration timestamp if provided
      if (u.exp_date && u.exp_date !== 'null') {
        const expTimestamp = parseInt(String(u.exp_date), 10);
        if (!isNaN(expTimestamp) && expTimestamp > 0) {
          const nowSeconds = Math.floor(Date.now() / 1000);
          if (nowSeconds > expTimestamp) {
            const expDateStr = new Date(expTimestamp * 1000).toISOString().split('T')[0];
            throw new Error(`Account expired on ${expDateStr}. Please renew with your provider.`);
          }
        }
      }

      return data;
    } catch (err: unknown) {
      const error = err as Error;
      throw new Error(error.message || 'Failed to authenticate with Xtream Codes server.');
    }
  }

  // Multi-Server Aggregated Live Categories
  public async getLiveCategories(): Promise<XtreamCategory[]> {
    const activeProfiles = this.getActiveProfiles();
    const categoriesMap = new Map<string, XtreamCategory>();

    categoriesMap.set('all', {
      category_id: 'all',
      category_name: '⭐ All Channels',
    });

    for (const profile of activeProfiles) {
      if (profile.type === 'xtream') {
        if (profile.isDemo) {
          DEMO_LIVE_CATEGORIES.forEach((cat) => {
            if (cat.category_id !== 'all' && !categoriesMap.has(cat.category_id)) {
              categoriesMap.set(cat.category_id, cat);
            }
          });
        } else {
          try {
            const base = this.normalizeUrl(profile.serverUrl || '');
            const url = `${base}/player_api.php?username=${encodeURIComponent(
              profile.username || ''
            )}&password=${encodeURIComponent(profile.password || '')}&action=get_live_categories`;
            const cats = await this.fetchViaProxy<XtreamCategory[]>(url);
            if (Array.isArray(cats)) {
              cats.forEach((c) => {
                const uniqueKey = `${profile.id}_${c.category_id}`;
                categoriesMap.set(uniqueKey, {
                  category_id: uniqueKey,
                  category_name: c.category_name,
                  serverId: profile.id,
                  serverName: profile.name,
                });
              });
            }
          } catch {
            // Ignore failure for individual offline server
          }
        }
      } else if (profile.type === 'stalker' && profile.stbConfig) {
        try {
          const stalkerData = await fetchStalkerChannels(
            profile.stbConfig,
            profile.id,
            profile.name,
            profile.colorBadge || SERVER_COLORS[1]
          );
          stalkerData.categories.forEach((c) => {
            if (c.category_id !== 'all') {
              categoriesMap.set(c.category_id, c);
            }
          });
        } catch {
          // Ignore stalker error
        }
      } else if (profile.type === 'm3u' && profile.m3uConfig) {
        const parsed = await this.getM3uData(profile);
        if (parsed) {
          parsed.categories.forEach((c) => {
            if (c.category_id !== 'all') {
              categoriesMap.set(c.category_id, c);
            }
          });
        }
      }
    }

    return Array.from(categoriesMap.values());
  }

  // Multi-Server Aggregated Live Streams
  public async getLiveStreams(categoryId = 'all'): Promise<XtreamLiveStream[]> {
    const activeProfiles = this.getActiveProfiles();
    const allStreams: XtreamLiveStream[] = [];
    const favs = this.getFavorites();

    const fetchTasks = activeProfiles.map(async (profile) => {
      // Check if user selected a single server filter
      if (this.serverFilter !== 'all' && profile.id !== this.serverFilter) {
        return;
      }

      if (profile.type === 'xtream') {
        if (profile.isDemo) {
          DEMO_LIVE_STREAMS.forEach((s) => {
            allStreams.push({
              ...s,
              serverId: profile.id,
              serverName: profile.name,
              serverBadgeColor: profile.colorBadge || SERVER_COLORS[0],
              isFavorite: favs.has(`live_${s.stream_id}`),
            });
          });
        } else {
          try {
            const base = this.normalizeUrl(profile.serverUrl || '');
            let url = `${base}/player_api.php?username=${encodeURIComponent(
              profile.username || ''
            )}&password=${encodeURIComponent(profile.password || '')}&action=get_live_streams`;

            // If specific category requested
            if (categoryId && categoryId !== 'all' && categoryId.startsWith(`${profile.id}_`)) {
              const rawCatId = categoryId.replace(`${profile.id}_`, '');
              url += `&category_id=${encodeURIComponent(rawCatId)}`;
            }

            const streams = await this.fetchViaProxy<XtreamLiveStream[]>(url);
            if (Array.isArray(streams)) {
              streams.forEach((s) => {
                allStreams.push({
                  ...s,
                  stream_id: `${profile.id}_${s.stream_id}`,
                  category_id: `${profile.id}_${s.category_id}`,
                  serverId: profile.id,
                  serverName: profile.name,
                  serverBadgeColor: profile.colorBadge || SERVER_COLORS[1],
                  isFavorite: favs.has(`live_${profile.id}_${s.stream_id}`),
                });
              });
            }
          } catch {
            // Server timeout or offline
          }
        }
      } else if (profile.type === 'stalker' && profile.stbConfig) {
        try {
          const stalkerData = await fetchStalkerChannels(
            profile.stbConfig,
            profile.id,
            profile.name,
            profile.colorBadge || SERVER_COLORS[1]
          );
          stalkerData.streams.forEach((s) => {
            allStreams.push({
              ...s,
              isFavorite: favs.has(`live_${s.stream_id}`),
            });
          });
        } catch {
          // Ignore
        }
      } else if (profile.type === 'm3u' && profile.m3uConfig) {
        const parsed = await this.getM3uData(profile);
        if (parsed) {
          parsed.liveStreams.forEach((s) => {
            allStreams.push({
              ...s,
              isFavorite: favs.has(`live_${s.stream_id}`),
            });
          });
        }
      } else if (profile.type === 'single_stream' && profile.singleStream) {
        allStreams.push({
          num: allStreams.length + 1,
          name: profile.singleStream.name,
          stream_type: 'live',
          stream_id: `${profile.id}_single_1`,
          stream_icon: profile.singleStream.logo || '',
          category_id: 'all',
          direct_source: profile.singleStream.streamUrl,
          serverId: profile.id,
          serverName: profile.name,
          serverBadgeColor: profile.colorBadge || SERVER_COLORS[3],
          isFavorite: favs.has(`live_${profile.id}_single_1`),
        });
      }
    });

    await Promise.all(fetchTasks);

    // Apply category filter if not 'all'
    if (categoryId && categoryId !== 'all') {
      return allStreams.filter(
        (s) => s.category_id === categoryId || s.category_id.endsWith(`_${categoryId}`)
      );
    }

    return allStreams;
  }

  // Multi-Server Aggregated VOD Categories
  public async getVodCategories(): Promise<XtreamCategory[]> {
    const activeProfiles = this.getActiveProfiles();
    const categoriesMap = new Map<string, XtreamCategory>();

    categoriesMap.set('all', {
      category_id: 'all',
      category_name: '⭐ All Movies',
    });

    for (const profile of activeProfiles) {
      if (profile.type === 'xtream') {
        if (profile.isDemo) {
          DEMO_VOD_CATEGORIES.forEach((cat) => {
            if (cat.category_id !== 'all' && !categoriesMap.has(cat.category_id)) {
              categoriesMap.set(cat.category_id, cat);
            }
          });
        } else {
          try {
            const base = this.normalizeUrl(profile.serverUrl || '');
            const url = `${base}/player_api.php?username=${encodeURIComponent(
              profile.username || ''
            )}&password=${encodeURIComponent(profile.password || '')}&action=get_vod_categories`;
            const cats = await this.fetchViaProxy<XtreamCategory[]>(url);
            if (Array.isArray(cats)) {
              cats.forEach((c) => {
                const uniqueKey = `${profile.id}_${c.category_id}`;
                categoriesMap.set(uniqueKey, {
                  category_id: uniqueKey,
                  category_name: c.category_name,
                  serverId: profile.id,
                  serverName: profile.name,
                });
              });
            }
          } catch {
            // Ignore
          }
        }
      } else if (profile.type === 'm3u' && profile.m3uConfig) {
        const parsed = await this.getM3uData(profile);
        if (parsed) {
          parsed.categories.forEach((c) => {
            if (c.category_id !== 'all') {
              categoriesMap.set(c.category_id, c);
            }
          });
        }
      }
    }

    return Array.from(categoriesMap.values());
  }

  // Multi-Server Aggregated VOD Streams (Movies)
  public async getVodStreams(categoryId = 'all'): Promise<XtreamVodStream[]> {
    const activeProfiles = this.getActiveProfiles();
    const favs = this.getFavorites();
    const allMovies: XtreamVodStream[] = [];

    const fetchTasks = activeProfiles.map(async (profile) => {
      if (this.serverFilter !== 'all' && profile.id !== this.serverFilter) {
        return;
      }

      if (profile.type === 'xtream') {
        if (profile.isDemo) {
          DEMO_VOD_STREAMS.forEach((m) => {
            allMovies.push({
              ...m,
              serverId: profile.id,
              serverName: profile.name,
              serverBadgeColor: profile.colorBadge || SERVER_COLORS[0],
              isFavorite: favs.has(`vod_${m.stream_id}`),
            });
          });
        } else {
          try {
            const base = this.normalizeUrl(profile.serverUrl || '');
            let url = `${base}/player_api.php?username=${encodeURIComponent(
              profile.username || ''
            )}&password=${encodeURIComponent(profile.password || '')}&action=get_vod_streams`;

            if (categoryId && categoryId !== 'all' && categoryId.startsWith(`${profile.id}_`)) {
              const rawCatId = categoryId.replace(`${profile.id}_`, '');
              url += `&category_id=${encodeURIComponent(rawCatId)}`;
            }

            const streams = await this.fetchViaProxy<XtreamVodStream[]>(url);
            if (Array.isArray(streams)) {
              streams.forEach((m) => {
                allMovies.push({
                  ...m,
                  stream_id: `${profile.id}_${m.stream_id}`,
                  category_id: `${profile.id}_${m.category_id}`,
                  serverId: profile.id,
                  serverName: profile.name,
                  serverBadgeColor: profile.colorBadge || SERVER_COLORS[1],
                  isFavorite: favs.has(`vod_${profile.id}_${m.stream_id}`),
                });
              });
            }
          } catch {
            // Ignore
          }
        }
      } else if (profile.type === 'm3u' && profile.m3uConfig) {
        const parsed = await this.getM3uData(profile);
        if (parsed) {
          parsed.vodStreams.forEach((m) => {
            allMovies.push({
              ...m,
              isFavorite: favs.has(`vod_${m.stream_id}`),
            });
          });
        }
      }
    });

    await Promise.all(fetchTasks);

    if (categoryId && categoryId !== 'all') {
      return allMovies.filter(
        (m) => m.category_id === categoryId || m.category_id.endsWith(`_${categoryId}`)
      );
    }

    return allMovies;
  }

  // Multi-Server Aggregated Series Categories
  public async getSeriesCategories(): Promise<XtreamCategory[]> {
    const activeProfiles = this.getActiveProfiles();
    const categoriesMap = new Map<string, XtreamCategory>();

    categoriesMap.set('all', {
      category_id: 'all',
      category_name: '⭐ All Series',
    });

    for (const profile of activeProfiles) {
      if (profile.type === 'xtream') {
        if (profile.isDemo) {
          DEMO_SERIES_CATEGORIES.forEach((cat) => {
            if (cat.category_id !== 'all' && !categoriesMap.has(cat.category_id)) {
              categoriesMap.set(cat.category_id, cat);
            }
          });
        } else {
          try {
            const base = this.normalizeUrl(profile.serverUrl || '');
            const url = `${base}/player_api.php?username=${encodeURIComponent(
              profile.username || ''
            )}&password=${encodeURIComponent(profile.password || '')}&action=get_series_categories`;
            const cats = await this.fetchViaProxy<XtreamCategory[]>(url);
            if (Array.isArray(cats)) {
              cats.forEach((c) => {
                const uniqueKey = `${profile.id}_${c.category_id}`;
                categoriesMap.set(uniqueKey, {
                  category_id: uniqueKey,
                  category_name: c.category_name,
                  serverId: profile.id,
                  serverName: profile.name,
                });
              });
            }
          } catch {
            // Ignore
          }
        }
      }
    }

    return Array.from(categoriesMap.values());
  }

  // Multi-Server Aggregated Series List
  public async getSeriesList(categoryId = 'all'): Promise<XtreamSeries[]> {
    const activeProfiles = this.getActiveProfiles();
    const favs = this.getFavorites();
    const allSeries: XtreamSeries[] = [];

    const fetchTasks = activeProfiles.map(async (profile) => {
      if (this.serverFilter !== 'all' && profile.id !== this.serverFilter) {
        return;
      }

      if (profile.type === 'xtream') {
        if (profile.isDemo) {
          DEMO_SERIES_LIST.forEach((s) => {
            allSeries.push({
              ...s,
              serverId: profile.id,
              serverName: profile.name,
              serverBadgeColor: profile.colorBadge || SERVER_COLORS[0],
              isFavorite: favs.has(`series_${s.series_id}`),
            });
          });
        } else {
          try {
            const base = this.normalizeUrl(profile.serverUrl || '');
            let url = `${base}/player_api.php?username=${encodeURIComponent(
              profile.username || ''
            )}&password=${encodeURIComponent(profile.password || '')}&action=get_series`;

            if (categoryId && categoryId !== 'all' && categoryId.startsWith(`${profile.id}_`)) {
              const rawCatId = categoryId.replace(`${profile.id}_`, '');
              url += `&category_id=${encodeURIComponent(rawCatId)}`;
            }

            const series = await this.fetchViaProxy<XtreamSeries[]>(url);
            if (Array.isArray(series)) {
              series.forEach((s) => {
                allSeries.push({
                  ...s,
                  series_id: `${profile.id}_${s.series_id}`,
                  category_id: `${profile.id}_${s.category_id}`,
                  serverId: profile.id,
                  serverName: profile.name,
                  serverBadgeColor: profile.colorBadge || SERVER_COLORS[1],
                  isFavorite: favs.has(`series_${profile.id}_${s.series_id}`),
                });
              });
            }
          } catch {
            // Ignore
          }
        }
      }
    });

    await Promise.all(fetchTasks);

    if (categoryId && categoryId !== 'all') {
      return allSeries.filter(
        (s) => s.category_id === categoryId || s.category_id.endsWith(`_${categoryId}`)
      );
    }

    return allSeries;
  }

  // Fetch Series Info (Seasons & Episodes)
  public async getSeriesInfo(seriesId: number | string): Promise<XtreamSeason[]> {
    const sIdStr = String(seriesId);

    // Check if demo
    if (sIdStr.startsWith('demo_') || !sIdStr.includes('_')) {
      const idNum = parseInt(sIdStr.replace(/[^0-9]/g, ''), 10);
      return DEMO_SERIES_SEASONS[idNum] || [];
    }

    // Extract serverId and raw seriesId
    const firstUnderscore = sIdStr.indexOf('_');
    const serverId = sIdStr.substring(0, firstUnderscore);
    const rawSeriesId = sIdStr.substring(firstUnderscore + 1);

    const profile = this.profiles.find((p) => p.id === serverId);
    if (!profile || profile.isDemo) {
      return [];
    }

    try {
      const base = this.normalizeUrl(profile.serverUrl || '');
      const url = `${base}/player_api.php?username=${encodeURIComponent(
        profile.username || ''
      )}&password=${encodeURIComponent(profile.password || '')}&action=get_series_info&series_id=${encodeURIComponent(
        rawSeriesId
      )}`;

      const data = await this.fetchViaProxy<any>(url);
      if (data && data.episodes && typeof data.episodes === 'object') {
        const seasons: XtreamSeason[] = [];
        const seasonKeys = Object.keys(data.episodes).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

        seasonKeys.forEach((sKey) => {
          const sNum = parseInt(sKey, 10);
          const rawEps = data.episodes[sKey];
          if (Array.isArray(rawEps)) {
            const mappedEpisodes: XtreamEpisode[] = rawEps.map((ep: any) => ({
              id: `${serverId}_${ep.id}`,
              episode_num: parseInt(String(ep.episode_num || '1'), 10),
              title: ep.title || `Episode ${ep.episode_num || ''}`,
              container_extension: ep.container_extension || 'mp4',
              info: ep.info || {},
              video_url: ep.video_url,
            }));

            seasons.push({
              season_num: sNum,
              name: `Season ${sNum}`,
              episodes: mappedEpisodes,
            });
          }
        });

        return seasons;
      }
    } catch {
      // Fallback
    }

    return [];
  }

  // Fetch Electronic Programme Schedule (EPG)
  public async getEPG(streamId: number | string): Promise<XtreamEPGProgramme[]> {
    const sIdStr = String(streamId);

    // If demo stream
    if (sIdStr.startsWith('demo_') || !sIdStr.includes('_')) {
      const idNum = parseInt(sIdStr.replace(/[^0-9]/g, ''), 10) || 101;
      return generateDemoEPG(idNum);
    }

    const firstUnderscore = sIdStr.indexOf('_');
    const serverId = sIdStr.substring(0, firstUnderscore);
    const rawStreamId = sIdStr.substring(firstUnderscore + 1);

    const profile = this.profiles.find((p) => p.id === serverId);
    if (!profile) {
      return [];
    }
    if (profile.isDemo) {
      return generateDemoEPG(101);
    }

    try {
      const base = this.normalizeUrl(profile.serverUrl || '');
      const url = `${base}/player_api.php?username=${encodeURIComponent(
        profile.username || ''
      )}&password=${encodeURIComponent(profile.password || '')}&action=get_short_epg&stream_id=${encodeURIComponent(
        rawStreamId
      )}&limit=10`;

      const data = await this.fetchViaProxy<any>(url);
      if (data && Array.isArray(data.epg_listings) && data.epg_listings.length > 0) {
        return data.epg_listings.map((p: any) => {
          let cleanTitle = p.title || '';
          try {
            // Some Xtream servers base64 encode EPG titles
            if (p.title && !p.title.includes(' ') && p.title.length > 8) {
              const decoded = atob(p.title);
              if (decoded && /^[A-Za-z0-9\s:.,!?'-]+$/.test(decoded)) {
                cleanTitle = decoded;
              }
            }
          } catch {
            // Keep original title
          }

          return {
            id: String(p.id || Math.random()),
            epg_id: String(p.epg_id || ''),
            title: cleanTitle,
            lang: p.lang || 'en',
            start: p.start || '',
            end: p.end || '',
            description: p.description || '',
            channel_id: String(p.channel_id || rawStreamId),
            start_timestamp: p.start_timestamp ? String(p.start_timestamp) : undefined,
            stop_timestamp: p.stop_timestamp ? String(p.stop_timestamp) : undefined,
          };
        });
      }
    } catch {
      // Fallback
    }

    // Never substitute demo programme data for a real provider whose EPG is
    // unavailable or empty. The UI can show a neutral no-data state instead.
    return [];
  }

  /**
   * Exchanges a sensitive upstream media URL for a short-lived opaque server path.
   * The provider URL is sent in the POST body and is not exposed in browser query strings.
   */
  public async createStreamTicket(streamUrl: string): Promise<string> {
    const response = await fetch('/api/xtream/stream-ticket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: streamUrl }),
    });

    if (!response.ok) {
      let message = `Unable to prepare stream (HTTP ${response.status}).`;
      try {
        const data = await response.json();
        if (data?.error) message = data.error;
      } catch {
        // Keep generic message.
      }
      throw new Error(message);
    }

    const data = await response.json();
    if (!data?.streamPath || typeof data.streamPath !== 'string') {
      throw new Error('Stream ticket response was invalid.');
    }
    return data.streamPath;
  }

  // Generate Stream Playback URL
  public buildStreamUrl(
    type: 'live' | 'vod' | 'series',
    id: number | string,
    extension = 'm3u8',
    directSource?: string,
    serverId?: string
  ): string {
    if (directSource) {
      if (directSource.startsWith('https://')) {
        return directSource;
      }
      return `/api/xtream/stream?url=${encodeURIComponent(directSource)}`;
    }

    const profiles = this.getActiveProfiles();
    const profile = serverId ? profiles.find((p) => p.id === serverId) || profiles[0] : profiles[0];

    if (!profile || profile.isDemo) {
      return 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
    }

    const base = this.normalizeUrl(profile.serverUrl || '');
    let rawStreamUrl = '';
    const cleanId = String(id).replace(`${profile.id}_`, '');

    if (type === 'live') {
      rawStreamUrl = `${base}/live/${profile.username}/${profile.password}/${cleanId}.${extension}`;
    } else if (type === 'vod') {
      rawStreamUrl = `${base}/movie/${profile.username}/${profile.password}/${cleanId}.${
        extension || 'mp4'
      }`;
    } else {
      rawStreamUrl = `${base}/series/${profile.username}/${profile.password}/${cleanId}.${
        extension || 'mp4'
      }`;
    }

    return `/api/xtream/stream?url=${encodeURIComponent(rawStreamUrl)}`;
  }

  // Favorites Management
  public getFavorites(): Set<string> {
    try {
      const data =
        localStorage.getItem(FAVORITES_STORAGE_KEY) ||
        localStorage.getItem(LEGACY_FAVORITES_STORAGE_KEY);
      if (data && !localStorage.getItem(FAVORITES_STORAGE_KEY)) {
        localStorage.setItem(FAVORITES_STORAGE_KEY, data);
      }
      return new Set(data ? JSON.parse(data) : []);
    } catch {
      return new Set();
    }
  }

  public toggleFavorite(key: string): boolean {
    const set = this.getFavorites();
    let isNowFav = false;
    if (set.has(key)) {
      set.delete(key);
      isNowFav = false;
    } else {
      set.add(key);
      isNowFav = true;
    }
    try {
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(Array.from(set)));
    } catch {
      // Storage full
    }
    return isNowFav;
  }

  // Watch History Management
  public getHistory(): WatchHistoryItem[] {
    try {
      const data =
        localStorage.getItem(HISTORY_STORAGE_KEY) ||
        localStorage.getItem(LEGACY_HISTORY_STORAGE_KEY);
      if (data && !localStorage.getItem(HISTORY_STORAGE_KEY)) {
        localStorage.setItem(HISTORY_STORAGE_KEY, data);
      }
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  public clearHistory(): void {
    try {
      localStorage.removeItem(HISTORY_STORAGE_KEY);
      localStorage.removeItem(LEGACY_HISTORY_STORAGE_KEY);
    } catch {
      // Ignore
    }
  }

  public addToHistory(item: Omit<WatchHistoryItem, 'updatedAt'>): void {
    try {
      const history = this.getHistory().filter((h) => h.id !== item.id);
      // Strip sensitive streamUrl containing credentials/tokens before localStorage write
      const { streamUrl: _sensitiveUrl, ...safeItem } = item;
      history.unshift({
        ...safeItem,
        updatedAt: Date.now(),
      });
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history.slice(0, 50)));
    } catch {
      // Storage full
    }
  }
}

export const xtreamService = new XtreamService();

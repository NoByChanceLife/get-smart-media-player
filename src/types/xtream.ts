export type ServerType = 'xtream' | 'stalker' | 'm3u' | 'single_stream';

export interface StbPortalConfig {
  macAddress: string;
  portalUrl: string;
  stbModel: 'MAG250' | 'MAG254' | 'MAG322' | 'MAG424' | 'MAG520' | 'AuraHD';
  serialNumber?: string;
  deviceId?: string;
  deviceId2?: string;
  signature?: string;
  token?: string;
  customUserAgent?: string;
}

export interface M3uConfig {
  playlistUrl?: string;
  rawM3uContent?: string;
  autoRefreshMinutes?: number;
}

export interface SingleStreamConfig {
  streamUrl: string;
  name: string;
  category?: string;
  logo?: string;
}

export interface XtreamCredentials {
  serverUrl: string;
  username: string;
  password: string;
  profileName?: string;
  isDemo?: boolean;
}

export interface SavedProfile {
  id: string;
  name: string;
  type: ServerType;
  isActive: boolean; // Controls whether this server is enabled in multi-server simultaneous aggregation
  colorBadge?: string; // Color identifier for multi-server display
  lastConnected?: string;

  // Xtream Codes
  serverUrl?: string;
  username?: string;
  password?: string;
  isDemo?: boolean;

  // Portal / STB Emulation
  stbConfig?: StbPortalConfig;

  // M3U Playlist
  m3uConfig?: M3uConfig;

  // Single Streaming Line
  singleStream?: SingleStreamConfig;

  userInfo?: XtreamUserInfo;
  serverInfo?: XtreamServerInfo;
}

export interface XtreamUserInfo {
  username: string;
  password?: string;
  message?: string;
  auth: number | boolean;
  status: 'Active' | 'Banned' | 'Disabled' | 'Expired';
  exp_date: string;
  is_trial: string;
  active_cons: string;
  max_connections: string;
  created_at?: string;
  allowed_output_formats?: string[];
}

export interface XtreamServerInfo {
  url: string;
  port: string;
  https_port?: string;
  server_protocol: string;
  rtmp_port?: string;
  timezone: string;
  time_now: string;
  process?: boolean;
}

export interface XtreamAuthResponse {
  user_info: XtreamUserInfo;
  server_info: XtreamServerInfo;
}

export interface XtreamCategory {
  category_id: string;
  category_name: string;
  parent_id?: number;
  serverId?: string;
  serverName?: string;
}

export interface XtreamLiveStream {
  num: number | string;
  name: string;
  stream_type: 'live';
  stream_id: number | string;
  stream_icon: string;
  epg_channel_id?: string;
  added?: string;
  category_id: string;
  custom_sid?: string;
  tv_archive?: number;
  direct_source?: string;
  tv_archive_duration?: number;
  isFavorite?: boolean;
  currentProgram?: string;
  serverId?: string;
  serverName?: string;
  serverBadgeColor?: string;
}

export interface XtreamVodStream {
  num: number | string;
  name: string;
  stream_type: 'movie';
  stream_id: number | string;
  stream_icon: string;
  rating?: string | number;
  rating_5based?: number;
  added?: string;
  category_id: string;
  container_extension?: string;
  custom_sid?: string;
  direct_source?: string;
  year?: string;
  plot?: string;
  duration?: string;
  isFavorite?: boolean;
  serverId?: string;
  serverName?: string;
  serverBadgeColor?: string;
}

export interface XtreamSeries {
  num: number | string;
  name: string;
  series_id: number | string;
  cover: string;
  plot?: string;
  cast?: string;
  director?: string;
  genre?: string;
  releaseDate?: string;
  year?: string;
  last_modified?: string;
  rating?: string | number;
  rating_5based?: number;
  backdrop_path?: string[];
  youtube_trailer?: string;
  episode_run_time?: string;
  category_id: string;
  isFavorite?: boolean;
  serverId?: string;
  serverName?: string;
  serverBadgeColor?: string;
}

export interface XtreamEpisode {
  id: string;
  episode_num: number;
  title: string;
  container_extension: string;
  duration?: string;
  rating?: number;
  info?: {
    plot?: string;
    duration_secs?: number;
    duration?: string;
    movie_image?: string;
    releasedate?: string;
    rating?: number;
  };
  custom_sid?: string;
  direct_source?: string;
  video_url?: string;
}

export interface XtreamSeason {
  season_num: number;
  name: string;
  episodes: XtreamEpisode[];
}

export interface XtreamEPGProgramme {
  id: string;
  epg_id?: string;
  title: string;
  lang?: string;
  start: string;
  end: string;
  description: string;
  channel_id: string;
  start_timestamp: number;
  stop_timestamp: number;
}

export type PlaybackTarget = 
  | { type: 'live'; stream: XtreamLiveStream }
  | { type: 'vod'; movie: XtreamVodStream }
  | { type: 'episode'; series: XtreamSeries; seasonNum: number; episode: XtreamEpisode };

export interface MultiViewConfig {
  primary: PlaybackTarget;
  secondary: PlaybackTarget | null;
  activeAudio: 'primary' | 'secondary';
  layout: 'pip_corner' | 'side_by_side';
}

export type UserRole = 'master_admin' | 'standard' | 'kids';

export interface UserPrivileges {
  canAccessLiveTV: boolean;
  canAccessMovies: boolean;
  canAccessSeries: boolean;
  canManageServers: boolean;
  canModifyParentalControls: boolean;
  maxContentRating?: 'all' | 'PG' | 'PG-13' | 'R' | 'NC-17';
  blockedCategories?: string[];
  blockedChannelIds?: string[];
}

export interface UserProfile {
  id: string;
  name: string;
  avatarColor: string;
  avatarIcon: string;
  role: UserRole;
  isKids: boolean;
  privileges: UserPrivileges;
  customPin?: string;
  createdAt: string;
}

export interface ParentalControlsSettings {
  /** @deprecated Legacy plaintext PIN; migrated away by parentalControlService. */
  masterPin?: string;
  masterPinHash?: string;
  masterPinSalt?: string;
  pinConfigured?: boolean;
  hideLockedContentCompletely: boolean;
  lockedCategoryIds: string[];
  lockedChannelIds: string[];
  lockedVodCategoryIds: string[];
  lockedSeriesCategoryIds: string[];
  globalMaxRating?: 'all' | 'PG' | 'PG-13' | 'R' | 'NC-17';
  restrictServerSettings: boolean;
  unlockTimeoutMinutes: number;
}


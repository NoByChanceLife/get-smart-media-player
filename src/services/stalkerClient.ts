/**
 * Get Smart Media Player — Portal / STB Emulation Client (Stalker / Ministra Middleware)
 * Implements real STB MAG emulation protocol without simulated fallbacks or fake channels.
 */

import { StbPortalConfig, XtreamCategory, XtreamLiveStream } from '../types/xtream';

export function generateRandomMac(): string {
  const hex = () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase();
  return `00:1A:79:${hex()}:${hex()}:${hex()}`;
}

export function generateSerialNumber(): string {
  const chars = '0123456789ABCDEF';
  let res = 'D';
  for (let i = 0; i < 12; i++) {
    res += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return res;
}

export function generateDeviceId(): string {
  const hex = (len: number) => {
    let s = '';
    const chars = '0123456789abcdef';
    for (let i = 0; i < len; i++) {
      s += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return s;
  };
  return hex(32);
}

export interface StalkerAuthResult {
  success: boolean;
  token?: string;
  expires?: string;
  message?: string;
  errorStage?: string;
  errorType?: string;
}

/**
 * Normalizes portal URLs to base path (e.g. http://portal.com/c/ or http://portal.com/server/load.php)
 */
export function normalizePortalUrl(raw: string): string {
  let clean = raw.trim();
  if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
    clean = 'http://' + clean;
  }
  return clean.replace(/\/+$/, '');
}

/**
 * Executes a Stalker JSON API request via the backend proxy
 */
export async function executeStalkerApi(
  portalUrl: string,
  params: Record<string, string>,
  mac: string,
  token?: string
): Promise<any> {
  const base = normalizePortalUrl(portalUrl);

  const candidateEndpoints: string[] = [];
  if (base.endsWith('.php')) {
    candidateEndpoints.push(base);
  } else if (base.endsWith('/c')) {
    candidateEndpoints.push(`${base.slice(0, -2)}/server/load.php`);
    candidateEndpoints.push(`${base}/server/load.php`);
    candidateEndpoints.push(`${base.slice(0, -2)}/portal.php`);
  } else {
    candidateEndpoints.push(`${base}/server/load.php`);
    candidateEndpoints.push(`${base}/portal.php`);
    candidateEndpoints.push(`${base}/stalker_portal/server/load.php`);
  }

  let lastError: Error | null = null;
  for (const endpoint of candidateEndpoints) {
    try {
      const queryParts = Object.entries(params).map(
        ([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`
      );
      const targetUrl = `${endpoint}?${queryParts.join('&')}`;

      let proxyUrl = `/api/xtream/proxy?url=${encodeURIComponent(targetUrl)}&mac=${encodeURIComponent(mac)}`;
      if (token) {
        proxyUrl += `&token=${encodeURIComponent(token)}`;
      }

      const response = await fetch(proxyUrl);
      if (!response.ok) {
        let errorDetail = `HTTP ${response.status}`;
        try {
          const errJson = await response.json();
          if (errJson.error) errorDetail = errJson.error;
        } catch {
          // Ignore
        }
        throw new Error(errorDetail);
      }

      const text = await response.text();
      if (text.includes('<!DOCTYPE') || text.includes('<html')) {
        throw new Error('Portal returned HTML webpage instead of Stalker API. Check portal address.');
      }

      return JSON.parse(text);
    } catch (err: unknown) {
      lastError = err as Error;
      // Continue to next endpoint candidate if multiple available
    }
  }

  throw lastError || new Error('Portal request failed.');
}

/**
 * Performs genuine STB handshake and profile authorization against the portal.
 * No simulated fallbacks. Returns precise error on failure.
 */
export async function testStalkerPortal(config: StbPortalConfig): Promise<StalkerAuthResult> {
  const mac = config.macAddress.trim();
  const portalUrl = config.portalUrl.trim();

  if (!mac || !portalUrl) {
    return {
      success: false,
      errorStage: 'Authentication',
      errorType: 'INVALID_CREDENTIALS',
      message: 'Portal URL and MAC Address are required.',
    };
  }

  // Stage 1: Handshake
  let handshakeToken = '';
  try {
    const handshakeData = await executeStalkerApi(
      portalUrl,
      {
        type: 'stb',
        action: 'handshake',
        token: '',
        mac,
      },
      mac
    );

    if (handshakeData && handshakeData.js && handshakeData.js.token) {
      handshakeToken = handshakeData.js.token;
    } else if (typeof handshakeData.token === 'string') {
      handshakeToken = handshakeData.token;
    } else if (handshakeData && handshakeData.error) {
      return {
        success: false,
        errorStage: 'Authentication',
        errorType: 'PORTAL_PROTOCOL_UNSUPPORTED',
        message: `Portal handshake rejected: ${handshakeData.error}`,
      };
    } else {
      return {
        success: false,
        errorStage: 'Authentication',
        errorType: 'PORTAL_PROTOCOL_UNSUPPORTED',
        message: 'Portal returned unexpected handshake response structure (token missing).',
      };
    }
  } catch (err: unknown) {
    const error = err as Error;
    const msg = error.message;
    if (msg.includes('401') || msg.includes('403')) {
      return {
        success: false,
        errorStage: 'Authentication',
        errorType: 'INVALID_CREDENTIALS',
        message: 'Portal access denied (HTTP 401/403). MAC address is not registered or unauthorized.',
      };
    }
    return {
      success: false,
      errorStage: 'Connecting',
      errorType: 'SERVER_UNREACHABLE',
      message: `Failed to contact portal: ${msg}`,
    };
  }

  // Stage 2: Profile verification
  try {
    const profileData = await executeStalkerApi(
      portalUrl,
      {
        type: 'stb',
        action: 'get_profile',
        stb_type: config.stbModel,
        sn: config.serialNumber || generateSerialNumber(),
        device_id: config.deviceId || generateDeviceId(),
        device_id2: config.deviceId || generateDeviceId(),
        signature: config.signature || '',
        mac,
      },
      mac,
      handshakeToken
    );

    if (profileData && profileData.error) {
      return {
        success: false,
        errorStage: 'Account verified',
        errorType: 'PORTAL_PROTOCOL_UNSUPPORTED',
        message: `Portal profile rejected: ${profileData.error}`,
      };
    }

    if (profileData && profileData.js) {
      const js = profileData.js;
      if (js.blocked || js.status === 0 || js.status === '0') {
        return {
          success: false,
          errorStage: 'Account verified',
          errorType: 'ACCOUNT_EXPIRED',
          message: 'Account is deactivated, expired, or blocked on this portal.',
        };
      }
      return {
        success: true,
        token: handshakeToken,
        message: `Portal authenticated successfully for MAC ${mac} (${config.stbModel}).`,
      };
    }

    // If js field was missing or false, profile authorization failed
    return {
      success: false,
      errorStage: 'Account verified',
      errorType: 'INVALID_CREDENTIALS',
      message: 'Portal refused STB profile authorization. MAC address is not authorized for this portal model.',
    };
  } catch (err: unknown) {
    const error = err as Error;
    return {
      success: false,
      errorStage: 'Authentication',
      errorType: 'PORTAL_PROTOCOL_UNSUPPORTED',
      message: `Profile authentication error: ${error.message}`,
    };
  }
}

/**
 * Fetches real categories and channels from an authorized Stalker portal.
 * Throws clean error if portal returns empty list or fails.
 */
export async function fetchStalkerChannels(
  config: StbPortalConfig,
  serverId: string,
  serverName: string,
  badgeColor: string
): Promise<{ categories: XtreamCategory[]; streams: XtreamLiveStream[] }> {
  const mac = config.macAddress.trim();
  const portalUrl = config.portalUrl.trim();
  const token = config.token || '';

  // 1. Fetch Genres / Categories
  const categories: XtreamCategory[] = [
    { category_id: 'all', category_name: '⭐ All Channels', serverId, serverName },
  ];
  const genreIdToName = new Map<string, string>();

  try {
    const genreData = await executeStalkerApi(
      portalUrl,
      { type: 'itv', action: 'get_genres' },
      mac,
      token
    );

    if (genreData && genreData.js && Array.isArray(genreData.js)) {
      genreData.js.forEach((g: any) => {
        const id = String(g.id);
        const name = g.title || g.name || 'General';
        genreIdToName.set(id, name);
        categories.push({
          category_id: `${serverId}_magcat_${id}`,
          category_name: name,
          serverId,
          serverName,
        });
      });
    }
  } catch {
    // Some portals do not support get_genres separately; proceed to get_all_channels
  }

  // 2. Fetch Channels
  const channelData = await executeStalkerApi(
    portalUrl,
    { type: 'itv', action: 'get_all_channels' },
    mac,
    token
  );

  let rawList: any[] = [];
  if (channelData && channelData.js) {
    if (Array.isArray(channelData.js.data)) {
      rawList = channelData.js.data;
    } else if (Array.isArray(channelData.js)) {
      rawList = channelData.js;
    }
  }

  if (!rawList || rawList.length === 0) {
    throw new Error('Portal returned 0 channels. MAC address may not have an active package assigned.');
  }

  const streams: XtreamLiveStream[] = rawList.map((item: any, idx: number) => {
    const genreId = String(item.tv_genre_id || item.genre_id || '0');
    const genreName = genreIdToName.get(genreId) || 'General';
    const catKey = `${serverId}_magcat_${genreId}`;

    if (!genreIdToName.has(genreId) && genreId !== '0') {
      genreIdToName.set(genreId, genreName);
      categories.push({
        category_id: catKey,
        category_name: genreName,
        serverId,
        serverName,
      });
    }

    // cmd can be 'ffmpeg http://...', 'auto /media/...', or a raw URL
    let streamUrl: string | undefined = undefined;
    if (item.cmd) {
      const cleanCmd = String(item.cmd).replace(/^ffmpeg\s+/, '').replace(/^auto\s+/, '');
      if (cleanCmd.startsWith('http://') || cleanCmd.startsWith('https://')) {
        streamUrl = cleanCmd;
      }
    }

    return {
      num: item.number || idx + 1,
      name: item.name || `Channel ${idx + 1}`,
      stream_type: 'live',
      stream_id: `${serverId}_mag_${item.id || idx + 1}`,
      stream_icon: item.logo || '',
      category_id: catKey,
      direct_source: streamUrl,
      custom_sid: item.cmd, // Store original cmd for dynamic link resolution
      tv_archive: item.enable_tv_archive ? 1 : 0,
      currentProgram: `${item.name || 'Channel'} Live Feed`,
      serverId,
      serverName,
      serverBadgeColor: badgeColor,
    };
  });

  return { categories, streams };
}

/**
 * Resolves a playable stream link for a Stalker channel if required by portal middleware
 */
export async function resolveStalkerStreamLink(
  config: StbPortalConfig,
  cmd: string
): Promise<string> {
  const cleanCmd = cmd.replace(/^ffmpeg\s+/, '').replace(/^auto\s+/, '');
  if (cleanCmd.startsWith('http://') || cleanCmd.startsWith('https://')) {
    return cleanCmd;
  }

  const mac = config.macAddress.trim();
  const portalUrl = config.portalUrl.trim();
  const token = config.token || '';

  const linkData = await executeStalkerApi(
    portalUrl,
    {
      type: 'itv',
      action: 'create_link',
      cmd,
    },
    mac,
    token
  );

  if (linkData && linkData.js && linkData.js.cmd) {
    const resolved = String(linkData.js.cmd).replace(/^ffmpeg\s+/, '').replace(/^auto\s+/, '');
    if (resolved.startsWith('http://') || resolved.startsWith('https://')) {
      return resolved;
    }
  }

  throw new Error('Portal failed to generate playable stream link.');
}

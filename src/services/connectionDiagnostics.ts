/**
 * Get Smart Media Player — Real Connection Diagnostics & Verification Engine
 * Runs multi-stage tests on Xtream Codes, Portal/STB, M3U, and Direct Streams
 * before saving, diagnosing exact failure causes without logging or exposing credentials.
 */

import {
  ServerType,
  XtreamCredentials,
  XtreamServerInfo,
  StbPortalConfig,
  M3uConfig,
  SingleStreamConfig,
} from '../types/xtream';
import { xtreamService } from './xtreamClient';
import { testStalkerPortal, fetchStalkerChannels, resolveStalkerStreamLink } from './stalkerClient';
import { parseM3uContent } from './m3uParser';
import { sanitizeErrorMessage } from './sanitizer';

export type DiagnosticStage =
  | 'connecting'
  | 'authenticating'
  | 'account_verified'
  | 'loading_categories'
  | 'loading_streams'
  | 'testing_playback'
  | 'ready';

export type DiagnosticErrorCategory =
  | 'ACCESS_FORBIDDEN'
  | 'INVALID_CREDENTIALS'
  | 'SERVER_UNREACHABLE'
  | 'DNS_FAILURE'
  | 'HTTP_HTTPS_ISSUE'
  | 'REDIRECT_PROBLEM'
  | 'UNSUPPORTED_API_RESPONSE'
  | 'ACCOUNT_EXPIRED'
  | 'PLAYLIST_MALFORMED'
  | 'PORTAL_PROTOCOL_UNSUPPORTED'
  | 'STREAM_ENDPOINT_UNAVAILABLE'
  | 'UNKNOWN_ERROR';

export interface DiagnosticStepResult {
  stage: DiagnosticStage;
  label: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  message?: string;
  details?: string;
  latencyMs?: number;
}

export interface ConnectionDiagnosticReport {
  success: boolean;
  serverType: ServerType;
  failedStage?: DiagnosticStage;
  errorCategory?: DiagnosticErrorCategory;
  summaryMessage: string;
  steps: DiagnosticStepResult[];
  meta?: {
    accountStatus?: string;
    expiryDate?: string;
    maxConnections?: string;
    categoriesCount?: number;
    streamsCount?: number;
    sampleStreamId?: string;
    latencyMs?: number;
    playbackStatus?: 'verified' | 'unverified';
    rawExpiryDate?: string;
    activeConnections?: string;
    isTrial?: string;
    createdAt?: string;
    allowedOutputFormats?: string[];
    serverInfo?: XtreamServerInfo;
  };
}

const DEFAULT_STAGES: Array<{ stage: DiagnosticStage; label: string }> = [
  { stage: 'connecting', label: 'Connecting' },
  { stage: 'authenticating', label: 'Authentication' },
  { stage: 'account_verified', label: 'Account verified' },
  { stage: 'loading_categories', label: 'Loading categories' },
  { stage: 'loading_streams', label: 'Loading streams' },
  { stage: 'testing_playback', label: 'Testing playback endpoint' },
  { stage: 'ready', label: 'Ready' },
];

/**
 * Probes a remote URL via backend proxy probe endpoint using POST body to hide secrets.
 */
async function probeUrl(
  url: string,
  extraOptions?: {
    mac?: string;
    token?: string;
    userAgent?: string;
  }
): Promise<{
  ok: boolean;
  status: number;
  contentType: string;
  latencyMs: number;
  snippet?: string;
  errorType?: string;
  errorMessage?: string;
  responseKind?: string;
  xtreamShape?: boolean;
}> {
  try {
    const res = await fetch('/api/xtream/probe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(extraOptions?.mac ? { 'X-Target-Mac': extraOptions.mac } : {}),
        ...(extraOptions?.token ? { 'X-Target-Token': extraOptions.token } : {}),
      },
      body: JSON.stringify({
        url,
        mac: extraOptions?.mac,
        token: extraOptions?.token,
        user_agent: extraOptions?.userAgent,
      }),
    });

    const data = await res.json();
    return {
      ok: !!data.ok,
      status: data.status || (res.ok ? 200 : res.status),
      contentType: data.contentType || '',
      latencyMs: data.latencyMs || 0,
      snippet: data.snippet,
      errorType: data.errorType,
      errorMessage: sanitizeErrorMessage(data.errorMessage),
      responseKind: data.responseKind,
      xtreamShape: data.xtreamShape,
    };
  } catch (err: unknown) {
    const error = err as Error;
    return {
      ok: false,
      status: 502,
      contentType: '',
      latencyMs: 0,
      errorType: 'SERVER_UNREACHABLE',
      errorMessage: sanitizeErrorMessage(error.message || 'Probe request failed'),
    };
  }
}

/**
 * Validates a media probe response snippet and content-type.
 * Distinguishes genuine HLS manifests (#EXTM3U), MPEG-TS streams, progressive video/audio
 * from HTML error/login/paywall pages or unsupported responses.
 */
function analyzeMediaProbe(probe: {
  ok: boolean;
  status: number;
  contentType: string;
  snippet?: string;
}): { isPlayable: boolean; formatDesc: string; isHtmlReject: boolean } {
  const cType = (probe.contentType || '').toLowerCase();
  const snippet = (probe.snippet || '').trim().toLowerCase();

  // Reject HTML error/login/parking pages
  if (
    cType.includes('text/html') ||
    snippet.startsWith('<!doctype html') ||
    snippet.startsWith('<html') ||
    snippet.includes('<head>')
  ) {
    return { isPlayable: false, formatDesc: 'HTML error/login page', isHtmlReject: true };
  }

  const isHls =
    snippet.startsWith('#extm3u') ||
    cType.includes('mpegurl') ||
    cType.includes('application/x-mpegurl') ||
    cType.includes('application/vnd.apple.mpegurl');

  if (isHls) {
    return { isPlayable: true, formatDesc: 'HLS manifest (#EXTM3U)', isHtmlReject: false };
  }

  const isTs = cType.includes('mp2t') || cType.includes('video/ts');
  if (isTs) {
    return { isPlayable: true, formatDesc: 'MPEG-TS transport stream', isHtmlReject: false };
  }

  const isProgressive =
    cType.includes('video/mp4') ||
    cType.includes('video/webm') ||
    cType.includes('video/mkv') ||
    cType.startsWith('video/') ||
    cType.startsWith('audio/');
  if (isProgressive) {
    return { isPlayable: true, formatDesc: `Progressive media (${cType})`, isHtmlReject: false };
  }

  return { isPlayable: false, formatDesc: cType || 'Unknown format', isHtmlReject: false };
}

/**
 * Diagnostic Runner for Xtream Codes Servers
 */
export async function diagnoseXtreamConnection(
  creds: XtreamCredentials,
  onProgress?: (report: ConnectionDiagnosticReport) => void
): Promise<ConnectionDiagnosticReport> {
  const steps: DiagnosticStepResult[] = DEFAULT_STAGES.map((s) => ({
    stage: s.stage,
    label: s.label,
    status: 'pending',
  }));

  const report: ConnectionDiagnosticReport = {
    success: false,
    serverType: 'xtream',
    summaryMessage: 'Initializing connection diagnostics...',
    steps,
  };

  const updateStep = (
    stage: DiagnosticStage,
    status: DiagnosticStepResult['status'],
    message?: string,
    latencyMs?: number
  ) => {
    const target = steps.find((s) => s.stage === stage);
    if (target) {
      target.status = status;
      if (message) target.message = message;
      if (latencyMs) target.latencyMs = latencyMs;
    }
    onProgress?.({ ...report, steps: [...steps] });
  };

  const fail = (
    stage: DiagnosticStage,
    category: DiagnosticErrorCategory,
    errorMsg: string
  ): ConnectionDiagnosticReport => {
    updateStep(stage, 'failed', errorMsg);
    // Mark remaining as skipped
    const failedIndex = steps.findIndex((s) => s.stage === stage);
    for (let i = failedIndex + 1; i < steps.length; i++) {
      steps[i].status = 'skipped';
    }
    report.success = false;
    report.failedStage = stage;
    report.errorCategory = category;
    report.summaryMessage = errorMsg;
    onProgress?.({ ...report, steps: [...steps] });
    return report;
  };

  if (creds.isDemo) {
    steps.forEach((s) => {
      s.status = 'success';
      s.message = 'Verified via local Get Smart demo suite';
    });
    report.success = true;
    report.summaryMessage = 'Get Smart Demo Server verified and ready.';
    report.meta = {
      accountStatus: 'Active',
      expiryDate: 'Never',
      maxConnections: 'Unlimited',
      categoriesCount: 8,
      streamsCount: 16,
      playbackStatus: 'verified',
    };
    onProgress?.({ ...report, steps: [...steps] });
    return report;
  }

  const base = xtreamService.normalizeUrl(creds.serverUrl);

  // Steps 1-2: Standard Xtream authentication.
  // Known-working Xtream clients authenticate directly against player_api.php.
  // Do not preflight the provider through the generic probe route: the authentication
  // response itself is the authoritative connectivity + protocol test.
  const authUrl = `${base}/player_api.php?username=${encodeURIComponent(creds.username)}&password=${encodeURIComponent(creds.password)}`;

  updateStep('connecting', 'running', 'Contacting Xtream player_api.php...');
  updateStep('authenticating', 'running', 'Validating Xtream account response...');

  const authStartedAt = Date.now();
  let authData: any = null;

  try {
    authData = await xtreamService.fetchViaProxy<any>(authUrl);
  } catch (err: unknown) {
    const error = err as Error;
    const msg = sanitizeErrorMessage(error.message || 'Xtream authentication request failed');

    // Do not collapse HTTP 403 into "bad credentials". A provider can return
    // 403 because of client/network/IP policy before Xtream authentication runs.
    if (/403/.test(msg)) {
      return fail(
        'connecting',
        'ACCESS_FORBIDDEN',
        `Xtream server returned HTTP 403 before account verification. This is an access/client/network rejection, not proof that the username or password is wrong. ${msg}`
      );
    }
    if (/401/.test(msg)) {
      return fail(
        'authenticating',
        'INVALID_CREDENTIALS',
        `Xtream server returned HTTP 401 during authentication. ${msg}`
      );
    }
    if (/html|doctype|non-json|invalid json|json response/i.test(msg)) {
      return fail(
        'connecting',
        'UNSUPPORTED_API_RESPONSE',
        `Xtream player_api.php was reached but did not return Xtream JSON: ${msg}`
      );
    }
    if (/dns|enotfound|getaddrinfo/i.test(msg)) {
      return fail('connecting', 'DNS_FAILURE', `DNS failure while contacting Xtream server: ${msg}`);
    }
    if (/ssl|tls|certificate|protocol/i.test(msg)) {
      return fail('connecting', 'HTTP_HTTPS_ISSUE', `HTTP/HTTPS issue while contacting Xtream server: ${msg}`);
    }
    return fail('connecting', 'SERVER_UNREACHABLE', `Xtream authentication request failed: ${msg}`);
  }

  const authLatencyMs = Date.now() - authStartedAt;
  updateStep('connecting', 'success', `Xtream API reached (${authLatencyMs}ms)`, authLatencyMs);

  if (!authData || !authData.user_info) {
    return fail(
      'authenticating',
      'UNSUPPORTED_API_RESPONSE',
      'Unsupported API response: player_api.php did not return the standard user_info structure.'
    );
  }

  const u = authData.user_info;
  if (u.auth === 0 || u.auth === false || String(u.auth) === '0') {
    return fail('authenticating', 'INVALID_CREDENTIALS', 'Invalid credentials: Authentication refused by Xtream server.');
  }
  updateStep('authenticating', 'success', 'Credentials authenticated successfully');

  // Step 3: Account verified
  updateStep('account_verified', 'running', 'Checking account status, expiration, and connections...');
  if (u.status === 'Disabled') {
    return fail('account_verified', 'ACCOUNT_EXPIRED', 'Account disabled: Provider marked this account as disabled.');
  }
  if (u.status === 'Banned') {
    return fail('account_verified', 'ACCOUNT_EXPIRED', 'Account banned: Access terminated by provider.');
  }
  if (u.status === 'Expired') {
    return fail('account_verified', 'ACCOUNT_EXPIRED', 'Account expired: Subscription period has lapsed.');
  }

  let expiryStr = 'Unlimited';
  if (u.exp_date && u.exp_date !== 'null') {
    const expNum = parseInt(String(u.exp_date), 10);
    if (!isNaN(expNum) && expNum > 0) {
      const nowSec = Math.floor(Date.now() / 1000);
      if (nowSec > expNum) {
        const expDate = new Date(expNum * 1000).toISOString().split('T')[0];
        return fail('account_verified', 'ACCOUNT_EXPIRED', `Account expired on ${expDate}. Please renew with provider.`);
      }
      expiryStr = new Date(expNum * 1000).toISOString().split('T')[0];
    }
  }

  updateStep(
    'account_verified',
    'success',
    `Status: ${u.status || 'Active'} · Expires: ${expiryStr} · Max Lines: ${u.max_connections || '1'}`
  );

  // Step 4: Loading categories
  updateStep('loading_categories', 'running', 'Requesting channel category taxonomy...');
  const catUrl = `${base}/player_api.php?username=${encodeURIComponent(creds.username)}&password=${encodeURIComponent(creds.password)}&action=get_live_categories`;
  let categoriesCount = 0;

  try {
    const cats = await xtreamService.fetchViaProxy<any[]>(catUrl);
    if (Array.isArray(cats)) {
      categoriesCount = cats.length;
    }
  } catch {
    // Non-fatal, fallback to 0
  }
  updateStep('loading_categories', 'success', `Loaded ${categoriesCount} channel categories`);

  // Step 5: Loading streams
  updateStep('loading_streams', 'running', 'Querying live channel line-up...');
  const streamUrl = `${base}/player_api.php?username=${encodeURIComponent(creds.username)}&password=${encodeURIComponent(creds.password)}&action=get_live_streams`;
  let sampleStreamId: string | null = null;
  let streamsCount = 0;

  try {
    const streams = await xtreamService.fetchViaProxy<any[]>(streamUrl);
    if (Array.isArray(streams) && streams.length > 0) {
      streamsCount = streams.length;
      sampleStreamId = String(streams[0].stream_id);
    }
  } catch (err: unknown) {
    const error = err as Error;
    return fail('loading_streams', 'SERVER_UNREACHABLE', `Failed to load stream inventory: ${sanitizeErrorMessage(error.message)}`);
  }

  if (streamsCount === 0) {
    return fail('loading_streams', 'UNSUPPORTED_API_RESPONSE', 'Server returned 0 channels. Account package may have no active channels assigned.');
  }
  updateStep('loading_streams', 'success', `Loaded ${streamsCount} active streams`);

  // Step 6: Testing playback endpoint (truthful lightweight validation)
  updateStep('testing_playback', 'running', 'Testing sample media endpoint responsiveness...');
  let playbackVerified = false;

  if (sampleStreamId) {
    // Test .m3u8 first
    const sampleEndpoint = `${base}/live/${creds.username}/${creds.password}/${sampleStreamId}.m3u8`;
    const m3u8Probe = await probeUrl(sampleEndpoint);
    const m3u8Analysis = analyzeMediaProbe(m3u8Probe);

    if (m3u8Analysis.isPlayable) {
      playbackVerified = true;
      updateStep('testing_playback', 'success', `Playback verified: ${m3u8Analysis.formatDesc} (${m3u8Probe.latencyMs}ms)`);
    } else {
      // A large number of Xtream providers expose live streams as MPEG-TS even
      // when the catalog/auth API itself is fully valid. Always test .ts when
      // HLS is not positively verified rather than only after an HTML response.
      const tsEndpoint = `${base}/live/${creds.username}/${creds.password}/${sampleStreamId}.ts`;
      const tsProbe = await probeUrl(tsEndpoint);
      const tsAnalysis = analyzeMediaProbe(tsProbe);

      if (tsAnalysis.isPlayable) {
        playbackVerified = true;
        updateStep('testing_playback', 'success', `Playback verified: ${tsAnalysis.formatDesc} (${tsProbe.latencyMs}ms)`);
      } else if (m3u8Probe.ok && (m3u8Probe.status === 200 || m3u8Probe.status === 206)) {
        updateStep(
          'testing_playback',
          'success',
          `Playback endpoint reachable but media format was not verified (HTTP ${m3u8Probe.status})`
        );
      } else {
        // Conservative handling: provider/catalog verification is sufficient to
        // save the account; native playback is verified separately on device.
        updateStep('testing_playback', 'success', 'Connection verified; playback not yet verified');
      }
    }
  } else {
    updateStep('testing_playback', 'success', 'Connection verified; playback not yet verified');
  }

  // Step 7: Ready
  updateStep('ready', 'success', 'All verification checks completed.');
  report.success = true;
  report.summaryMessage = playbackVerified
    ? `Connection & playback verified: ${streamsCount} channels available · Expires ${expiryStr}.`
    : `Connection verified; playback not yet verified (${streamsCount} channels active · Expires ${expiryStr}).`;

  report.meta = {
    accountStatus: u.status || 'Active',
    expiryDate: expiryStr,
    maxConnections: String(u.max_connections || '1'),
    categoriesCount,
    streamsCount,
    sampleStreamId: sampleStreamId || undefined,
    playbackStatus: playbackVerified ? 'verified' : 'unverified',
    rawExpiryDate: u.exp_date ? String(u.exp_date) : undefined,
    activeConnections: u.active_cons ? String(u.active_cons) : undefined,
    isTrial: u.is_trial ? String(u.is_trial) : undefined,
    createdAt: u.created_at ? String(u.created_at) : undefined,
    allowedOutputFormats: Array.isArray(u.allowed_output_formats)
      ? u.allowed_output_formats.map((value: unknown) => String(value))
      : undefined,
    serverInfo:
      authData?.server_info && typeof authData.server_info === 'object'
        ? (authData.server_info as XtreamServerInfo)
        : undefined,
  };

  onProgress?.({ ...report, steps: [...steps] });
  return report;
}

/**
 * Diagnostic Runner for Portal / STB Emulation
 * Fixes false positive: Handshake + Channels does NOT equal Playback Verified.
 * Resolves a real channel stream link via create_link and lightweight probes it.
 */
export async function diagnosePortalConnection(
  config: StbPortalConfig,
  onProgress?: (report: ConnectionDiagnosticReport) => void
): Promise<ConnectionDiagnosticReport> {
  const steps: DiagnosticStepResult[] = DEFAULT_STAGES.map((s) => ({
    stage: s.stage,
    label: s.label,
    status: 'pending',
  }));

  const report: ConnectionDiagnosticReport = {
    success: false,
    serverType: 'stalker',
    summaryMessage: 'Initializing portal diagnostics...',
    steps,
  };

  const updateStep = (
    stage: DiagnosticStage,
    status: DiagnosticStepResult['status'],
    message?: string,
    latencyMs?: number
  ) => {
    const target = steps.find((s) => s.stage === stage);
    if (target) {
      target.status = status;
      if (message) target.message = message;
      if (latencyMs) target.latencyMs = latencyMs;
    }
    onProgress?.({ ...report, steps: [...steps] });
  };

  const fail = (
    stage: DiagnosticStage,
    category: DiagnosticErrorCategory,
    errorMsg: string
  ): ConnectionDiagnosticReport => {
    updateStep(stage, 'failed', errorMsg);
    const failedIndex = steps.findIndex((s) => s.stage === stage);
    for (let i = failedIndex + 1; i < steps.length; i++) {
      steps[i].status = 'skipped';
    }
    report.success = false;
    report.failedStage = stage;
    report.errorCategory = category;
    report.summaryMessage = errorMsg;
    onProgress?.({ ...report, steps: [...steps] });
    return report;
  };

  const cleanUrl = config.portalUrl.trim();
  const mac = config.macAddress.trim();

  // Step 1: Connecting
  updateStep('connecting', 'running', 'Verifying portal server host reachability...');
  const probe = await probeUrl(cleanUrl, { mac });
  if (!probe.ok && probe.status !== 401 && probe.status !== 403 && probe.status !== 200) {
    if (probe.errorType === 'DNS_FAILURE') {
      return fail('connecting', 'DNS_FAILURE', 'DNS failure: Portal domain does not resolve.');
    }
    return fail('connecting', 'SERVER_UNREACHABLE', `Portal host unreachable (${probe.errorMessage || 'timeout'}).`);
  }
  updateStep('connecting', 'success', `Portal server reached (${probe.latencyMs}ms)`);

  // Step 2 & 3: Authentication & Account verified (Handshake + Profile)
  updateStep('authenticating', 'running', `Sending MAG ${config.stbModel} handshake for MAC ${mac}...`);
  const authRes = await testStalkerPortal(config);
  if (!authRes.success) {
    const errCat: DiagnosticErrorCategory =
      (authRes.errorType as DiagnosticErrorCategory) || 'INVALID_CREDENTIALS';
    return fail(authRes.errorStage === 'Connecting' ? 'connecting' : 'authenticating', errCat, authRes.message || 'Portal handshake rejected.');
  }
  updateStep('authenticating', 'success', 'Portal handshake accepted');
  updateStep('account_verified', 'success', `MAC ${mac} authorized for ${config.stbModel}`);

  // Step 4 & 5: Loading categories & Streams
  updateStep('loading_categories', 'running', 'Retrieving channel genres...');
  updateStep('loading_streams', 'running', 'Querying portal channel package...');

  let stalkerData: { categories: any[]; streams: any[] };
  try {
    stalkerData = await fetchStalkerChannels(
      { ...config, token: authRes.token },
      'diag',
      'Diagnostic',
      '#06b6d4'
    );

    updateStep('loading_categories', 'success', `Loaded ${stalkerData.categories.length} portal categories`);
    updateStep('loading_streams', 'success', `Loaded ${stalkerData.streams.length} portal channels`);
  } catch (err: unknown) {
    const error = err as Error;
    return fail('loading_streams', 'PORTAL_PROTOCOL_UNSUPPORTED', `Failed to load channels: ${sanitizeErrorMessage(error.message)}`);
  }

  // Step 6: Testing playback endpoint (Real resolution + media probe, no false positives)
  updateStep('testing_playback', 'running', 'Resolving and probing sample portal stream...');
  let playbackVerified = false;

  if (stalkerData.streams.length > 0) {
    const sampleChannel = stalkerData.streams[0];
    let resolvedStreamUrl: string | null = null;

    try {
      if (sampleChannel.direct_source) {
        resolvedStreamUrl = sampleChannel.direct_source;
      } else if (sampleChannel.custom_sid) {
        // Channel requires create_link flow
        resolvedStreamUrl = await resolveStalkerStreamLink(
          { ...config, token: authRes.token },
          sampleChannel.custom_sid
        );
      }

      if (resolvedStreamUrl) {
        // Conduct lightweight probe of resolved stream URL
        const streamProbe = await probeUrl(resolvedStreamUrl, { mac, token: authRes.token });
        const analysis = analyzeMediaProbe(streamProbe);

        if (analysis.isPlayable) {
          playbackVerified = true;
          updateStep('testing_playback', 'success', `Playback verified: ${analysis.formatDesc} (${streamProbe.latencyMs}ms)`);
        } else if (streamProbe.ok && (streamProbe.status === 200 || streamProbe.status === 206)) {
          updateStep(
            'testing_playback',
            'success',
            `Stream endpoint reachable but media format was not verified (${streamProbe.latencyMs}ms)`
          );
        } else {
          // Channels loaded, but playback probe was inconclusive (e.g. restrictive token or unsupported format)
          updateStep('testing_playback', 'success', 'Portal authenticated and channels loaded. Playback endpoint has not yet been verified.');
        }
      } else {
        updateStep('testing_playback', 'success', 'Portal authenticated and channels loaded. Playback endpoint has not yet been verified.');
      }
    } catch {
      // create_link failed or probe failed; do NOT fail the entire account
      updateStep('testing_playback', 'success', 'Portal authenticated and channels loaded. Playback endpoint has not yet been verified.');
    }
  } else {
    updateStep('testing_playback', 'success', 'Portal authenticated; 0 channels to verify.');
  }

  // Step 7: Ready
  updateStep('ready', 'success', 'Portal verification completed.');
  report.success = true;
  report.summaryMessage = playbackVerified
    ? `Portal verified: ${stalkerData.streams.length} channels available for MAC ${mac} (playback confirmed).`
    : `Portal authenticated and channels loaded (${stalkerData.streams.length} channels). Playback endpoint has not yet been verified.`;

  report.meta = {
    accountStatus: 'Authorized',
    categoriesCount: stalkerData.categories.length,
    streamsCount: stalkerData.streams.length,
    playbackStatus: playbackVerified ? 'verified' : 'unverified',
  };

  onProgress?.({ ...report, steps: [...steps] });
  return report;
}

/**
 * Diagnostic Runner for M3U / M3U8 Playlists
 */
export async function diagnoseM3uConnection(
  config: M3uConfig,
  onProgress?: (report: ConnectionDiagnosticReport) => void
): Promise<ConnectionDiagnosticReport> {
  const steps: DiagnosticStepResult[] = DEFAULT_STAGES.map((s) => ({
    stage: s.stage,
    label: s.label,
    status: 'pending',
  }));

  const report: ConnectionDiagnosticReport = {
    success: false,
    serverType: 'm3u',
    summaryMessage: 'Initializing playlist diagnostics...',
    steps,
  };

  const updateStep = (
    stage: DiagnosticStage,
    status: DiagnosticStepResult['status'],
    message?: string,
    latencyMs?: number
  ) => {
    const target = steps.find((s) => s.stage === stage);
    if (target) {
      target.status = status;
      if (message) target.message = message;
      if (latencyMs) target.latencyMs = latencyMs;
    }
    onProgress?.({ ...report, steps: [...steps] });
  };

  const fail = (
    stage: DiagnosticStage,
    category: DiagnosticErrorCategory,
    errorMsg: string
  ): ConnectionDiagnosticReport => {
    updateStep(stage, 'failed', errorMsg);
    const failedIndex = steps.findIndex((s) => s.stage === stage);
    for (let i = failedIndex + 1; i < steps.length; i++) {
      steps[i].status = 'skipped';
    }
    report.success = false;
    report.failedStage = stage;
    report.errorCategory = category;
    report.summaryMessage = errorMsg;
    onProgress?.({ ...report, steps: [...steps] });
    return report;
  };

  let rawContent = config.rawM3uContent || '';

  if (config.playlistUrl) {
    const url = config.playlistUrl.trim();
    updateStep('connecting', 'running', 'Connecting to remote playlist URL...');
    const probe = await probeUrl(url);
    if (!probe.ok && probe.status !== 200) {
      if (probe.errorType === 'DNS_FAILURE') {
        return fail('connecting', 'DNS_FAILURE', 'DNS failure: Playlist host domain does not exist.');
      }
      return fail('connecting', 'SERVER_UNREACHABLE', `Playlist host unreachable (HTTP ${probe.status || 'timeout'}).`);
    }
    updateStep('connecting', 'success', `Playlist server connected (${probe.latencyMs}ms)`);

    updateStep('authenticating', 'running', 'Downloading remote M3U playlist...');
    try {
      const res = await fetch('/api/xtream/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          return fail('authenticating', 'INVALID_CREDENTIALS', 'Playlist URL access denied (HTTP 401/403). Token may be expired.');
        }
        return fail('authenticating', 'SERVER_UNREACHABLE', `Server returned status ${res.status}`);
      }
      rawContent = await res.text();
      updateStep('authenticating', 'success', 'Playlist downloaded successfully');
    } catch (err: unknown) {
      const error = err as Error;
      return fail('authenticating', 'SERVER_UNREACHABLE', `Failed to download playlist: ${sanitizeErrorMessage(error.message)}`);
    }
  } else {
    updateStep('connecting', 'success', 'Pasted raw M3U text loaded');
    updateStep('authenticating', 'success', 'Local playlist verified');
  }

  // Account / Playlist validation
  updateStep('account_verified', 'running', 'Validating playlist structure and format...');
  if (rawContent.includes('<html') || rawContent.includes('<!DOCTYPE')) {
    return fail('account_verified', 'UNSUPPORTED_API_RESPONSE', 'Server returned HTML webpage rather than an M3U playlist.');
  }
  updateStep('account_verified', 'success', 'Valid M3U text format confirmed');

  // Loading categories & Streams
  updateStep('loading_categories', 'running', 'Parsing channel groups and metadata tags...');
  updateStep('loading_streams', 'running', 'Extracting live and VOD stream inventory...');

  try {
    const parsed = parseM3uContent(rawContent, 'diag', 'M3U Test', '#06b6d4');
    const totalStreams = parsed.liveStreams.length + parsed.vodStreams.length;

    updateStep('loading_categories', 'success', `Found ${parsed.categories.length} category groups`);
    updateStep(
      'loading_streams',
      'success',
      `Parsed ${parsed.liveStreams.length} Live channels & ${parsed.vodStreams.length} VOD titles`
    );

    // Testing playback endpoint
    updateStep('testing_playback', 'running', 'Probing sample stream URL accessibility...');
    const sampleStream = parsed.liveStreams[0] || parsed.vodStreams[0];
    let playbackVerified = false;

    if (sampleStream && sampleStream.direct_source) {
      const streamProbe = await probeUrl(sampleStream.direct_source);
      const analysis = analyzeMediaProbe(streamProbe);
      if (analysis.isPlayable) {
        playbackVerified = true;
        updateStep('testing_playback', 'success', `Sample stream verified: ${analysis.formatDesc} (${streamProbe.latencyMs}ms)`);
      } else if (streamProbe.ok && (streamProbe.status === 200 || streamProbe.status === 206)) {
        updateStep(
          'testing_playback',
          'success',
          `Sample stream reachable but media format was not verified (${streamProbe.latencyMs}ms)`
        );
      } else {
        updateStep('testing_playback', 'success', 'Sample URL preserved for client playback (playback not yet verified)');
      }
    } else {
      updateStep('testing_playback', 'success', 'Streams parsed successfully');
    }

    // Ready
    updateStep('ready', 'success', 'Playlist verified and ready to save.');
    report.success = true;
    report.summaryMessage = playbackVerified
      ? `Playlist parsed: ${totalStreams} streams across ${parsed.categories.length} categories; sample playback verified.`
      : `Playlist parsed: ${totalStreams} streams across ${parsed.categories.length} categories; sample playback not yet verified.`;
    report.meta = {
      categoriesCount: parsed.categories.length,
      streamsCount: totalStreams,
      playbackStatus: playbackVerified ? 'verified' : 'unverified',
    };
  } catch (err: unknown) {
    const error = err as Error;
    return fail('loading_streams', 'PLAYLIST_MALFORMED', `Playlist parsing error: ${sanitizeErrorMessage(error.message)}`);
  }

  onProgress?.({ ...report, steps: [...steps] });
  return report;
}

/**
 * Diagnostic Runner for Direct Stream Lines
 */
export async function diagnoseDirectStreamConnection(
  config: SingleStreamConfig,
  onProgress?: (report: ConnectionDiagnosticReport) => void
): Promise<ConnectionDiagnosticReport> {
  const steps: DiagnosticStepResult[] = DEFAULT_STAGES.map((s) => ({
    stage: s.stage,
    label: s.label,
    status: 'pending',
  }));

  const report: ConnectionDiagnosticReport = {
    success: false,
    serverType: 'single_stream',
    summaryMessage: 'Initializing stream diagnostics...',
    steps,
  };

  const updateStep = (
    stage: DiagnosticStage,
    status: DiagnosticStepResult['status'],
    message?: string,
    latencyMs?: number
  ) => {
    const target = steps.find((s) => s.stage === stage);
    if (target) {
      target.status = status;
      if (message) target.message = message;
      if (latencyMs) target.latencyMs = latencyMs;
    }
    onProgress?.({ ...report, steps: [...steps] });
  };

  const fail = (
    stage: DiagnosticStage,
    category: DiagnosticErrorCategory,
    errorMsg: string
  ): ConnectionDiagnosticReport => {
    updateStep(stage, 'failed', errorMsg);
    const failedIndex = steps.findIndex((s) => s.stage === stage);
    for (let i = failedIndex + 1; i < steps.length; i++) {
      steps[i].status = 'skipped';
    }
    report.success = false;
    report.failedStage = stage;
    report.errorCategory = category;
    report.summaryMessage = errorMsg;
    onProgress?.({ ...report, steps: [...steps] });
    return report;
  };

  const url = config.streamUrl.trim();

  // Step 1: Connecting
  updateStep('connecting', 'running', 'Checking media server host connection...');
  const probe = await probeUrl(url);
  if (!probe.ok && probe.status !== 200 && probe.status !== 206) {
    if (probe.errorType === 'DNS_FAILURE') {
      return fail('connecting', 'DNS_FAILURE', 'DNS failure: Stream domain does not exist.');
    }
    return fail('connecting', 'SERVER_UNREACHABLE', `Stream host unreachable (${probe.errorMessage || 'timeout'}).`);
  }
  updateStep('connecting', 'success', `Stream server reached (${probe.latencyMs}ms)`);

  // Step 2 & 3: Authentication & Account
  updateStep('authenticating', 'running', 'Verifying stream URL authorization...');
  if (probe.status === 401 || probe.status === 403) {
    return fail('authenticating', 'INVALID_CREDENTIALS', 'Access denied (HTTP 401/403). Stream link may be token-protected or expired.');
  }
  updateStep('authenticating', 'success', 'Stream link accessible');
  updateStep('account_verified', 'success', 'Direct feed active');

  // Step 4 & 5: Loading Categories & Streams
  updateStep('loading_categories', 'success', `Category: ${config.category || 'Direct Streams'}`);
  updateStep('loading_streams', 'success', `Channel: ${config.name}`);

  // Step 6: Testing playback endpoint
  updateStep('testing_playback', 'running', 'Inspecting media container compatibility and manifest...');
  const analysis = analyzeMediaProbe(probe);

  if (analysis.isHtmlReject) {
    return fail(
      'testing_playback',
      'UNSUPPORTED_API_RESPONSE',
      'Stream URL returned an HTML webpage rather than a playable media stream, HLS manifest, or container.'
    );
  }

  if (analysis.isPlayable) {
    updateStep('testing_playback', 'success', `Verified ${analysis.formatDesc}`);
  } else if (probe.status === 200 || probe.status === 206) {
    updateStep(
      'testing_playback',
      'success',
      `Endpoint reachable, but playable media format was not verified (HTTP ${probe.status}, Content-Type: ${probe.contentType || 'unknown'})`
    );
  } else {
    return fail('testing_playback', 'STREAM_ENDPOINT_UNAVAILABLE', `Media server returned unexpected status HTTP ${probe.status}.`);
  }

  // Step 7: Ready
  updateStep(
    'ready',
    'success',
    analysis.isPlayable ? 'Direct stream line verified.' : 'Direct stream endpoint reachable; playback format remains unverified.'
  );
  report.success = true;
  report.summaryMessage = analysis.isPlayable
    ? `Direct stream line "${config.name}" verified and ready.`
    : `Direct stream line "${config.name}" is reachable, but playback format is not yet verified.`;
  report.meta = {
    streamsCount: 1,
    latencyMs: probe.latencyMs,
    playbackStatus: analysis.isPlayable ? 'verified' : 'unverified',
  };

  onProgress?.({ ...report, steps: [...steps] });
  return report;
}

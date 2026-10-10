# Get Smart Media Player — Xtream / Reference App Compatibility Audit
Date: 2026-10-10
Status: Technical audit before provider-compatibility remediation
Reference artifact reviewed: 2.1_MegaplusXC_v4.0.3
Reference package observed: com.nathnetwork.xcmegatv
Reference implementation family observed in class/resource names: XCIPTV-derived Android application

## Scope

This audit compares the current Get Smart Media Player architecture with the supplied working Android IPTV application for the specific purpose of understanding why a real Xtream Codes account can work in the reference application while failing or remaining unusable in Get Smart.

No proprietary source from the reference application is copied into Get Smart. Findings are architecture/interoperability observations derived from package metadata, resource names, class/string indicators, native library inventory, and the current Get Smart codebase.

## Executive finding

Get Smart's UI/navigation foundation is now strong, but the Android provider/playback architecture is still only partially native.

The supplied working application is an Android-native IPTV stack with:
- native HTTP networking (OkHttp indicators),
- local SQLite catalog persistence,
- background catalog/EPG update jobs,
- native ExoPlayer playback,
- LibVLC playback fallback,
- bundled FFmpeg/native codec libraries,
- HLS/MPEG-TS/DASH handling indicators,
- XMLTV EPG parsing/storage,
- per-content player-selection settings.

Get Smart currently uses:
- native Android transport only for JSON provider API calls,
- a 2 MB native JSON response ceiling,
- React/WebView catalog state,
- browser Hls.js / HTML video playback,
- web-only /api stream-ticket and /api stream proxy URLs for most provider playback,
- all major catalog types loaded concurrently after profile changes,
- hard-coded live HLS preference in player URL construction.

The most important conclusion is that Get Smart has crossed the native boundary for authentication/catalog networking, but has not crossed it for large-catalog ingestion and media playback. Those are the two largest compatibility gaps.

---

# Reference application findings

## Native IPTV networking

The supplied app includes OkHttp networking classes and Gson JSON parsing indicators. Xtream endpoint strings include:
- player_api.php?username=
- action=get_live_categories
- action=get_live_streams
- action=get_vod_categories
- action=get_vod_streams
- action=get_series_categories
- action=get_series
- action=get_series_info&series_id=
- xmltv.php?username=
- /live/
- /movie/
- /series/

This is consistent with a direct device-to-provider Xtream implementation rather than routing provider calls through a separate web backend.

## Native playback stack

The package includes:
- ExoPlayer 2.11.7 indicators,
- HlsMediaSource,
- DashMediaSource,
- SmoothStreamingMediaSource,
- MPEG-TS indicators,
- LibVLC classes and JNI libraries,
- FFmpeg native libraries,
- hardware/software decoder utilities.

It also exposes content-specific player preference keys:
- whichplayer_tv
- whichplayer_vod
- whichplayer_series
- whichplayer_catchup

This means the reference player is not relying on one browser media path for every provider.

## Large catalog persistence

The supplied app contains SQLite table definitions for:
- live channel categories,
- live streams,
- VOD categories,
- VOD items,
- series categories,
- series,
- episodes,
- EPG channels,
- EPG programmes,
- favorites,
- watch/resume data,
- parental categories,
- program reminders.

The package also contains dedicated update components/jobs such as:
- XCUpdateContents
- M3UUpdateContents
- EPG/background update services

Strings indicate categories/streams/series are downloaded and written to a local database before normal browsing.

This is materially different from Get Smart's current all-in-memory catalog model.

## EPG architecture

The reference application contains:
- XMLTV parser indicators,
- EPG channel/program database tables,
- dedicated EPG update jobs,
- separate EPG layouts/items,
- time/category EPG layout resources,
- program reminder/catch-up integration.

This architecture supports a real timeline grid rather than only three equal columns labeled Now/Next/Later.

## Device model

The reference manifest identifies Android TV/Leanback launcher support and touch support. The UI/resources are native Android/Leanback rather than a browser-first responsive shell.

---

# Get Smart current strengths

The current Get Smart architecture already has several advantages that should be retained:

- persistent logical playback-session architecture,
- clean provider transport boundary,
- native Android JSON transport foundation,
- multi-source aggregation design,
- virtualized Live TV row rendering,
- strong D-pad navigation chain,
- touch/mouse/keyboard support,
- direct_source support in the data model,
- output-format field already modeled in XtreamUserInfo,
- dynamic viewport scaling system,
- safe URL normalization,
- provider credential redaction discipline,
- server-side browser/PWA proxy path for web builds,
- stable pre-reskin and pre-provider-fix branches.

The correct remediation is not to replace the app architecture with the reference app. It is to finish the native compatibility layers underneath the Get Smart UX.

---

# Critical compatibility gaps

## P0 — Native Xtream JSON response ceiling is too low

File:
native/android/GetSmartProviderPlugin.java

Current:
MAX_RESPONSE_BYTES = 2 * 1024 * 1024

A real Xtream account with thousands of channels can return get_live_streams JSON larger than 2 MB. VOD and series catalogs can be much larger.

The connection diagnostic itself requests the complete live stream inventory. A valid provider can therefore authenticate correctly but still fail validation because the catalog response crosses the 2 MB bridge limit.

Required:
- raise the temporary ceiling substantially,
- then move toward native catalog persistence/streaming parsing rather than indefinitely moving giant JSON documents through the Capacitor bridge.

## P0 — Packaged Android playback still depends on web-backend stream routes

Files:
- src/services/xtreamClient.ts
- src/components/VideoPlayer.tsx
- src/components/FloatingPiPPlayer.tsx

Current provider playback commonly becomes:
- /api/xtream/stream?url=...
- POST /api/xtream/stream-ticket
- /api/xtream/stream/<ticket>

Those routes are implemented by server.ts for browser/server deployment.

The installed Capacitor Android app does not run that Express backend at the local app origin. Provider JSON calls have a native replacement, but stream-ticket/media proxy calls do not.

Therefore a real account can load catalog data yet still fail at playback preparation in the packaged Android app.

Required:
- native Android playback path must not require the web stream-ticket routes,
- browser/PWA can continue using the secure proxy/ticket path.

## P0 — Android playback engine is still WebView HTML video/Hls.js

Current:
- Hls.js for HLS
- HTML <video> for other media

The working reference app uses native ExoPlayer and LibVLC/FFmpeg paths.

Many Xtream live channels use MPEG-TS, non-browser-friendly codecs, provider-specific redirects, or responses without browser CORS headers. These can work in native Android players while failing in Hls.js/WebView.

Required:
- native Android media adapter, preferably Media3/ExoPlayer as primary,
- secondary fallback strategy for difficult streams later if needed,
- maintain current web player for desktop/PWA.

## P0 — Startup/profile refresh loads too much catalog data at once

File:
src/App.tsx

Current loadData requests concurrently:
- live categories
- all live streams
- VOD categories
- all VOD streams
- series categories
- all series

For a large commercial provider this can mean multiple large JSON payloads at once immediately after a profile is added.

Required:
- load Live TV first,
- lazy-load Movies/Series when needed,
- background-warm additional catalogs sequentially,
- persist last-known-good catalog.

## P1 — Real profile save discards provider output-format/server information

Files:
- src/components/ServerSettingsModal.tsx
- src/types/xtream.ts

XtreamUserInfo already models allowed_output_formats.
SavedProfile already models userInfo and serverInfo.

However the current real-account save path fabricates a reduced userInfo object from diagnostic metadata and does not preserve:
- allowed_output_formats
- full server_info

Required:
- preserve sanitized authentication metadata,
- use allowed output formats when resolving live playback,
- retain server protocol/port/timezone information.

## P1 — Live playback is hard-coded toward .m3u8

Files:
- src/components/VideoPlayer.tsx
- src/services/xtreamClient.ts

Current live URL construction defaults to m3u8.

The reference application contains both HLS and MPEG-TS handling and native player options.

Required:
- resolve provider-supported output type from account data,
- try m3u8 when supported/appropriate,
- support ts as first-class live output,
- native player should decide transport from evidence rather than forcing every live channel into HLS.

## P1 — No native persistent catalog/database layer

Get Smart currently keeps catalog collections in React memory and profile/history data in localStorage.

The reference app writes large channel/VOD/series/EPG catalogs into SQLite and updates them separately.

Required:
- introduce a catalog repository/cache boundary,
- Android implementation should persist large catalogs natively,
- UI should query/paginate/filter local data rather than repeatedly transporting entire provider catalogs through JS.

## P1 — EPG is functionally correct but not yet a true timeline guide

Current LiveTVView presents equal Now / Next / Later cells.

The concept boards and reference architecture imply:
- time axis,
- program widths based on actual start/stop duration,
- current-time indicator,
- horizontal guide movement,
- sticky channel column,
- locally cached EPG.

Required:
- replace equal program columns with a timeline coordinate model,
- keep current virtualization and D-pad zoning.

---

# UI shell audit — TopBar + rail

The user's concern is valid: on TV/desktop, the TopBar now duplicates actions already reachable in the persistent left rail.

Duplicated concepts include:
- active section title,
- search,
- profile,
- performance,
- parental/settings,
- connections/source status.

The concept boards do not spend a full global horizontal row on duplicated utilities.

Recommended shell:
- TV/Desktop: remove the persistent global TopBar.
- Keep the left Get Smart rail as global navigation.
- Give each screen a compact contextual header inside its content surface only when needed.
- Live TV should use the reclaimed vertical space for the preview/timeline guide.
- Mobile/tablet can keep a compact top header/overflow because the rail behavior changes with available width.
- server/source switching should move into a contextual source control, not a permanent duplicated utility bar.

This change should improve both visual cleanliness and EPG density.

---

# Why the guide still does not look as clean as the concepts

The current colors/radii are closer, but the geometry is still structurally different.

Missing elements:

1. True time-axis EPG instead of equal Now/Next/Later columns.
2. Program widths proportional to duration.
3. A visible current-time line that crosses the guide.
4. More precise channel-logo/number alignment.
5. Fewer persistent chrome rows above the guide.
6. Removal of the redundant desktop/TV TopBar.
7. Smaller row height once the time grid is implemented.
8. Program focus state that outlines one schedule block rather than tinting a broad equal column.
9. Better preview hierarchy: selected program artwork/details should feel connected to the highlighted EPG block.
10. Horizontal time scrolling independent of vertical channel scrolling.
11. Cached EPG so the guide feels immediate rather than progressively filling while browsing.

The visual gap is therefore not mainly color anymore. It is EPG information architecture.

---

# Recommended implementation order

## Phase A — Make real Xtream accounts load reliably
1. Increase Android provider response ceiling as an immediate compatibility patch.
2. Preserve allowed_output_formats and server_info.
3. Stop loading Live/VOD/Series full catalogs concurrently.
4. improve transient provider retry/error detail.
5. validate the user's authorized real account again.

## Phase B — Native Android playback
1. Add Android native player adapter.
2. Media3/ExoPlayer primary.
3. Direct provider URL resolved at native playback boundary.
4. support HLS and MPEG-TS explicitly.
5. preserve Get Smart playback-session identity.
6. browser/PWA continues using existing Hls.js/ticket proxy.
7. add fallback engine only if real-device testing demonstrates need.

## Phase C — Catalog persistence
1. local catalog repository interface.
2. Android native SQLite persistence.
3. incremental refresh / last-known-good data.
4. category-first/lazy catalog loading.
5. EPG persistence.

## Phase D — TV shell + guide
1. remove redundant TV/Desktop TopBar.
2. keep one global rail.
3. build true time-axis EPG.
4. current-time indicator.
5. duration-based program cells.
6. compact contextual preview.
7. preserve D-pad chain and virtualization.

## Phase E — Additional parity only if desired
Reference app also contains:
- catch-up,
- recording,
- program reminders,
- radio,
- VPN integration,
- multi-screen,
- selectable playback engines.

These are not required to solve the current Xtream connection/playback failure and should not distract from P0/P1 work.

---

# Freeze rule

Do not disturb the known-good interaction baseline while provider compatibility is repaired.

Protected:
- main navigation behavior,
- D-pad escape chain,
- touch/mouse support,
- virtualized Live TV channel list,
- persistent logical playback session,
- stable-pre-reskin-2026-10-10 branch.

Compatibility changes should occur below those UX contracts wherever possible.


---

# Follow-up from real-device timeout

Observed real-device result after the first compatibility pass:

- Xtream authentication failed at the network stage with: Provider connection timed out.
- Because this occurs before an HTTP status or user_info response, the failure is below Xtream credential validation.

Additional reference-app evidence:
- The supplied working application contains the literal user agent/version string okhttp/3.12.11.
- Its networking stack includes OkHttp connection/DNS/retry infrastructure rather than a raw one-request HttpURLConnection wrapper.

Remediation applied:
- Replaced GetSmartProviderPlugin's HttpURLConnection request engine with a shared OkHttpClient.
- Matched the reference-compatible OkHttp 3.12.11 library family.
- Increased native connect timeout to 25 seconds and read timeout to 45 seconds.
- Enabled retryOnConnectionFailure.
- Preserved manual redirect validation.
- Preserved credential-safe errors.
- Added MAC/cookie/Bearer headers to the native bridge for portal compatibility.
- scripts/sync-android.mjs now injects com.squareup.okhttp3:okhttp:3.12.11 into the generated Android app dependencies.
- This change requires a fresh android:prepare / native rebuild; a web-only refresh cannot test it.

---

# Corrected login transport finding — direct DEX trace

A deeper method-level trace of the supplied working APK corrected an earlier inference.

The APK bundles OkHttp, but its actual Xtream login and catalog WebServicesAdapter does **not** use OkHttp. The player_api.php call path is:

- LoginActivity$l.doInBackground
- constructs base + /player_api.php?username= + username + &password= + password
- calls c/f/a/h4/e.a(...) (the app's WebServicesAdapter)
- that method uses Android HttpURLConnection
- request method: GET
- request header: User-Agent
- User-Agent value resolves from Config.h to MEGAPLUSTV-v4.0.3
- read timeout: 35000 ms
- connect timeout: 40000 ms
- calls connect(), then getInputStream(), then reads the response line-by-line
- no extra public-host DNS filtering is present in this Xtream adapter
- no custom redirect loop is present in this Xtream adapter; normal URLConnection behavior applies

The same adapter is reused by the live-category and live-stream update jobs.

Remediation on Get Smart:
- removed the OkHttp-specific Xtream bridge implementation
- restored native HttpURLConnection
- matched 40s connect / 35s read timeouts
- matched the working app's Xtream User-Agent for interoperability testing
- removed extra native public/private DNS filtering that the working app does not perform
- removed manual redirect handling and extra Accept/Connection headers
- removed the no-longer-needed OkHttp Gradle injection
- retained credential-safe error messages and encrypted credential-draft storage

This is now a protocol-parity change based on the working APK's actual Xtream request path rather than a library-presence inference.

---

# Root-cause lead: branded XCIPTV hides the actual Xtream portal

Direct DEX tracing of the supplied MegaPlus/XCIPTV APK shows the branded app does not necessarily authenticate against a server URL typed by the user.

Evidence from the APK:
- `Config.b` is initialized to `no` and has no later assignment in this build.
- `LoginActivity$f.onClick` only reads the server URL EditText into its Xtream base URL when that config flag enables user-entered portals.
- With the branded configuration used by this APK, login instead selects stored `portal`, `portal2`, `portal3`, etc. values / panel records.
- `SplashActivity` contacts the branded control-plane URL `http://isdp.xyz/panel/megaplustv3/api/`.
- Its license/config response contains panel fields including `portal`, `portal2`, `portal3`, `portal4`, `portal5`; those portal values are decrypted and persisted locally.
- `LoginActivity$l.doInBackground` then constructs the actual Xtream request as `<selected hidden portal>/player_api.php?username=<user>&password=<pass>`.
- Immediately before the request, the working app logs the constructed URL under the `XCIPTV_TAG` tag.

Implication:
The MegaPlus credentials can work in MegaPlus while a manually supplied URL times out in Get Smart if that manually supplied host/port is not the hidden portal MegaPlus actually selected. Before changing networking again, compare Get Smart's target origin with the sanitized host:port from MegaPlus's own `XCIPTV_TAG` login log.

Secondary finding:
The APK also bundles OpenVPN and supports an `ovpn_auto` preference plus remotely supplied `ovpn_url`. This can alter routing when explicitly enabled. Static analysis does not establish that auto-VPN is enabled on the user's installation, so it remains a secondary check rather than the primary diagnosis.

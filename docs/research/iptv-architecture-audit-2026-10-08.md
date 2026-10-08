# IPTV Architecture Research Register — 2026-10-08

Purpose: preserve useful findings from external IPTV-player repositories before Get Smart's real Xtream validation. This is a research/provenance document, not imported third-party source code.

## Non-negotiable Get Smart behavior

- Playback is a persistent session. Browsing/navigation must not stop the selected stream.
- Escape and Backspace are browser-development equivalents of TV Back.
- Back from fullscreen playback reveals browsing/guide while playback continues.
- Backing out of the browsing shell returns the active stream to fullscreen.
- Only explicit Stop/Close, selecting replacement content, unrecoverable playback failure, or application termination ends playback.
- Playback identity is content/source identity, not a temporary URL or token.
- Provider/source failures must not take down the application.
- Get Smart is a player only and supplies no programming.

## Repository audit

### IPTVnator — 4gray/iptvnator
License observed: MIT. Trademark is separate; do not reuse name/logo.
Reviewed default-branch commit: 6c8f5028c71cd5adbf7d596bfdab5dacb670d97b.

High-value references:
- docs/architecture/embedded-inline-playback.md (blob sha 8f98857af9ea8a2c4e31bb755f278dff31ef18f5)
- libs/portal/xtream/data-access/src/lib/services/xtream-url.service.ts
- libs/portal/xtream/feature/src/lib/live-stream-layout/live-stream-layout.component.ts
- libs/portal/xtream/feature/src/lib/live-stream-layout/xtream-live-channel-navigation.service.spec.ts

Useful concepts to adapt independently:
1. Keep live playback hosted/mounted while navigation state changes.
2. Give a playback session a stable logical identity independent of temporary stream URLs/tokens.
3. Reject stale async playback-resolution results when the selected owner/content has changed.
4. Channel/category/tab switching should not implicitly stop playback.
5. Separate playback resolution from player presentation.
6. Browser-player failures should expose recovery actions without silently changing the user's saved player choice.
7. Reusing one player instance for channel changes can improve zapping speed and avoid unnecessary teardown.

Get Smart plan impact:
- Introduce app-level PlaybackSession/PlaybackController above route/tab views.
- Player engine remains mounted while app chrome/browse surfaces open over/alongside it.
- Navigation changes presentation mode (fullscreen/background/PiP), not playback ownership.
- Stable session key: source/profile ID + content kind + provider content ID. Never credentials or resolved URL.
- Generation/request guards for asynchronous stream resolution.

### OpenTV — opentvproject/opentv
License observed: GPL-3.0-or-later.
Reviewed default-branch commit: 43b95c05d8f6a042f51c0cff662ef80789ee7528.

High-value references:
- app/src/main/java/app/opentv/data/remote/XtreamApi.kt
- app/src/main/java/app/opentv/ui/channels/GuidePreview.kt
- README / architecture behavior around Media3 live playback, guide persistence, DVR and TV devices.

Policy:
- REFERENCE ONLY for proprietary Get Smart unless a deliberate GPL licensing decision is made.
- Do not copy GPL implementation into Get Smart.

Useful concepts:
1. Android TV/Fire TV must be treated as first-class remote environments.
2. Media3/ExoPlayer is an important native-device playback reference for later Android packaging.
3. Xtream data acquisition should be a dedicated provider layer, not mixed into UI.
4. Guide data should survive refresh/restart and refresh incrementally/non-destructively.
5. Provider content and app navigation are separate concerns.

Get Smart plan impact:
- Keep current web/PWA engine for development, but retain a native Android playback-adapter boundary in architecture.
- Do not couple Xtream API parsing to React views.
- EPG refresh must preserve last-known-good guide data.

### StreamVault — Davidona/StreamVault-IPTV
License observed: custom Source-Available Non-Commercial license.
Reviewed default-branch commit: c5e75a535a8e80d33101b1a7335da286f23f28e1.
License blob sha: 6c5a61556dd6a6c98aceaa52dbf12e88fdb3eadc.

High-value references:
- data/src/main/java/com/streamvault/data/remote/xtream/XtreamUrlFactory.kt
- tools/catalog_xtream_fixture.py
- docs/CHANGELOG.md
- player/ architecture generally.

Policy:
- REFERENCE ONLY. Do not copy code into commercial Get Smart without explicit commercial permission/license review.

Useful concepts:
1. Centralize Xtream URL construction.
2. Encode username/password/stream IDs correctly as URL components.
3. Default live playback extension may differ from VOD/series; do not assume every live source is HLS.
4. Represent provider playback internally without persisting credential-bearing URLs.
5. Redact credentials from logs.
6. Deterministic local Xtream fixtures are valuable before/alongside real-provider tests.
7. Per-provider request profiles/User-Agent behavior can matter.

Get Smart plan impact:
- Replace scattered Xtream URL assumptions with a single XtreamPlaybackResolver.
- Internal PlaybackTarget stores provider/content IDs; credentialed URL is resolved only at playback boundary.
- Never put provider credentials in logs/history/session identity.
- Build a local deterministic Xtream fixture/test harness.
- Test both .ts and .m3u8 live output behavior.

### StreamVault — cowpooo-source/StreamVault
License observed by repository: PolyForm Noncommercial 1.0.0.
Reference only for commercial Get Smart.
Useful architectural similarity: React 19 + Vite 8 + HLS.js + native video + Express proxy, which makes it useful for conceptual comparison with our current stack.
Do not copy source without compatible commercial permission.

## Xtream validation plan

Phase X1 — Provider model
- Source profile: server URL, username, password, optional user agent, enabled state.
- Normalize server URL once.
- Verify account through player_api.php.
- Parse authentication/status/expiry/allowed-output information conservatively.
- No credentials in browser-visible logs or persisted playback URLs.

Phase X2 — Catalog
- get_live_categories / get_live_streams
- get_vod_categories / get_vod_streams
- get_series_categories / get_series
- short EPG and XMLTV/EPG support separately
- Provider categories remain provider-owned; Get Smart overlays favorites/custom organization.

Phase X3 — Playback resolution
- Prefer valid direct_source when provider supplies one.
- Otherwise construct provider playback at playback time.
- Live: test provider-supported output/container instead of hard-coding m3u8.
- VOD/series: honor container_extension.
- Resolve into a transport object: URL + type hint + headers/profile + source identity.
- Player chooses HLS.js/native/direct path from evidence, not guessed metadata.

Phase X4 — Persistent playback
- App-level PlaybackSession survives navigation.
- Modes: fullscreen, browsing/background, floating/PiP where supported.
- Back/Escape/Backspace transitions fullscreen -> browsing without stop.
- Back from root browsing with active session -> fullscreen.
- Explicit Stop ends session.
- Selecting another item replaces session after user action.
- Preserve VOD/episode position.

Phase X5 — Error/recovery
- Same-stream retry may be automatic and bounded.
- Never silently change source/version/content.
- Keep controls/navigation available on failure.
- Show useful diagnostics only when repeated/persistent.
- Preserve last-known-good catalog/EPG.

Phase X6 — Test matrix
- Public direct MP4 control.
- Public direct HLS control (Apple currently proven working).
- Public broadcaster HLS fixtures: source-specific failures do not define player failure.
- Local deterministic Xtream fixture.
- Real authorized Xtream account entered only in app UI, never chat.
- Browser standalone runtime.
- Android TV/Fire TV later as authoritative remote/device validation.

## Immediate implementation order

1. Build persistent PlaybackSession architecture before real-provider UX is considered complete.
2. Add Backspace as Back alongside Escape in browser development.
3. Fix root Back behavior: active playback returns fullscreen.
4. Keep current proven Apple direct-HLS fixture.
5. Build/refactor centralized Xtream provider + playback resolver.
6. Connect user's authorized Xtream account through app UI.
7. Validate account -> catalog -> one live channel -> channel switching -> EPG -> VOD -> series.
8. Only after working real-provider behavior, refine visual polish and remove temporary diagnostics/fixtures.

## Provenance rule

No third-party source code is imported merely because it appears in this research register. Before any exact code is reused, record repository, commit, exact file, license, copied/modified portion, Get Smart destination, required notices, and dependencies in the Third Party Audit. GPL and non-commercial sources remain reference-only unless licensing strategy changes.

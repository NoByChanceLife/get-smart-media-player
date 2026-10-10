# HS16 Native Player Runtime Validation — 2026-10-10

## Purpose

HS16 is a runtime-hardening build. Do not add another playback engine or expand player features until this gate is complete.

Expected Android identity:

- transport marker: `GS-NATIVE-XCIPTV-HS16`
- versionCode: `2026101016`
- versionName: `2026.10.10-hs16`

Safety branch before this pass:

- `pre-runtime-hardening-hs16-2026-10-10`

## Build and install

Use the direct ADB workflow rather than Android Studio Run:

```bat
cd /d "C:\Users\Not By Chance\get-smart-media-player"
git pull origin main
npm.cmd run android:prepare
cd android
gradlew.bat clean assembleDebug
"%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe" install -r app\build\outputs\apk\debug\app-debug.apk
```

Verify the installed package before testing:

```bat
"%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe" shell dumpsys package com.getsmartmedia.player | findstr /i "versionCode versionName"
```

Expected:

```text
versionCode=2026101016
versionName=2026.10.10-hs16
```

## Gate 1 — known-good live channel

Use the already configured provider/account and the same live channel that previously opened successfully through the Android external player in HS7.

Pass requires all of the following:

- Get Smart remains the foreground app.
- No Android "Open with" chooser appears.
- No separate player Activity launches.
- Video renders inside the Get Smart player surface.
- Audio plays.
- Back/Guide returns to Get Smart browsing without destroying the playback session.
- Stop releases playback.

If the stream does not open, stop the test here and capture the targeted logs below before changing code.

## Gate 2 — native Get Smart OSD

While the known-good channel is playing:

- OK/tap reveals Get Smart OSD.
- OSD shows channel number/name and current/next EPG when available.
- Play/Pause works.
- Mute, Vol − and Vol + work.
- Fit/Fill/Zoom changes rendering without restarting the stream.
- OSD auto-hides and does not trap D-pad focus.
- Stream Health opens and closes.

## Gate 3 — channel surfing

Validate against the currently selected surfing list:

- Channel Up / Down.
- D-pad Up / Down with OSD hidden.
- Last Channel.
- Numeric channel entry.
- Rapid repeated channel changes.

Pass requires no external Activity, no duplicate player surface, no stuck audio from the previous channel, and no player-instance leak visible to the user.

## Gate 4 — tracks and quality

On media that actually exposes the capability:

- Audio menu lists only real Media3 audio tracks.
- CC menu enables only when text tracks exist.
- Temporary Audio/CC selection does not rewrite saved preferences.
- Quality menu appears only when multiple supported video tracks exist.
- Saved Auto/1080p/720p/480p/Lowest preference constrains Media3 without fabricating unavailable quality choices.

## Gate 5 — VOD / series

Open one known playable VOD item:

- Play/Pause.
- −10s / +10s seek.
- progress position/duration.
- Fit/Fill/Zoom.
- Audio/CC when present.
- Stop and return.

## Gate 6 — resilience

After ordinary playback succeeds, test controlled interruption:

- temporary network loss and reconnect;
- one source failure/retry case if safely reproducible.

Expected recovery order:

1. bounded Media3 retry;
2. re-resolve the same selected media URL through the provider layer;
3. rebuild Media3 for that same item;
4. show a sanitized final error if recovery is exhausted.

Recovery must never silently change provider, channel, or feed.

## Targeted logs on failure

Clear logs immediately before reproducing:

```bat
"%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe" logcat -c
```

Then reproduce once and collect Media3/Get Smart playback lines:

```bat
"%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe" logcat -d | findstr /i "GetSmartProvider Media3 ExoPlayer PlaybackException PlayerError HttpDataSource Decoder LoadError AndroidRuntime FATAL"
```

If the app process dies:

```bat
"%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe" logcat -b crash -d -v time
```

and:

```bat
"%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe" shell dumpsys activity exit-info com.getsmartmedia.player
```

Do not paste credentials, provider passwords, or raw authenticated stream URLs into bug reports.

## Runtime-gate rule

A playback feature is not marked PASS from source review alone. HS16 remains CODED / NOT RUNTIME VERIFIED until the physical-device checks above succeed.

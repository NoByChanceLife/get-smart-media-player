# Android Native Provider Transport

Status: foundation committed; native Android project/plugin generation is the next build step.

## Why this exists

Get Smart's provider protocol logic must not depend on Cloud Run. The installed Android app needs to be able to originate authorized provider requests from the device while the browser/PWA can continue using the web transport.

Current boundary:

```
Xtream protocol -> ProviderTransport
                   |- WebProviderTransport
                   \- AndroidProviderTransport -> GetSmartProvider native plugin
```

The Android bridge intentionally does not implement or copy any provider-specific private control plane.

## Native plugin contract

Plugin name: `GetSmartProvider`

Method: `requestJson`

Input:
- `url` required
- `userAgent` optional
- `mac` optional (reserved for supported portal transports)
- `token` optional (reserved for supported authenticated transports)

Output:
- `status`
- `contentType`
- `data` parsed JSON

Security requirements:
- HTTP/HTTPS only.
- Do not log provider URLs containing credentials.
- Bound response size and timeout.
- Do not disable TLS certificate validation.
- Cleartext HTTP must be narrowly enabled for user-supplied provider hosts needed by Android rather than globally weakening transport security.
- Redirect destinations must be validated.
- Errors returned to JavaScript must not echo credentials.

## Build sequence

1. Install dependencies.
2. `npm run android:add` once to generate the Android project.
3. Add the native `GetSmartProvider` plugin implementation.
4. Register the plugin in the Android activity.
5. Add a narrowly scoped Network Security Configuration for required HTTP provider endpoints.
6. `npm run android:sync` after web changes.
7. Test an authorized Xtream account on an actual Android/Fire TV device.

The browser/Cloud Run connection result is not authoritative for Android provider compatibility.

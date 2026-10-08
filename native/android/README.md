# Android native source overlay

These files are the Get Smart-owned native sources that are applied after Capacitor generates the Android shell.

- `GetSmartProviderPlugin.java` implements device-originated JSON provider requests.
- `MainActivity.java` registers the bridge plugin.

The generated `android/` project is intentionally not hand-invented in Git. Generate it with the installed Capacitor CLI first, then copy these owned sources into:

`android/app/src/main/java/com/getsmartmedia/player/`

## Cleartext HTTP

Many legitimate user-supplied media servers still use `http://host:port`. Android 9+ blocks cleartext by default. A general-purpose player cannot pre-enumerate every user provider domain in a static Network Security Configuration.

Therefore the packaged Android application will need to permit cleartext traffic at the application level if arbitrary HTTP providers are a supported product requirement. This does **not** disable HTTPS certificate validation. The app should visibly prefer HTTPS and only use HTTP when the user supplied an HTTP endpoint.

Do not add a trust-all certificate manager or hostname-verification bypass.

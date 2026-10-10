package com.getsmartmedia.player;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.net.ssl.SSLException;

@CapacitorPlugin(name = "GetSmartProvider")
public class GetSmartProviderPlugin extends Plugin {
    private static final int MAX_RESPONSE_BYTES = 32 * 1024 * 1024;

    // Verified from the supplied known-working XCIPTV-family APK's
    // WebServicesAdapter used by player_api.php.
    private static final int CONNECT_TIMEOUT_MS = 60_000;
    private static final int READ_TIMEOUT_MS = 60_000;
    private static final String TRANSPORT_BUILD = "GS-NATIVE-URLCONNECTION-60S";

    private static final String CREDENTIAL_PREFS = "getsmart_secure_credentials";
    private static final String CREDENTIAL_DRAFT_KEY = "xtream_draft_v1";
    private static final String KEYSTORE_ALIAS = "getsmart_xtream_draft_key_v1";

    private final ExecutorService executor = Executors.newCachedThreadPool();

    @PluginMethod
    public void saveCredentialDraft(PluginCall call) {
        executor.execute(() -> {
            try {
                JSONObject payload = new JSONObject();
                payload.put("name", safeString(call.getString("name")));
                payload.put("serverUrl", safeString(call.getString("serverUrl")));
                payload.put("username", safeString(call.getString("username")));
                payload.put("password", safeString(call.getString("password")));

                String encrypted = encryptDraft(payload.toString());
                SharedPreferences prefs = getContext().getSharedPreferences(CREDENTIAL_PREFS, Context.MODE_PRIVATE);
                prefs.edit().putString(CREDENTIAL_DRAFT_KEY, encrypted).apply();
                call.resolve(new JSObject());
            } catch (Exception error) {
                call.reject("Unable to securely save Xtream credentials on this device.");
            }
        });
    }

    @PluginMethod
    public void loadCredentialDraft(PluginCall call) {
        executor.execute(() -> {
            try {
                SharedPreferences prefs = getContext().getSharedPreferences(CREDENTIAL_PREFS, Context.MODE_PRIVATE);
                String encrypted = prefs.getString(CREDENTIAL_DRAFT_KEY, null);
                JSObject result = new JSObject();

                if (encrypted == null || encrypted.isEmpty()) {
                    call.resolve(result);
                    return;
                }

                JSONObject payload = new JSONObject(decryptDraft(encrypted));
                result.put("name", payload.optString("name", ""));
                result.put("serverUrl", payload.optString("serverUrl", ""));
                result.put("username", payload.optString("username", ""));
                result.put("password", payload.optString("password", ""));
                call.resolve(result);
            } catch (Exception error) {
                getContext().getSharedPreferences(CREDENTIAL_PREFS, Context.MODE_PRIVATE)
                    .edit()
                    .remove(CREDENTIAL_DRAFT_KEY)
                    .apply();
                call.resolve(new JSObject());
            }
        });
    }

    @PluginMethod
    public void clearCredentialDraft(PluginCall call) {
        getContext().getSharedPreferences(CREDENTIAL_PREFS, Context.MODE_PRIVATE)
            .edit()
            .remove(CREDENTIAL_DRAFT_KEY)
            .apply();
        call.resolve(new JSObject());
    }

    private String safeString(String value) {
        return value == null ? "" : value;
    }

    private SecretKey getOrCreateCredentialKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);

        if (keyStore.containsAlias(KEYSTORE_ALIAS)) {
            return (SecretKey) keyStore.getKey(KEYSTORE_ALIAS, null);
        }

        KeyGenerator generator = KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES,
            "AndroidKeyStore"
        );
        generator.init(
            new KeyGenParameterSpec.Builder(
                KEYSTORE_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build()
        );
        return generator.generateKey();
    }

    private String encryptDraft(String plaintext) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateCredentialKey());

        byte[] iv = cipher.getIV();
        byte[] ciphertext = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));

        return Base64.encodeToString(iv, Base64.NO_WRAP) + ":" +
            Base64.encodeToString(ciphertext, Base64.NO_WRAP);
    }

    private String decryptDraft(String encrypted) throws Exception {
        String[] parts = encrypted.split(":", 2);
        if (parts.length != 2) {
            throw new IllegalArgumentException("Credential draft format is invalid.");
        }

        byte[] iv = Base64.decode(parts[0], Base64.NO_WRAP);
        byte[] ciphertext = Base64.decode(parts[1], Base64.NO_WRAP);

        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(
            Cipher.DECRYPT_MODE,
            getOrCreateCredentialKey(),
            new GCMParameterSpec(128, iv)
        );

        return new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8);
    }

    @PluginMethod
    public void requestJson(PluginCall call) {
        final String rawUrl = call.getString("url");
        if (rawUrl == null || rawUrl.trim().isEmpty()) {
            call.reject("Missing provider URL.");
            return;
        }

        final String userAgent = call.getString("userAgent");
        final String mac = call.getString("mac");
        final String token = call.getString("token");

        executor.execute(() -> {
            HttpURLConnection connection = null;
            String phase = "validating";

            try {
                URL url = validateHttpUrl(rawUrl);

                // Match the working APK's Xtream WebServicesAdapter as closely
                // as practical: HttpURLConnection, GET, User-Agent, native
                // redirect handling. We temporarily allow 60s connect/read
                // while diagnosing this provider; the reference app uses 40s/35s.
                phase = "opening";
                connection = (HttpURLConnection) url.openConnection();
                connection.setRequestMethod("GET");
                connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
                connection.setReadTimeout(READ_TIMEOUT_MS);
                connection.setInstanceFollowRedirects(true);

                if (userAgent != null && !userAgent.trim().isEmpty()) {
                    connection.setRequestProperty("User-Agent", userAgent.trim());
                }

                // Optional Portal/STB compatibility headers. Ordinary Xtream
                // calls do not send these.
                if (mac != null && !mac.trim().isEmpty()) {
                    String encodedMac = URLEncoder.encode(
                        mac.trim(),
                        StandardCharsets.UTF_8.name()
                    );
                    connection.setRequestProperty(
                        "Cookie",
                        "mac=" + encodedMac + "; stb_lang=en; timezone=Europe/London;"
                    );
                    connection.setRequestProperty(
                        "X-User-Agent",
                        "Model: MAG250; Link: Ethernet"
                    );
                }

                if (token != null && !token.trim().isEmpty()) {
                    connection.setRequestProperty(
                        "Authorization",
                        "Bearer " + token.trim()
                    );
                }

                phase = "connecting";
                connection.connect();

                phase = "reading";
                int status = connection.getResponseCode();
                String contentType = connection.getContentType();

                InputStream stream =
                    status >= 200 && status < 400
                        ? connection.getInputStream()
                        : connection.getErrorStream();

                String body = readBounded(stream);

                JSObject result = new JSObject();
                result.put("status", status);
                result.put(
                    "contentType",
                    contentType == null ? "" : contentType
                );

                if (body == null || body.trim().isEmpty()) {
                    result.put("data", JSONObject.NULL);
                } else {
                    String trimmed = body.trim();
                    try {
                        if (trimmed.startsWith("[")) {
                            result.put("data", new JSONArray(trimmed));
                        } else {
                            result.put("data", new JSONObject(trimmed));
                        }
                    } catch (JSONException jsonError) {
                        if (status >= 400) {
                            JSObject safeError = new JSObject();
                            safeError.put(
                                "error",
                                "Provider returned a non-JSON error response."
                            );
                            result.put("data", safeError);
                        } else {
                            call.reject("Provider returned a non-JSON response.");
                            return;
                        }
                    }
                }

                call.resolve(result);
            } catch (Exception error) {
                // Never echo the requested URL because Xtream URLs contain
                // account credentials in their query string.
                call.reject(safeMessage(error, phase));
            } finally {
                if (connection != null) {
                    connection.disconnect();
                }
            }
        });
    }

    private URL validateHttpUrl(String value) throws Exception {
        URI uri = new URI(value);
        String scheme = uri.getScheme();

        if (
            scheme == null ||
            !(scheme.equalsIgnoreCase("http") || scheme.equalsIgnoreCase("https"))
        ) {
            throw new IllegalArgumentException(
                "Only HTTP and HTTPS provider URLs are supported."
            );
        }

        if (uri.getHost() == null || uri.getHost().isEmpty()) {
            throw new IllegalArgumentException("Provider host is invalid.");
        }

        // Native IPTV clients must be able to connect to user-configured
        // provider hosts, including legitimate LAN/private portal addresses.
        // Do not apply server-side SSRF restrictions to requests originating
        // from the user's Android device.
        return uri.toURL();
    }

    private String readBounded(InputStream stream) throws Exception {
        if (stream == null) {
            return "";
        }

        BufferedReader reader = new BufferedReader(
            new InputStreamReader(stream, StandardCharsets.UTF_8)
        );
        StringBuilder body = new StringBuilder();
        String line;

        while ((line = reader.readLine()) != null) {
            if (body.length() + line.length() + 1 > MAX_RESPONSE_BYTES) {
                reader.close();
                throw new IllegalStateException(
                    "Provider response exceeded the safety limit."
                );
            }

            body.append(line).append('\n');
        }

        reader.close();
        return body.toString();
    }

    private String safeMessage(Exception error, String phase) {
        if (error instanceof java.net.SocketTimeoutException) {
            if ("connecting".equals(phase)) {
                return TRANSPORT_BUILD + ": Provider TCP connection timed out after 60 seconds.";
            }
            if ("reading".equals(phase)) {
                return TRANSPORT_BUILD + ": Provider connected, but the server did not return data within 60 seconds.";
            }
            return TRANSPORT_BUILD + ": Provider connection timed out during " + phase + ".";
        }

        if (error instanceof java.net.ConnectException) {
            return TRANSPORT_BUILD + ": Provider refused the network connection.";
        }

        if (error instanceof java.net.UnknownHostException) {
            return TRANSPORT_BUILD + ": Provider host could not be resolved.";
        }

        if (error instanceof SSLException) {
            return TRANSPORT_BUILD + ": Provider TLS/SSL negotiation failed.";
        }

        if (
            error instanceof SecurityException ||
            error instanceof IllegalArgumentException
        ) {
            return error.getMessage();
        }

        if (
            error instanceof IllegalStateException &&
            error.getMessage() != null
        ) {
            return error.getMessage();
        }

        return TRANSPORT_BUILD + ": Native provider request failed during " + phase + ".";
    }

    @Override
    protected void handleOnDestroy() {
        executor.shutdownNow();
        super.handleOnDestroy();
    }
}

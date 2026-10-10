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

import java.net.InetAddress;
import java.net.URI;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.net.ssl.SSLException;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.ResponseBody;

@CapacitorPlugin(name = "GetSmartProvider")
public class GetSmartProviderPlugin extends Plugin {
    private static final int MAX_RESPONSE_BYTES = 32 * 1024 * 1024;
    private static final int MAX_REDIRECTS = 5;
    private static final String CREDENTIAL_PREFS = "getsmart_secure_credentials";
    private static final String CREDENTIAL_DRAFT_KEY = "xtream_draft_v1";
    private static final String KEYSTORE_ALIAS = "getsmart_xtream_draft_key_v1";

    /**
     * Use the same mature native HTTP family observed in the known-working
     * reference IPTV application. The client is shared so DNS/connection pools
     * and retry behavior work like a normal Android media application rather
     * than recreating a raw URLConnection for every Xtream request.
     */
    private final OkHttpClient httpClient = new OkHttpClient.Builder()
        .connectTimeout(25, TimeUnit.SECONDS)
        .readTimeout(45, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        // Redirects are followed manually so every target can be validated.
        .followRedirects(false)
        .followSslRedirects(false)
        .build();

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
                // If the keystore was reset (for example after app restore),
                // discard the unreadable draft rather than exposing raw data.
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

        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
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
        if (parts.length != 2) throw new IllegalArgumentException("Credential draft format is invalid.");

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
            try {
                URL currentUrl = validatePublicHttpUrl(rawUrl);
                int redirects = 0;

                while (true) {
                    Request request = buildRequest(currentUrl, userAgent, mac, token);

                    try (Response response = httpClient.newCall(request).execute()) {
                        final int status = response.code();

                        if (status >= 300 && status < 400) {
                            if (redirects >= MAX_REDIRECTS) {
                                call.reject("Provider returned too many redirects.");
                                return;
                            }

                            String location = response.header("Location");
                            if (location == null || location.trim().isEmpty()) {
                                call.reject("Provider redirect was missing a destination.");
                                return;
                            }

                            currentUrl = validatePublicHttpUrl(new URL(currentUrl, location).toString());
                            redirects++;
                            continue;
                        }

                        String contentType = response.header("Content-Type", "");
                        String body = readBounded(response.body());

                        JSObject result = new JSObject();
                        result.put("status", status);
                        result.put("contentType", contentType == null ? "" : contentType);

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
                                // Do not reflect provider HTML/error bodies or URLs with
                                // embedded credentials back into JavaScript.
                                if (status >= 400) {
                                    JSObject safeError = new JSObject();
                                    safeError.put("error", "Provider returned a non-JSON error response.");
                                    result.put("data", safeError);
                                } else {
                                    call.reject("Provider returned a non-JSON response.");
                                    return;
                                }
                            }
                        }

                        call.resolve(result);
                        return;
                    }
                }
            } catch (Exception error) {
                // Never echo the requested URL: Xtream URLs can contain credentials.
                call.reject(safeMessage(error));
            }
        });
    }

    private Request buildRequest(URL url, String userAgent, String mac, String token) throws Exception {
        Request.Builder builder = new Request.Builder()
            .url(url)
            .get()
            .header("Accept", "*/*")
            .header("Connection", "keep-alive");

        if (userAgent != null && !userAgent.trim().isEmpty()) {
            builder.header("User-Agent", userAgent.trim());
        }

        if (mac != null && !mac.trim().isEmpty()) {
            String encodedMac = URLEncoder.encode(mac.trim(), StandardCharsets.UTF_8.name());
            builder.header("Cookie", "mac=" + encodedMac + "; stb_lang=en; timezone=Europe/London;");
            builder.header("X-User-Agent", "Model: MAG250; Link: Ethernet");
        }

        if (token != null && !token.trim().isEmpty()) {
            builder.header("Authorization", "Bearer " + token.trim());
        }

        return builder.build();
    }

    private URL validatePublicHttpUrl(String value) throws Exception {
        URI uri = new URI(value);
        String scheme = uri.getScheme();
        if (scheme == null || !(scheme.equalsIgnoreCase("http") || scheme.equalsIgnoreCase("https"))) {
            throw new IllegalArgumentException("Only HTTP and HTTPS provider URLs are supported.");
        }
        if (uri.getUserInfo() != null) {
            throw new IllegalArgumentException("Embedded URL credentials are not allowed.");
        }

        String host = uri.getHost();
        if (host == null || host.isEmpty()) {
            throw new IllegalArgumentException("Provider host is invalid.");
        }

        // Preserve SSRF/local-network protections while letting OkHttp perform
        // the actual connection/DNS route selection after validation.
        for (InetAddress address : InetAddress.getAllByName(host)) {
            if (address.isAnyLocalAddress() ||
                address.isLoopbackAddress() ||
                address.isLinkLocalAddress() ||
                address.isSiteLocalAddress() ||
                address.isMulticastAddress()) {
                throw new SecurityException("Private or local provider addresses are not allowed.");
            }
        }

        return uri.toURL();
    }

    private String readBounded(ResponseBody responseBody) throws Exception {
        if (responseBody == null) return "";

        long declaredLength = responseBody.contentLength();
        if (declaredLength > MAX_RESPONSE_BYTES) {
            throw new IllegalStateException("Provider response exceeded the safety limit.");
        }

        byte[] body = responseBody.bytes();
        if (body.length > MAX_RESPONSE_BYTES) {
            throw new IllegalStateException("Provider response exceeded the safety limit.");
        }

        return new String(body, StandardCharsets.UTF_8);
    }

    private String safeMessage(Exception error) {
        if (error instanceof java.net.SocketTimeoutException) {
            String message = error.getMessage();
            if (message != null && message.toLowerCase().contains("connect")) {
                return "Provider connection timed out before the server accepted the connection.";
            }
            return "Provider connection timed out while waiting for a response.";
        }
        if (error instanceof java.net.ConnectException) {
            return "Provider refused the network connection.";
        }
        if (error instanceof java.net.UnknownHostException) {
            return "Provider host could not be resolved.";
        }
        if (error instanceof SSLException) {
            return "Provider TLS/SSL negotiation failed.";
        }
        if (error instanceof SecurityException || error instanceof IllegalArgumentException) {
            return error.getMessage();
        }
        if (error instanceof IllegalStateException && error.getMessage() != null) {
            return error.getMessage();
        }
        return "Native provider request failed.";
    }

    @Override
    protected void handleOnDestroy() {
        executor.shutdownNow();
        httpClient.dispatcher().executorService().shutdownNow();
        httpClient.connectionPool().evictAll();
        super.handleOnDestroy();
    }
}

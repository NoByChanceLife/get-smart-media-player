package com.getsmartmedia.player;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.ProxyInfo;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.content.Intent;
import android.net.Uri;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URI;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.LinkedHashMap;
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

    // Both supplied working XCIPTV apps use HttpURLConnection for Xtream.
    // v4.0.3: connect 40s / read 35s + branded User-Agent.
    // v5.0.1: connect 40s / read 40s + Connection: close.
    private static final int CONNECT_TIMEOUT_MS = 40_000;
    private static final int READ_TIMEOUT_MS = 40_000;
    private static final int DIRECT_ADDRESS_CONNECT_TIMEOUT_MS = 6_000;
    private static final int NETWORK_ROUTE_CONNECT_TIMEOUT_MS = 8_000;
    private static final int MAX_REDIRECTS = 5;
    private static final String TRANSPORT_BUILD = "GS-NATIVE-XCIPTV-HS7";

    private static final String CREDENTIAL_PREFS = "getsmart_secure_credentials";
    private static final String CREDENTIAL_DRAFT_KEY = "xtream_draft_v1";
    private static final String KEYSTORE_ALIAS = "getsmart_xtream_draft_key_v1";

    private final ExecutorService executor = Executors.newCachedThreadPool();

    private static final class HttpResult {
        final int status;
        final String contentType;
        final String body;
        final String route;

        HttpResult(int status, String contentType, String body, String route) {
            this.status = status;
            this.contentType = contentType == null ? "" : contentType;
            this.body = body == null ? "" : body;
            this.route = route == null ? "" : route;
        }
    }

    private static final class DirectRouteFailure extends Exception {
        final int resolvedCount;
        final int ipv4Count;
        final int ipv6Count;

        DirectRouteFailure(String message, int resolvedCount, int ipv4Count, int ipv6Count) {
            super(message);
            this.resolvedCount = resolvedCount;
            this.ipv4Count = ipv4Count;
            this.ipv6Count = ipv6Count;
        }
    }

    private static final class VisibleNetworkRouteFailure extends Exception {
        final int attemptedNetworks;
        final int vpnNetworks;
        final int wifiNetworks;
        final int cellularNetworks;
        final int ethernetNetworks;

        VisibleNetworkRouteFailure(
            int attemptedNetworks,
            int vpnNetworks,
            int wifiNetworks,
            int cellularNetworks,
            int ethernetNetworks
        ) {
            super("No visible Android network completed the provider request.");
            this.attemptedNetworks = attemptedNetworks;
            this.vpnNetworks = vpnNetworks;
            this.wifiNetworks = wifiNetworks;
            this.cellularNetworks = cellularNetworks;
            this.ethernetNetworks = ethernetNetworks;
        }
    }

    @PluginMethod
    public void getTransportInfo(PluginCall call) {
        JSObject result = new JSObject();
        result.put("marker", TRANSPORT_BUILD);
        result.put("engine", "XCIPTV HttpURLConnection + direct-address HTTP fallback");
        result.put("connectTimeoutMs", CONNECT_TIMEOUT_MS);
        result.put("readTimeoutMs", READ_TIMEOUT_MS);
        call.resolve(result);
    }

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
                SharedPreferences prefs = getContext().getSharedPreferences(
                    CREDENTIAL_PREFS,
                    Context.MODE_PRIVATE
                );
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
                SharedPreferences prefs = getContext().getSharedPreferences(
                    CREDENTIAL_PREFS,
                    Context.MODE_PRIVATE
                );
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
        byte[] ciphertext = cipher.doFinal(
            plaintext.getBytes(StandardCharsets.UTF_8)
        );

        return Base64.encodeToString(iv, Base64.NO_WRAP) + ":" +
            Base64.encodeToString(ciphertext, Base64.NO_WRAP);
    }

    private String decryptDraft(String encrypted) throws Exception {
        String[] parts = encrypted.split(":", 2);
        if (parts.length != 2) {
            throw new IllegalArgumentException(
                "Credential draft format is invalid."
            );
        }

        byte[] iv = Base64.decode(parts[0], Base64.NO_WRAP);
        byte[] ciphertext = Base64.decode(parts[1], Base64.NO_WRAP);

        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(
            Cipher.DECRYPT_MODE,
            getOrCreateCredentialKey(),
            new GCMParameterSpec(128, iv)
        );

        return new String(
            cipher.doFinal(ciphertext),
            StandardCharsets.UTF_8
        );
    }

    @PluginMethod
    public void playMedia(PluginCall call) {
        final String rawUrl = call.getString("url");
        if (rawUrl == null || rawUrl.trim().isEmpty()) {
            call.reject("Missing media URL.");
            return;
        }

        try {
            URL validated = validateHttpUrl(rawUrl);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(Uri.parse(validated.toString()), "video/*");
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);

            JSObject result = new JSObject();
            result.put("started", true);
            result.put("engine", "android-media-intent");
            call.resolve(result);
        } catch (Exception error) {
            call.reject("No compatible Android media player could open this stream.");
        }
    }

    @PluginMethod
    public void stopMedia(PluginCall call) {
        JSObject result = new JSObject();
        result.put("stopped", true);
        call.resolve(result);
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
                URL url = validateHttpUrl(rawUrl);
                HttpResult result;

                // HS6 first tries each Android Network explicitly. This is the
                // critical comparison with working XCIPTV builds: if a VPN,
                // Wi-Fi, cellular, or Ethernet network has the route, bind the
                // provider request to that network's own DNS/socket stack.
                VisibleNetworkRouteFailure visibleNetworkFailure = null;
                try {
                    result = performAcrossVisibleNetworks(
                        url,
                        userAgent,
                        mac,
                        token
                    );
                } catch (VisibleNetworkRouteFailure routeFailure) {
                    visibleNetworkFailure = routeFailure;

                    // Plain HTTP is common in Xtream deployments. If every
                    // visible Android network failed, also try every address
                    // returned by system DNS, preserving the original Host
                    // header. This catches address-family/order problems.
                    if ("http".equalsIgnoreCase(url.getProtocol())) {
                        try {
                            result = performDirectHttpRequest(
                                url,
                                userAgent,
                                mac,
                                token,
                                0
                            );
                        } catch (DirectRouteFailure directFailure) {
                            try {
                                result = performReferenceUrlConnection(
                                    url,
                                    userAgent,
                                    mac,
                                    token
                                );
                            } catch (Exception referenceFailure) {
                                call.reject(
                                    safeMessage(
                                        referenceFailure,
                                        "connecting",
                                        directFailure,
                                        visibleNetworkFailure
                                    )
                                );
                                return;
                            }
                        }
                    } else {
                        try {
                            result = performReferenceUrlConnection(
                                url,
                                userAgent,
                                mac,
                                token
                            );
                        } catch (Exception referenceFailure) {
                            call.reject(
                                safeMessage(
                                    referenceFailure,
                                    "connecting",
                                    null,
                                    visibleNetworkFailure
                                )
                            );
                            return;
                        }
                    }
                }

                resolveHttpResult(call, result);
            } catch (Exception error) {
                call.reject(safeMessage(error, "request", null, null));
            }
        });
    }

    private HttpResult performAcrossVisibleNetworks(
        URL url,
        String userAgent,
        String mac,
        String token
    ) throws Exception {
        ConnectivityManager cm = (ConnectivityManager) getContext().getSystemService(
            Context.CONNECTIVITY_SERVICE
        );

        if (cm == null) {
            throw new VisibleNetworkRouteFailure(0, 0, 0, 0, 0);
        }

        Network active = cm.getActiveNetwork();
        List<Network> networks = new ArrayList<>(Arrays.asList(cm.getAllNetworks()));

        networks.sort((left, right) -> {
            if (left.equals(active) && !right.equals(active)) {
                return -1;
            }
            if (right.equals(active) && !left.equals(active)) {
                return 1;
            }

            NetworkCapabilities leftCaps = cm.getNetworkCapabilities(left);
            NetworkCapabilities rightCaps = cm.getNetworkCapabilities(right);

            int leftRank = networkPriority(leftCaps);
            int rightRank = networkPriority(rightCaps);
            return Integer.compare(leftRank, rightRank);
        });

        int attempted = 0;
        int vpn = 0;
        int wifi = 0;
        int cellular = 0;
        int ethernet = 0;

        for (Network network : networks) {
            NetworkCapabilities caps = cm.getNetworkCapabilities(network);
            if (caps == null) {
                continue;
            }

            boolean isVpn = caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN);
            boolean isWifi = caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI);
            boolean isCellular = caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR);
            boolean isEthernet = caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET);

            if (isVpn) vpn++;
            if (isWifi) wifi++;
            if (isCellular) cellular++;
            if (isEthernet) ethernet++;

            if (
                !caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
                !isVpn
            ) {
                continue;
            }

            attempted++;
            HttpURLConnection connection = null;

            try {
                connection = (HttpURLConnection) network.openConnection(url);
                connection.setRequestMethod("GET");
                connection.setConnectTimeout(NETWORK_ROUTE_CONNECT_TIMEOUT_MS);
                connection.setReadTimeout(READ_TIMEOUT_MS);
                connection.setInstanceFollowRedirects(true);
                connection.setRequestProperty("Connection", "close");

                if (userAgent != null && !userAgent.trim().isEmpty()) {
                    connection.setRequestProperty("User-Agent", userAgent.trim());
                }

                applyPortalHeaders(connection, mac, token);

                connection.connect();

                int status = connection.getResponseCode();
                String contentType = connection.getContentType();
                InputStream stream =
                    status >= 200 && status < 400
                        ? connection.getInputStream()
                        : connection.getErrorStream();

                return new HttpResult(
                    status,
                    contentType,
                    readBounded(stream),
                    "android-network-" + networkLabel(caps)
                );
            } catch (Exception ignored) {
                // Try the next visible Android network.
            } finally {
                if (connection != null) {
                    connection.disconnect();
                }
            }
        }

        throw new VisibleNetworkRouteFailure(
            attempted,
            vpn,
            wifi,
            cellular,
            ethernet
        );
    }

    private int networkPriority(NetworkCapabilities caps) {
        if (caps == null) {
            return 99;
        }
        if (caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) {
            return 0;
        }
        if (caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) {
            return 1;
        }
        if (caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)) {
            return 2;
        }
        if (caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) {
            return 3;
        }
        return 10;
    }

    private String networkLabel(NetworkCapabilities caps) {
        if (caps == null) {
            return "unknown";
        }
        if (caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) {
            return "vpn";
        }
        if (caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) {
            return "wifi";
        }
        if (caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)) {
            return "ethernet";
        }
        if (caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) {
            return "cellular";
        }
        return "other";
    }

    private HttpResult performReferenceUrlConnection(
        URL url,
        String userAgent,
        String mac,
        String token
    ) throws Exception {
        HttpURLConnection connection = null;

        try {
            connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod("GET");
            connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
            connection.setReadTimeout(READ_TIMEOUT_MS);
            connection.setInstanceFollowRedirects(true);

            // XCIPTV v5.0.1 explicitly disables keep-alive for this adapter.
            connection.setRequestProperty("Connection", "close");

            if (userAgent != null && !userAgent.trim().isEmpty()) {
                connection.setRequestProperty("User-Agent", userAgent.trim());
            }

            applyPortalHeaders(connection, mac, token);

            connection.connect();

            int status = connection.getResponseCode();
            String contentType = connection.getContentType();

            InputStream stream =
                status >= 200 && status < 400
                    ? connection.getInputStream()
                    : connection.getErrorStream();

            return new HttpResult(
                status,
                contentType,
                readBounded(stream),
                "urlconnection"
            );
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    private HttpResult performDirectHttpRequest(
        URL url,
        String userAgent,
        String mac,
        String token,
        int redirectDepth
    ) throws Exception {
        if (redirectDepth > MAX_REDIRECTS) {
            throw new DirectRouteFailure(
                "Provider returned too many redirects.",
                0,
                0,
                0
            );
        }

        String host = url.getHost();
        int port = url.getPort() > 0 ? url.getPort() : 80;
        InetAddress[] resolved = InetAddress.getAllByName(host);

        List<InetAddress> addresses = new ArrayList<>(Arrays.asList(resolved));
        addresses.sort(
            Comparator.comparingInt(
                address -> address instanceof Inet4Address ? 0 : 1
            )
        );

        int ipv4Count = 0;
        int ipv6Count = 0;
        for (InetAddress address : addresses) {
            if (address instanceof Inet4Address) {
                ipv4Count++;
            } else {
                ipv6Count++;
            }
        }

        Exception lastFailure = null;

        for (InetAddress address : addresses) {
            Socket socket = new Socket();

            try {
                socket.connect(
                    new InetSocketAddress(address, port),
                    DIRECT_ADDRESS_CONNECT_TIMEOUT_MS
                );
                socket.setSoTimeout(READ_TIMEOUT_MS);

                OutputStream output = socket.getOutputStream();
                String target = url.getFile();
                if (target == null || target.isEmpty()) {
                    target = "/";
                }

                String hostHeader = host;
                if (port != 80) {
                    hostHeader += ":" + port;
                }

                StringBuilder request = new StringBuilder();
                request
                    .append("GET ")
                    .append(target)
                    .append(" HTTP/1.1\r\n")
                    .append("Host: ")
                    .append(hostHeader)
                    .append("\r\n")
                    .append("Connection: close\r\n")
                    .append("Accept: application/json, */*;q=0.8\r\n");

                if (userAgent != null && !userAgent.trim().isEmpty()) {
                    request
                        .append("User-Agent: ")
                        .append(userAgent.trim())
                        .append("\r\n");
                }

                if (mac != null && !mac.trim().isEmpty()) {
                    String encodedMac = URLEncoder.encode(
                        mac.trim(),
                        StandardCharsets.UTF_8.name()
                    );
                    request
                        .append("Cookie: mac=")
                        .append(encodedMac)
                        .append("; stb_lang=en; timezone=Europe/London;\r\n")
                        .append(
                            "X-User-Agent: Model: MAG250; Link: Ethernet\r\n"
                        );
                }

                if (token != null && !token.trim().isEmpty()) {
                    request
                        .append("Authorization: Bearer ")
                        .append(token.trim())
                        .append("\r\n");
                }

                request.append("\r\n");

                output.write(
                    request.toString().getBytes(StandardCharsets.ISO_8859_1)
                );
                output.flush();

                BufferedInputStream input = new BufferedInputStream(
                    socket.getInputStream()
                );

                String statusLine = readAsciiLine(input);
                if (
                    statusLine == null ||
                    !statusLine.toUpperCase(Locale.US).startsWith("HTTP/")
                ) {
                    throw new IllegalStateException(
                        "Provider returned an invalid HTTP status line."
                    );
                }

                String[] statusParts = statusLine.split(" ", 3);
                if (statusParts.length < 2) {
                    throw new IllegalStateException(
                        "Provider returned an invalid HTTP status."
                    );
                }

                int status = Integer.parseInt(statusParts[1]);
                Map<String, String> headers = new LinkedHashMap<>();

                while (true) {
                    String line = readAsciiLine(input);
                    if (line == null || line.isEmpty()) {
                        break;
                    }

                    int colon = line.indexOf(':');
                    if (colon > 0) {
                        headers.put(
                            line.substring(0, colon).trim().toLowerCase(Locale.US),
                            line.substring(colon + 1).trim()
                        );
                    }
                }

                if (status >= 300 && status < 400) {
                    String location = headers.get("location");
                    if (location != null && !location.trim().isEmpty()) {
                        URL redirected = validateHttpUrl(
                            new URL(url, location).toString()
                        );

                        if (
                            "http".equalsIgnoreCase(redirected.getProtocol())
                        ) {
                            return performDirectHttpRequest(
                                redirected,
                                userAgent,
                                mac,
                                token,
                                redirectDepth + 1
                            );
                        }

                        return performReferenceUrlConnection(
                            redirected,
                            userAgent,
                            mac,
                            token
                        );
                    }
                }

                String transferEncoding = headers.get("transfer-encoding");
                String contentLength = headers.get("content-length");
                String body;

                if (
                    transferEncoding != null &&
                    transferEncoding.toLowerCase(Locale.US).contains("chunked")
                ) {
                    body = readChunkedBody(input);
                } else if (contentLength != null) {
                    long length = Long.parseLong(contentLength.trim());
                    body = readFixedBody(input, length);
                } else {
                    body = readUntilEof(input);
                }

                String family =
                    address instanceof Inet4Address ? "ipv4" : "ipv6";

                return new HttpResult(
                    status,
                    headers.get("content-type"),
                    body,
                    "direct-" + family
                );
            } catch (Exception error) {
                lastFailure = error;
            } finally {
                try {
                    socket.close();
                } catch (Exception ignored) {
                    // Best effort.
                }
            }
        }

        String message =
            "Direct provider routes were unreachable after resolving " +
            addresses.size() +
            " address(es).";

        DirectRouteFailure failure = new DirectRouteFailure(
            message,
            addresses.size(),
            ipv4Count,
            ipv6Count
        );

        if (lastFailure != null) {
            failure.addSuppressed(lastFailure);
        }

        throw failure;
    }

    private void applyPortalHeaders(
        HttpURLConnection connection,
        String mac,
        String token
    ) throws Exception {
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
    }

    private void resolveHttpResult(
        PluginCall call,
        HttpResult result
    ) throws Exception {
        JSObject payload = new JSObject();
        payload.put("status", result.status);
        payload.put("contentType", result.contentType);
        payload.put("route", result.route);

        if (result.body == null || result.body.trim().isEmpty()) {
            payload.put("data", JSONObject.NULL);
            call.resolve(payload);
            return;
        }

        String trimmed = result.body.trim();

        try {
            if (trimmed.startsWith("[")) {
                payload.put("data", new JSONArray(trimmed));
            } else {
                payload.put("data", new JSONObject(trimmed));
            }
        } catch (JSONException jsonError) {
            if (result.status >= 400) {
                JSObject safeError = new JSObject();
                safeError.put(
                    "error",
                    "Provider returned a non-JSON error response."
                );
                payload.put("data", safeError);
            } else {
                call.reject(
                    TRANSPORT_BUILD +
                    ": Provider returned a non-JSON response via " +
                    result.route +
                    "."
                );
                return;
            }
        }

        call.resolve(payload);
    }

    private URL validateHttpUrl(String value) throws Exception {
        URI uri = new URI(value);
        String scheme = uri.getScheme();

        if (
            scheme == null ||
            !(
                scheme.equalsIgnoreCase("http") ||
                scheme.equalsIgnoreCase("https")
            )
        ) {
            throw new IllegalArgumentException(
                "Only HTTP and HTTPS provider URLs are supported."
            );
        }

        if (uri.getHost() == null || uri.getHost().isEmpty()) {
            throw new IllegalArgumentException("Provider host is invalid.");
        }

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

    private String readAsciiLine(InputStream input) throws Exception {
        ByteArrayOutputStream line = new ByteArrayOutputStream();
        int previous = -1;

        while (true) {
            int current = input.read();

            if (current == -1) {
                if (line.size() == 0) {
                    return null;
                }
                break;
            }

            if (previous == '\r' && current == '\n') {
                byte[] bytes = line.toByteArray();
                int length = Math.max(0, bytes.length - 1);
                return new String(
                    bytes,
                    0,
                    length,
                    StandardCharsets.ISO_8859_1
                );
            }

            line.write(current);
            previous = current;

            if (line.size() > 16 * 1024) {
                throw new IllegalStateException(
                    "Provider returned an oversized HTTP header line."
                );
            }
        }

        return new String(
            line.toByteArray(),
            StandardCharsets.ISO_8859_1
        );
    }

    private String readChunkedBody(InputStream input) throws Exception {
        ByteArrayOutputStream body = new ByteArrayOutputStream();

        while (true) {
            String sizeLine = readAsciiLine(input);
            if (sizeLine == null) {
                break;
            }

            String sizeToken = sizeLine.split(";", 2)[0].trim();
            int size = Integer.parseInt(sizeToken, 16);

            if (size == 0) {
                while (true) {
                    String trailer = readAsciiLine(input);
                    if (trailer == null || trailer.isEmpty()) {
                        break;
                    }
                }
                break;
            }

            copyExactBounded(input, body, size);

            // Consume chunk CRLF.
            input.read();
            input.read();
        }

        return body.toString(StandardCharsets.UTF_8.name());
    }

    private String readFixedBody(
        InputStream input,
        long length
    ) throws Exception {
        if (length > MAX_RESPONSE_BYTES) {
            throw new IllegalStateException(
                "Provider response exceeded the safety limit."
            );
        }

        ByteArrayOutputStream body = new ByteArrayOutputStream(
            (int) Math.max(0, Math.min(length, 64 * 1024))
        );
        copyExactBounded(input, body, length);

        return body.toString(StandardCharsets.UTF_8.name());
    }

    private String readUntilEof(InputStream input) throws Exception {
        ByteArrayOutputStream body = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int read;

        while ((read = input.read(buffer)) != -1) {
            writeBounded(body, buffer, read);
        }

        return body.toString(StandardCharsets.UTF_8.name());
    }

    private void copyExactBounded(
        InputStream input,
        ByteArrayOutputStream body,
        long length
    ) throws Exception {
        byte[] buffer = new byte[8192];
        long remaining = length;

        while (remaining > 0) {
            int requested = (int) Math.min(buffer.length, remaining);
            int read = input.read(buffer, 0, requested);

            if (read == -1) {
                throw new IllegalStateException(
                    "Provider response ended unexpectedly."
                );
            }

            writeBounded(body, buffer, read);
            remaining -= read;
        }
    }

    private void writeBounded(
        ByteArrayOutputStream body,
        byte[] buffer,
        int read
    ) throws Exception {
        if (body.size() + read > MAX_RESPONSE_BYTES) {
            throw new IllegalStateException(
                "Provider response exceeded the safety limit."
            );
        }

        body.write(buffer, 0, read);
    }

    private String getNetworkPathSummary() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getContext().getSystemService(
                Context.CONNECTIVITY_SERVICE
            );

            if (cm == null) {
                return "network=unknown";
            }

            Network active = cm.getActiveNetwork();
            NetworkCapabilities activeCaps =
                active == null ? null : cm.getNetworkCapabilities(active);

            String activeTransport = "none";
            if (activeCaps != null) {
                if (activeCaps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) {
                    activeTransport = "vpn";
                } else if (activeCaps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) {
                    activeTransport = "wifi";
                } else if (activeCaps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) {
                    activeTransport = "cellular";
                } else if (activeCaps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)) {
                    activeTransport = "ethernet";
                } else {
                    activeTransport = "other";
                }
            }

            int visibleVpnNetworks = 0;
            int visibleWifiNetworks = 0;
            int visibleCellNetworks = 0;

            for (Network network : cm.getAllNetworks()) {
                NetworkCapabilities caps = cm.getNetworkCapabilities(network);
                if (caps == null) {
                    continue;
                }

                if (caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) {
                    visibleVpnNetworks++;
                }
                if (caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) {
                    visibleWifiNetworks++;
                }
                if (caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) {
                    visibleCellNetworks++;
                }
            }

            ProxyInfo proxy = cm.getDefaultProxy();
            String proxyState =
                proxy != null &&
                proxy.getHost() != null &&
                !proxy.getHost().trim().isEmpty()
                    ? "configured"
                    : "none";

            return (
                "active=" + activeTransport +
                ", visibleVpn=" + visibleVpnNetworks +
                ", visibleWifi=" + visibleWifiNetworks +
                ", visibleCell=" + visibleCellNetworks +
                ", proxy=" + proxyState
            );
        } catch (Exception ignored) {
            return "network=unavailable";
        }
    }

    private String safeMessage(
        Exception error,
        String phase,
        DirectRouteFailure directFailure,
        VisibleNetworkRouteFailure visibleNetworkFailure
    ) {
        String routeDetail = "";
        String networkDetail = " Network path: " + getNetworkPathSummary() + ".";
        String visibleRouteDetail = "";

        if (visibleNetworkFailure != null) {
            visibleRouteDetail =
                " Explicit network attempts=" +
                visibleNetworkFailure.attemptedNetworks +
                " (VPN=" +
                visibleNetworkFailure.vpnNetworks +
                ", Wi-Fi=" +
                visibleNetworkFailure.wifiNetworks +
                ", cellular=" +
                visibleNetworkFailure.cellularNetworks +
                ", Ethernet=" +
                visibleNetworkFailure.ethernetNetworks +
                "); none completed the request.";
        }

        if (directFailure != null) {
            routeDetail =
                " Direct DNS/socket check resolved " +
                directFailure.resolvedCount +
                " address(es) (" +
                directFailure.ipv4Count +
                " IPv4, " +
                directFailure.ipv6Count +
                " IPv6); none completed the request.";
        }

        if (error instanceof java.net.SocketTimeoutException) {
            return (
                TRANSPORT_BUILD +
                ": Provider connection timed out during " +
                phase +
                "." +
                routeDetail +
                networkDetail +
                visibleRouteDetail
            );
        }

        if (error instanceof java.net.ConnectException) {
            return (
                TRANSPORT_BUILD +
                ": Provider refused the network connection." +
                routeDetail +
                networkDetail +
                visibleRouteDetail
            );
        }

        if (error instanceof java.net.UnknownHostException) {
            return (
                TRANSPORT_BUILD +
                ": Provider host could not be resolved." +
                networkDetail +
                visibleRouteDetail
            );
        }

        if (error instanceof SSLException) {
            return (
                TRANSPORT_BUILD +
                ": Provider TLS/SSL negotiation failed." +
                networkDetail +
                visibleRouteDetail
            );
        }

        if (error instanceof DirectRouteFailure) {
            DirectRouteFailure direct = (DirectRouteFailure) error;
            return (
                TRANSPORT_BUILD +
                ": " +
                direct.getMessage() +
                " Resolved " +
                direct.resolvedCount +
                " address(es) (" +
                direct.ipv4Count +
                " IPv4, " +
                direct.ipv6Count +
                " IPv6)." +
                networkDetail +
                visibleRouteDetail
            );
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
            return (
                TRANSPORT_BUILD +
                ": " +
                error.getMessage() +
                networkDetail +
                visibleRouteDetail
            );
        }

        return (
            TRANSPORT_BUILD +
            ": Native provider request failed during " +
            phase +
            "." +
            routeDetail +
            networkDetail +
            visibleRouteDetail
        );
    }

    @Override
    protected void handleOnDestroy() {
        executor.shutdownNow();
        super.handleOnDestroy();
    }
}

package com.getsmartmedia.player;

import android.webkit.URLUtil;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "GetSmartProvider")
public class GetSmartProviderPlugin extends Plugin {
    private static final int CONNECT_TIMEOUT_MS = 10000;
    private static final int READ_TIMEOUT_MS = 25000;
    private static final int MAX_RESPONSE_BYTES = 32 * 1024 * 1024;
    private final ExecutorService executor = Executors.newCachedThreadPool();

    @PluginMethod
    public void requestJson(PluginCall call) {
        final String rawUrl = call.getString("url");
        if (rawUrl == null || rawUrl.trim().isEmpty()) {
            call.reject("Missing provider URL.");
            return;
        }

        executor.execute(() -> {
            HttpURLConnection connection = null;
            try {
                URL url = validatePublicHttpUrl(rawUrl);
                connection = (HttpURLConnection) url.openConnection();
                connection.setRequestMethod("GET");
                connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
                connection.setReadTimeout(READ_TIMEOUT_MS);
                connection.setInstanceFollowRedirects(false);
                connection.setRequestProperty("Accept", "*/*");\n                connection.setRequestProperty("Connection", "keep-alive");

                String userAgent = call.getString("userAgent");
                if (userAgent != null && !userAgent.isEmpty()) {
                    connection.setRequestProperty("User-Agent", userAgent);
                }

                int status = connection.getResponseCode();

                // Follow redirects deliberately so every destination is validated.
                int redirects = 0;
                while (status >= 300 && status < 400 && redirects < 5) {
                    String location = connection.getHeaderField("Location");
                    if (location == null) break;
                    URL next = validatePublicHttpUrl(new URL(url, location).toString());
                    connection.disconnect();
                    url = next;
                    connection = (HttpURLConnection) url.openConnection();
                    connection.setRequestMethod("GET");
                    connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
                    connection.setReadTimeout(READ_TIMEOUT_MS);
                    connection.setInstanceFollowRedirects(false);
                    connection.setRequestProperty("Accept", "*/*");\n                    connection.setRequestProperty("Connection", "keep-alive");
                    if (userAgent != null && !userAgent.isEmpty()) {
                        connection.setRequestProperty("User-Agent", userAgent);
                    }
                    status = connection.getResponseCode();
                    redirects++;
                }

                if (status >= 300 && status < 400) {
                    call.reject("Provider returned too many redirects.");
                    return;
                }

                String contentType = connection.getContentType();
                InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
                String body = readBounded(stream);

                JSObject result = new JSObject();
                result.put("status", status);
                result.put("contentType", contentType == null ? "" : contentType);

                if (body == null || body.trim().isEmpty()) {
                    result.put("data", JSONObject.NULL);
                } else {
                    String trimmed = body.trim();
                    try {
                        if (trimmed.startsWith("[")) result.put("data", new JSONArray(trimmed));
                        else result.put("data", new JSONObject(trimmed));
                    } catch (JSONException jsonError) {
                        // Preserve the upstream HTTP status without reflecting provider
                        // body content back to JavaScript. Many providers return an HTML
                        // error document for 4xx/5xx responses.
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
            } catch (Exception error) {
                // Never echo the requested URL: Xtream URLs can contain credentials.
                call.reject(safeMessage(error));
            } finally {
                if (connection != null) connection.disconnect();
            }
        });
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
        if (host == null || host.isEmpty()) throw new IllegalArgumentException("Provider host is invalid.");

        for (InetAddress address : InetAddress.getAllByName(host)) {
            if (address.isAnyLocalAddress() || address.isLoopbackAddress() ||
                address.isLinkLocalAddress() || address.isSiteLocalAddress() ||
                address.isMulticastAddress()) {
                throw new SecurityException("Private or local provider addresses are not allowed.");
            }
        }
        return uri.toURL();
    }

    private String readBounded(InputStream stream) throws Exception {
        if (stream == null) return "";
        BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8));
        StringBuilder body = new StringBuilder();
        char[] buffer = new char[8192];
        int total = 0;
        int read;
        while ((read = reader.read(buffer)) != -1) {
            total += read;
            if (total > MAX_RESPONSE_BYTES) throw new IllegalStateException("Provider response exceeded the safety limit.");
            body.append(buffer, 0, read);
        }
        return body.toString();
    }

    private String safeMessage(Exception error) {
        if (error instanceof java.net.SocketTimeoutException) return "Provider connection timed out.";
        if (error instanceof java.net.UnknownHostException) return "Provider host could not be resolved.";
        if (error instanceof SecurityException || error instanceof IllegalArgumentException) return error.getMessage();
        return "Native provider request failed.";
    }

    @Override
    protected void handleOnDestroy() {
        executor.shutdownNow();
        super.handleOnDestroy();
    }
}

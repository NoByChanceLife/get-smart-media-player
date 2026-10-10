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
import android.app.AlertDialog;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.StateListDrawable;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Base64;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.Format;
import androidx.media3.common.MediaItem;
import androidx.media3.common.TrackGroup;
import androidx.media3.common.TrackSelectionOverride;
import androidx.media3.common.TrackSelectionParameters;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.Tracks;
import androidx.media3.exoplayer.DefaultLoadControl;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.ui.AspectRatioFrameLayout;
import androidx.media3.ui.PlayerView;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.lang.ref.WeakReference;
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
    private static final String TRANSPORT_BUILD = "GS-NATIVE-XCIPTV-HS14";

    private static final String CREDENTIAL_PREFS = "getsmart_secure_credentials";
    private static final String CREDENTIAL_DRAFT_KEY = "xtream_draft_v1";
    private static final String KEYSTORE_ALIAS = "getsmart_xtream_draft_key_v1";

    private final ExecutorService executor = Executors.newCachedThreadPool();
    private static WeakReference<GetSmartProviderPlugin> activeInstance = new WeakReference<>(null);

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
        activeInstance = new WeakReference<>(this);
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

    private ExoPlayer nativePlayer;
    private PlayerView nativePlayerView;
    private FrameLayout nativePlayerOverlay;
    private FrameLayout nativeOsdOverlay;
    private LinearLayout nativeOsdTop;
    private LinearLayout nativeOsdBottom;
    private TextView nativeChannelView;
    private TextView nativeTitleView;
    private TextView nativeProgramView;
    private TextView nativeNextProgramView;
    private TextView nativeStatusView;
    private TextView nativeProgressView;
    private TextView nativeNumericChannelView;
    private Button nativeGuideButton;
    private Button nativePreviousButton;
    private Button nativeNextButton;
    private Button nativeLastButton;
    private Button nativeSeekBackButton;
    private Button nativeSeekForwardButton;
    private Button nativePlayPauseButton;
    private Button nativeAudioButton;
    private Button nativeSubtitleButton;
    private Button nativeMuteButton;
    private Button nativeVolumeDownButton;
    private Button nativeVolumeUpButton;
    private Button nativeAspectButton;
    private Button nativeStopButton;

    private final Handler nativeUiHandler = new Handler(Looper.getMainLooper());
    private final Runnable hideNativeOsdRunnable = this::hideNativeOsd;
    private final Runnable refreshNativeProgressRunnable = new Runnable() {
        @Override
        public void run() {
            updateNativeProgressText();
            if (nativeOsdVisible && nativePlayerVisible && nativePlayer != null) {
                nativeUiHandler.postDelayed(this, 500L);
            }
        }
    };
    private final Runnable refreshNativeDiagnosticsRunnable = new Runnable() {
        @Override
        public void run() {
            if (nativePlayer != null) {
                maybeResetNativeRecoveryAfterHealthyPlayback();
                maybeRelaxAutoPerformanceMode();
                notifyListeners("playerDiagnostics", buildNativeDiagnostics());
                nativeUiHandler.postDelayed(this, 1000L);
            }
        }
    };
    private final StringBuilder nativeNumericEntry = new StringBuilder();
    private final Runnable commitNativeNumericEntryRunnable = this::commitNativeNumericChannelEntry;

    private String nativePlayerUrl = "";
    private String nativePlayerTitle = "";
    private String nativePlayerMediaType = "";
    private String nativePlayerChannelNumber = "";
    private String nativePlayerCurrentProgram = "";
    private String nativePlayerNextProgram = "";
    private boolean nativePlayerVisible = true;
    private boolean nativeOsdVisible = true;
    private float lastNonZeroVolume = 1.0f;
    private int nativeAspectMode = 0;
    private String preferredAudioLanguage = "";
    private String subtitleDefaultMode = "auto";
    private String preferredSubtitleLanguage = "";

    private String nativePerformanceMode = "auto";
    private String nativeEffectivePerformanceMode = "balanced";
    private String nativeBuiltPerformanceMode = "";
    private String nativeQualityPreference = "auto";
    private int nativeMaxRetryAttempts = 3;
    private int nativeRecoveryAttempt = 0;
    private int nativeRecoveryStage = 0;
    private boolean nativeRebuildAttempted = false;
    private int nativeRebufferCount = 0;
    private boolean nativeEverReady = false;
    private boolean nativeBufferingIncident = false;
    private long nativePlaybackStartedElapsedMs = 0L;
    private long nativeStartupTimeMs = -1L;
    private long nativeLastReadyElapsedMs = 0L;
    private final List<Long> nativeRecentStalls = new ArrayList<>();

    private static final class NativeTrackChoice {
        final TrackGroup group;
        final int trackIndex;
        final String label;
        final boolean selected;

        NativeTrackChoice(TrackGroup group, int trackIndex, String label, boolean selected) {
            this.group = group;
            this.trackIndex = trackIndex;
            this.label = label;
            this.selected = selected;
        }
    }

    private final Player.Listener nativePlayerListener = new Player.Listener() {
        @Override
        public void onPlaybackStateChanged(int playbackState) {
            long now = SystemClock.elapsedRealtime();

            if (playbackState == Player.STATE_BUFFERING) {
                if (nativeEverReady && !nativeBufferingIncident) {
                    nativeBufferingIncident = true;
                    nativeRebufferCount += 1;
                    nativeRecentStalls.add(now);
                    pruneNativeStalls(now);

                    if (
                        "auto".equals(nativePerformanceMode) &&
                        nativeRecentStalls.size() >= 2 &&
                        !"stable".equals(nativeEffectivePerformanceMode)
                    ) {
                        nativeUiHandler.post(() -> {
                            if (nativePlayer != null && "auto".equals(nativePerformanceMode)) {
                                nativeEffectivePerformanceMode = "stable";
                                rebuildNativePlayerForPerformanceMode("auto-stall-adaptation");
                            }
                        });
                    }
                }
            } else if (playbackState == Player.STATE_READY) {
                nativeBufferingIncident = false;
                nativeLastReadyElapsedMs = now;

                if (!nativeEverReady) {
                    nativeEverReady = true;
                    if (nativePlaybackStartedElapsedMs > 0L) {
                        nativeStartupTimeMs = Math.max(0L, now - nativePlaybackStartedElapsedMs);
                    }
                }
            }

            updateNativeOsdText();
            emitPlayerState("playback-state");
            notifyListeners("playerDiagnostics", buildNativeDiagnostics());
        }

        @Override
        public void onIsPlayingChanged(boolean isPlaying) {
            updateNativeOsdText();
            emitPlayerState("is-playing");
            notifyListeners("playerDiagnostics", buildNativeDiagnostics());
        }

        @Override
        public void onPlayWhenReadyChanged(boolean playWhenReady, int reason) {
            updateNativeOsdText();
            emitPlayerState("play-when-ready");
        }

        @Override
        public void onTracksChanged(Tracks tracks) {
            updateNativeOsdText();
            notifyListeners("playerTracks", buildDetailedTrackSummary(tracks));
            notifyListeners("playerDiagnostics", buildNativeDiagnostics());
            emitPlayerState("tracks");
        }

        @Override
        public void onPlayerError(PlaybackException error) {
            updateNativeOsdText();
            showNativeOsd(false);

            if (scheduleNativeRecovery(error)) {
                emitPlayerState("recovering");
                notifyListeners("playerDiagnostics", buildNativeDiagnostics());
                return;
            }

            JSObject payload = new JSObject();
            payload.put("errorCode", error.errorCode);
            payload.put("errorCodeName", error.getErrorCodeName());
            payload.put("message", safePlaybackErrorMessage(error));
            notifyListeners("playerError", payload);
            emitPlayerState("error");
            notifyListeners("playerDiagnostics", buildNativeDiagnostics());
        }
    };

    @PluginMethod
    public void playMedia(PluginCall call) {
        activeInstance = new WeakReference<>(this);
        final String rawUrl = call.getString("url");
        if (rawUrl == null || rawUrl.trim().isEmpty()) {
            call.reject("Missing media URL.");
            return;
        }

        final URL validated;
        try {
            validated = validateHttpUrl(rawUrl);
        } catch (Exception error) {
            call.reject("Invalid media URL.");
            return;
        }

        if (getActivity() == null) {
            call.reject("Android player activity is unavailable.");
            return;
        }

        final String requestedTitle = safeString(call.getString("title"));
        final String requestedMediaType = safeString(call.getString("mediaType"));
        final String requestedChannelNumber = safeString(call.getString("channelNumber"));
        final String requestedCurrentProgram = safeString(call.getString("currentProgram"));
        final String requestedNextProgram = safeString(call.getString("nextProgram"));
        final String requestedAudioLanguage = safeString(call.getString("preferredAudioLanguage"));
        final String requestedSubtitleMode = safeString(call.getString("subtitleDefaultMode"));
        final String requestedSubtitleLanguage = safeString(call.getString("preferredSubtitleLanguage"));
        final String requestedPerformanceMode = safeString(call.getString("performanceMode"));
        final String requestedQualityPreference = safeString(call.getString("qualityPreference"));
        final Integer requestedMaxRetries = call.getInt("maxRetryAttempts");
        final boolean requestedRecovery = call.getBoolean("recovery", false);
        final String requestedUrl = validated.toString();

        getActivity().runOnUiThread(() -> {
            try {
                boolean mediaChanged = !requestedUrl.equals(nativePlayerUrl);

                nativePlayerTitle = requestedTitle;
                nativePlayerMediaType = requestedMediaType;
                nativePlayerChannelNumber = requestedChannelNumber;
                nativePlayerCurrentProgram = requestedCurrentProgram;
                nativePlayerNextProgram = requestedNextProgram;
                preferredAudioLanguage = normalizeLanguageCode(requestedAudioLanguage);
                subtitleDefaultMode = normalizeSubtitleMode(requestedSubtitleMode);
                preferredSubtitleLanguage = normalizeLanguageCode(requestedSubtitleLanguage);

                nativePerformanceMode = normalizePerformanceMode(requestedPerformanceMode);
                nativeEffectivePerformanceMode =
                    "auto".equals(nativePerformanceMode) ? "balanced" : nativePerformanceMode;
                nativeQualityPreference = normalizeQualityPreference(requestedQualityPreference);
                nativeMaxRetryAttempts =
                    requestedMaxRetries == null ? 3 : Math.max(1, Math.min(5, requestedMaxRetries));

                if (!requestedRecovery && mediaChanged) {
                    resetNativePlaybackHealth();
                } else if (requestedRecovery) {
                    nativeRecoveryStage = Math.max(1, nativeRecoveryStage);
                    nativeRecoveryAttempt = 0;
                }

                ensureNativePlayer();
                applyNativeTrackPreferences();
                applyNativeVideoQualityPreference();

                if (mediaChanged) {
                    nativePlayerUrl = requestedUrl;
                    nativePlaybackStartedElapsedMs = SystemClock.elapsedRealtime();
                    nativePlayer.setMediaItem(MediaItem.fromUri(requestedUrl));
                    nativePlayer.prepare();
                    nativePlayer.play();
                } else if (nativePlayer.getPlaybackState() == Player.STATE_IDLE) {
                    nativePlayer.prepare();
                    nativePlayer.play();
                }

                applyNativePlayerVisibility();
                updateNativeOsdText();
                showNativeOsd(true);

                JSObject result = new JSObject();
                result.put("started", true);
                result.put("engine", "androidx-media3-exoplayer-resilient");
                call.resolve(result);
                emitPlayerState("media-selected");
            } catch (Exception error) {
                call.reject("Get Smart native player could not start: " + error.getClass().getSimpleName());
            }
        });
    }

    @PluginMethod
    public void updatePlayerMetadata(PluginCall call) {
        nativePlayerTitle = safeString(call.getString("title"));
        nativePlayerChannelNumber = safeString(call.getString("channelNumber"));
        nativePlayerCurrentProgram = safeString(call.getString("currentProgram"));
        nativePlayerNextProgram = safeString(call.getString("nextProgram"));

        if (getActivity() == null) {
            call.resolve(buildPlayerState("metadata-no-activity"));
            return;
        }

        getActivity().runOnUiThread(() -> {
            updateNativeOsdText();
            call.resolve(buildPlayerState("metadata"));
        });
    }

    @PluginMethod
    public void setTrackPreferences(PluginCall call) {
        preferredAudioLanguage = normalizeLanguageCode(call.getString("preferredAudioLanguage"));
        subtitleDefaultMode = normalizeSubtitleMode(call.getString("subtitleDefaultMode"));
        preferredSubtitleLanguage = normalizeLanguageCode(call.getString("preferredSubtitleLanguage"));

        if (getActivity() == null || nativePlayer == null) {
            JSObject result = new JSObject();
            result.put("applied", false);
            result.put("reason", "no-active-player");
            call.resolve(result);
            return;
        }

        getActivity().runOnUiThread(() -> {
            applyNativeTrackPreferences();
            JSObject result = new JSObject();
            result.put("applied", true);
            result.put("preferredAudioLanguage", preferredAudioLanguage);
            result.put("subtitleDefaultMode", subtitleDefaultMode);
            result.put("preferredSubtitleLanguage", preferredSubtitleLanguage);
            call.resolve(result);
            notifyListeners("playerTracks", buildDetailedTrackSummary(nativePlayer.getCurrentTracks()));
            emitPlayerState("track-preferences");
        });
    }

    @PluginMethod
    public void setPerformanceConfig(PluginCall call) {
        final String requestedMode = normalizePerformanceMode(call.getString("performanceMode"));
        final String requestedQuality = normalizeQualityPreference(call.getString("qualityPreference"));
        final Integer requestedRetries = call.getInt("maxRetryAttempts");

        if (getActivity() == null) {
            JSObject result = new JSObject();
            result.put("applied", false);
            result.put("reason", "no-activity");
            call.resolve(result);
            return;
        }

        getActivity().runOnUiThread(() -> {
            String previousBuiltMode = nativeBuiltPerformanceMode;
            nativePerformanceMode = requestedMode;
            nativeEffectivePerformanceMode =
                "auto".equals(nativePerformanceMode) ? "balanced" : nativePerformanceMode;
            nativeQualityPreference = requestedQuality;
            nativeMaxRetryAttempts =
                requestedRetries == null ? nativeMaxRetryAttempts : Math.max(1, Math.min(5, requestedRetries));

            if (
                nativePlayer != null &&
                !nativeEffectivePerformanceMode.equals(previousBuiltMode)
            ) {
                rebuildNativePlayerForPerformanceMode("settings-change");
            } else {
                applyNativeVideoQualityPreference();
            }

            JSObject result = new JSObject();
            result.put("applied", nativePlayer != null);
            result.put("performanceMode", nativePerformanceMode);
            result.put("effectivePerformanceMode", nativeEffectivePerformanceMode);
            result.put("qualityPreference", nativeQualityPreference);
            result.put("maxRetryAttempts", nativeMaxRetryAttempts);
            call.resolve(result);
            notifyListeners("playerDiagnostics", buildNativeDiagnostics());
        });
    }

    @PluginMethod
    public void getPlayerDiagnostics(PluginCall call) {
        call.resolve(buildNativeDiagnostics());
    }

    @PluginMethod
    public void setPlayerVisible(PluginCall call) {
        nativePlayerVisible = call.getBoolean("visible", true);

        if (getActivity() == null) {
            call.resolve(buildPlayerState("visibility-no-activity"));
            return;
        }

        getActivity().runOnUiThread(() -> {
            applyNativePlayerVisibility();
            call.resolve(buildPlayerState("visibility"));
        });
    }

    @PluginMethod
    public void getPlayerState(PluginCall call) {
        call.resolve(buildPlayerState("query"));
    }

    @PluginMethod
    public void getPlayerTracks(PluginCall call) {
        if (nativePlayer == null) {
            JSObject empty = new JSObject();
            empty.put("audioTracks", new JSONArray());
            empty.put("videoTracks", new JSONArray());
            empty.put("textTracks", new JSONArray());
            call.resolve(empty);
            return;
        }
        call.resolve(buildDetailedTrackSummary(nativePlayer.getCurrentTracks()));
    }

    @PluginMethod
    public void selectPlayerTrack(PluginCall call) {
        if (nativePlayer == null || getActivity() == null) {
            call.reject("No active native player.");
            return;
        }

        final String type = safeString(call.getString("type"));
        final String groupId = safeString(call.getString("groupId"));
        final Integer trackIndex = call.getInt("trackIndex");
        final boolean disabled = call.getBoolean("disabled", false);

        final int trackType =
            "audio".equals(type) ? C.TRACK_TYPE_AUDIO :
            "text".equals(type) ? C.TRACK_TYPE_TEXT :
            "video".equals(type) ? C.TRACK_TYPE_VIDEO :
            C.TRACK_TYPE_UNKNOWN;

        if (trackType == C.TRACK_TYPE_UNKNOWN) {
            call.reject("Unsupported track type.");
            return;
        }

        getActivity().runOnUiThread(() -> {
            try {
                TrackSelectionParameters.Builder builder =
                    nativePlayer.getTrackSelectionParameters().buildUpon();
                builder.clearOverridesOfType(trackType);

                if (disabled) {
                    builder.setTrackTypeDisabled(trackType, true);
                } else {
                    builder.setTrackTypeDisabled(trackType, false);
                    if (!groupId.isEmpty() && trackIndex != null) {
                        NativeTrackChoice choice = findNativeTrackChoice(trackType, groupId, trackIndex);
                        if (choice == null) {
                            call.reject("Requested track is no longer available.");
                            return;
                        }
                        builder.setOverrideForType(
                            new TrackSelectionOverride(choice.group, choice.trackIndex)
                        );
                    }
                }

                nativePlayer.setTrackSelectionParameters(builder.build());
                updateNativeOsdText();
                JSObject result = buildDetailedTrackSummary(nativePlayer.getCurrentTracks());
                call.resolve(result);
                notifyListeners("playerTracks", result);
            } catch (Exception error) {
                call.reject("Unable to select native player track.");
            }
        });
    }

    @PluginMethod
    public void controlMedia(PluginCall call) {
        final String action = safeString(call.getString("action"));

        if (getActivity() == null) {
            call.reject("Android player activity is unavailable.");
            return;
        }

        getActivity().runOnUiThread(() -> {
            if (nativePlayer == null) {
                call.reject("No active native player.");
                return;
            }

            switch (action) {
                case "play":
                    nativePlayer.play();
                    break;
                case "pause":
                    nativePlayer.pause();
                    break;
                case "toggle":
                    if (nativePlayer.isPlaying()) nativePlayer.pause();
                    else nativePlayer.play();
                    break;
                case "mute":
                    if (nativePlayer.getVolume() > 0f) {
                        lastNonZeroVolume = nativePlayer.getVolume();
                    }
                    nativePlayer.setVolume(0f);
                    break;
                case "unmute":
                    nativePlayer.setVolume(lastNonZeroVolume > 0f ? lastNonZeroVolume : 1f);
                    break;
                case "toggleMute":
                    if (nativePlayer.getVolume() > 0f) {
                        lastNonZeroVolume = nativePlayer.getVolume();
                        nativePlayer.setVolume(0f);
                    } else {
                        nativePlayer.setVolume(lastNonZeroVolume > 0f ? lastNonZeroVolume : 1f);
                    }
                    break;
                case "setVolume":
                    Double requestedVolume = call.getDouble("value");
                    float volume = requestedVolume == null
                        ? nativePlayer.getVolume()
                        : Math.max(0f, Math.min(1f, requestedVolume.floatValue()));
                    if (volume > 0f) lastNonZeroVolume = volume;
                    nativePlayer.setVolume(volume);
                    break;
                case "seekBy":
                    Long offsetMs = call.getLong("offsetMs");
                    long offset = offsetMs == null ? 0L : offsetMs;
                    long duration = nativePlayer.getDuration();
                    long target = Math.max(0L, nativePlayer.getCurrentPosition() + offset);
                    if (duration > 0L && duration != C.TIME_UNSET) target = Math.min(duration, target);
                    nativePlayer.seekTo(target);
                    break;
                case "showControls":
                    showNativeOsd(false);
                    break;
                case "hideControls":
                    hideNativeOsd();
                    break;
                default:
                    call.reject("Unsupported native player action.");
                    return;
            }

            updateNativeOsdText();
            JSObject state = buildPlayerState("control-" + action);
            call.resolve(state);
            notifyListeners("playerState", state);
        });
    }

    @PluginMethod
    public void stopMedia(PluginCall call) {
        if (getActivity() == null) {
            releaseNativePlayer();
            call.resolve(new JSObject().put("stopped", true));
            return;
        }

        getActivity().runOnUiThread(() -> {
            releaseNativePlayer();
            JSObject result = new JSObject();
            result.put("stopped", true);
            call.resolve(result);
        });
    }

    private void ensureNativePlayer() {
        if (nativePlayer != null && nativePlayerView != null && nativePlayerOverlay != null) {
            if (!nativeEffectivePerformanceMode.equals(nativeBuiltPerformanceMode)) {
                rebuildNativePlayerForPerformanceMode("ensure-mode-change");
            }
            return;
        }

        nativePlayer = createNativeExoPlayer();

        nativePlayerView = new PlayerView(getActivity());
        nativePlayerView.setUseController(false);
        nativePlayerView.setPlayer(nativePlayer);
        nativePlayerView.setFocusable(true);
        nativePlayerView.setFocusableInTouchMode(true);
        nativePlayerView.setBackgroundColor(Color.BLACK);
        nativePlayerView.setKeepScreenOn(true);

        nativePlayerOverlay = new FrameLayout(getActivity());
        nativePlayerOverlay.setBackgroundColor(Color.BLACK);
        nativePlayerOverlay.addView(
            nativePlayerView,
            new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        );

        buildNativeOsd();
        nativePlayerOverlay.addView(
            nativeOsdOverlay,
            new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        );

        Window window = getActivity().getWindow();
        ViewGroup decor = (ViewGroup) window.getDecorView();
        decor.addView(
            nativePlayerOverlay,
            new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        );

        nativePlayerView.setOnClickListener((view) -> showNativeOsd(true));
        nativePlayerOverlay.setOnClickListener((view) -> showNativeOsd(true));
        nativePlayerView.setOnKeyListener((view, keyCode, event) ->
            handleNativePlayerKeyEvent(event)
        );

        nativeUiHandler.removeCallbacks(refreshNativeDiagnosticsRunnable);
        nativeUiHandler.post(refreshNativeDiagnosticsRunnable);

        applyNativePlayerVisibility();
        updateNativeOsdText();
    }

    private ExoPlayer createNativeExoPlayer() {
        ExoPlayer player = new ExoPlayer.Builder(getActivity())
            .setLoadControl(buildNativeLoadControl())
            .build();

        player.setAudioAttributes(
            new AudioAttributes.Builder()
                .setUsage(C.USAGE_MEDIA)
                .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
                .build(),
            true
        );
        player.addListener(nativePlayerListener);
        nativeBuiltPerformanceMode = nativeEffectivePerformanceMode;
        return player;
    }

    private DefaultLoadControl buildNativeLoadControl() {
        boolean live = "live".equals(nativePlayerMediaType);

        int minBufferMs;
        int maxBufferMs;
        int bufferForPlaybackMs;
        int bufferAfterRebufferMs;

        switch (nativeEffectivePerformanceMode) {
            case "fast":
                minBufferMs = live ? 2_000 : 8_000;
                maxBufferMs = live ? 6_000 : 25_000;
                bufferForPlaybackMs = 500;
                bufferAfterRebufferMs = 1_000;
                break;
            case "stable":
                minBufferMs = live ? 18_000 : 35_000;
                maxBufferMs = live ? 35_000 : 90_000;
                bufferForPlaybackMs = live ? 2_500 : 3_000;
                bufferAfterRebufferMs = live ? 5_000 : 6_000;
                break;
            case "balanced":
            default:
                minBufferMs = live ? 7_000 : 18_000;
                maxBufferMs = live ? 15_000 : 45_000;
                bufferForPlaybackMs = live ? 1_200 : 1_500;
                bufferAfterRebufferMs = live ? 2_500 : 3_000;
                break;
        }

        return new DefaultLoadControl.Builder()
            .setBufferDurationsMs(
                minBufferMs,
                maxBufferMs,
                bufferForPlaybackMs,
                bufferAfterRebufferMs
            )
            .setPrioritizeTimeOverSizeThresholds(true)
            .build();
    }

    private void rebuildNativePlayerForPerformanceMode(String reason) {
        if (nativePlayer == null || getActivity() == null) return;

        MediaItem mediaItem = nativePlayer.getCurrentMediaItem();
        long position = Math.max(0L, nativePlayer.getCurrentPosition());
        boolean playWhenReady = nativePlayer.getPlayWhenReady();
        float volume = nativePlayer.getVolume();

        nativePlayer.removeListener(nativePlayerListener);
        nativePlayer.release();
        nativePlayer = createNativeExoPlayer();

        if (nativePlayerView != null) {
            nativePlayerView.setPlayer(nativePlayer);
        }

        nativePlayer.setVolume(volume);
        applyNativeTrackPreferences();
        applyNativeVideoQualityPreference();

        if (mediaItem != null) {
            nativePlaybackStartedElapsedMs = SystemClock.elapsedRealtime();
            nativePlayer.setMediaItem(mediaItem, position);
            nativePlayer.prepare();
            if (playWhenReady) nativePlayer.play();
        }

        emitPlayerState("performance-rebuild-" + reason);
        notifyListeners("playerDiagnostics", buildNativeDiagnostics());
    }

    private void buildNativeOsd() {
        nativeOsdOverlay = new FrameLayout(getActivity());
        nativeOsdOverlay.setClickable(false);
        nativeOsdOverlay.setFocusable(false);

        nativeOsdTop = new LinearLayout(getActivity());
        nativeOsdTop.setOrientation(LinearLayout.VERTICAL);
        nativeOsdTop.setPadding(dp(26), dp(22), dp(26), dp(18));
        nativeOsdTop.setBackground(makeGradient(
            new int[] { Color.argb(235, 3, 12, 22), Color.argb(165, 3, 12, 22), Color.TRANSPARENT },
            GradientDrawable.Orientation.TOP_BOTTOM
        ));

        LinearLayout topTitleRow = new LinearLayout(getActivity());
        topTitleRow.setOrientation(LinearLayout.HORIZONTAL);
        topTitleRow.setGravity(Gravity.CENTER_VERTICAL);

        nativeChannelView = makeText("", 13f, Color.rgb(120, 193, 255), true);
        nativeChannelView.setPadding(0, 0, dp(14), 0);
        nativeTitleView = makeText("", 21f, Color.WHITE, true);

        topTitleRow.addView(nativeChannelView);
        topTitleRow.addView(
            nativeTitleView,
            new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        );

        nativeStatusView = makeText("LIVE", 11f, Color.WHITE, true);
        nativeStatusView.setGravity(Gravity.CENTER);
        nativeStatusView.setPadding(dp(10), dp(4), dp(10), dp(4));
        nativeStatusView.setBackground(makeRounded(Color.rgb(193, 48, 67), dp(7)));
        topTitleRow.addView(nativeStatusView);

        nativeProgramView = makeText("", 14f, Color.rgb(226, 232, 240), true);
        nativeProgramView.setPadding(0, dp(7), 0, 0);
        nativeNextProgramView = makeText("", 12f, Color.rgb(148, 163, 184), false);
        nativeNextProgramView.setPadding(0, dp(3), 0, 0);

        nativeOsdTop.addView(topTitleRow);
        nativeOsdTop.addView(nativeProgramView);
        nativeOsdTop.addView(nativeNextProgramView);

        FrameLayout.LayoutParams topParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            Gravity.TOP
        );
        nativeOsdOverlay.addView(nativeOsdTop, topParams);

        nativeNumericChannelView = makeText("", 34f, Color.WHITE, true);
        nativeNumericChannelView.setGravity(Gravity.CENTER);
        nativeNumericChannelView.setPadding(dp(22), dp(12), dp(22), dp(12));
        nativeNumericChannelView.setBackground(makeRounded(Color.argb(235, 3, 12, 22), dp(12)));
        nativeNumericChannelView.setVisibility(View.GONE);
        FrameLayout.LayoutParams numericParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            Gravity.CENTER
        );
        nativeOsdOverlay.addView(nativeNumericChannelView, numericParams);

        nativeOsdBottom = new LinearLayout(getActivity());
        nativeOsdBottom.setOrientation(LinearLayout.VERTICAL);
        nativeOsdBottom.setGravity(Gravity.CENTER);
        nativeOsdBottom.setPadding(dp(14), dp(14), dp(14), dp(18));
        nativeOsdBottom.setBackground(makeGradient(
            new int[] { Color.TRANSPARENT, Color.argb(170, 3, 12, 22), Color.argb(245, 3, 12, 22) },
            GradientDrawable.Orientation.TOP_BOTTOM
        ));

        nativeProgressView = makeText("", 12f, Color.rgb(203, 213, 225), false);
        nativeProgressView.setGravity(Gravity.CENTER);
        nativeProgressView.setPadding(0, 0, 0, dp(8));
        nativeOsdBottom.addView(
            nativeProgressView,
            new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            )
        );

        LinearLayout primaryControls = new LinearLayout(getActivity());
        primaryControls.setOrientation(LinearLayout.HORIZONTAL);
        primaryControls.setGravity(Gravity.CENTER);

        nativeGuideButton = makeOsdButton("Guide");
        nativePreviousButton = makeOsdButton("◀ Channel");
        nativeSeekBackButton = makeOsdButton("−10s");
        nativePlayPauseButton = makeOsdButton("Pause");
        nativeSeekForwardButton = makeOsdButton("+10s");
        nativeNextButton = makeOsdButton("Channel ▶");
        nativeLastButton = makeOsdButton("Last");
        nativeStopButton = makeOsdButton("Stop");

        nativeGuideButton.setOnClickListener((v) -> {
            emitPlayerCommand("guide");
            scheduleNativeOsdHide();
        });
        nativePreviousButton.setOnClickListener((v) -> {
            emitPlayerCommand("channelPrevious");
            showNativeOsd(true);
        });
        nativeSeekBackButton.setOnClickListener((v) -> {
            seekNativeBy(-10_000L);
            showNativeOsd(true);
        });
        nativePlayPauseButton.setOnClickListener((v) -> {
            if (nativePlayer != null) {
                if (nativePlayer.isPlaying()) nativePlayer.pause();
                else nativePlayer.play();
                updateNativeOsdText();
                scheduleNativeOsdHide();
            }
        });
        nativeSeekForwardButton.setOnClickListener((v) -> {
            seekNativeBy(10_000L);
            showNativeOsd(true);
        });
        nativeNextButton.setOnClickListener((v) -> {
            emitPlayerCommand("channelNext");
            showNativeOsd(true);
        });
        nativeLastButton.setOnClickListener((v) -> {
            emitPlayerCommand("lastChannel");
            showNativeOsd(true);
        });
        nativeStopButton.setOnClickListener((v) -> emitPlayerCommand("stop"));

        for (Button button : new Button[] {
            nativeGuideButton,
            nativePreviousButton,
            nativeSeekBackButton,
            nativePlayPauseButton,
            nativeSeekForwardButton,
            nativeNextButton,
            nativeLastButton,
            nativeStopButton
        }) {
            addOsdButton(primaryControls, button);
        }
        nativeOsdBottom.addView(primaryControls);

        LinearLayout secondaryControls = new LinearLayout(getActivity());
        secondaryControls.setOrientation(LinearLayout.HORIZONTAL);
        secondaryControls.setGravity(Gravity.CENTER);
        secondaryControls.setPadding(0, dp(7), 0, 0);

        nativeAudioButton = makeOsdButton("Audio");
        nativeSubtitleButton = makeOsdButton("CC");
        nativeMuteButton = makeOsdButton("Mute");
        nativeVolumeDownButton = makeOsdButton("Vol −");
        nativeVolumeUpButton = makeOsdButton("Vol +");
        nativeAspectButton = makeOsdButton("Fit");

        nativeAudioButton.setOnClickListener((v) -> showNativeTrackDialog(C.TRACK_TYPE_AUDIO, "Audio Track"));
        nativeSubtitleButton.setOnClickListener((v) -> showNativeTrackDialog(C.TRACK_TYPE_TEXT, "Subtitles & Captions"));
        nativeMuteButton.setOnClickListener((v) -> {
            toggleNativeMute();
            showNativeOsd(true);
        });
        nativeVolumeDownButton.setOnClickListener((v) -> {
            changeNativeVolume(-0.10f);
            showNativeOsd(true);
        });
        nativeVolumeUpButton.setOnClickListener((v) -> {
            changeNativeVolume(0.10f);
            showNativeOsd(true);
        });
        nativeAspectButton.setOnClickListener((v) -> {
            cycleNativeAspectRatio();
            showNativeOsd(true);
        });

        for (Button button : new Button[] {
            nativeAudioButton,
            nativeSubtitleButton,
            nativeMuteButton,
            nativeVolumeDownButton,
            nativeVolumeUpButton,
            nativeAspectButton
        }) {
            addOsdButton(secondaryControls, button);
        }
        nativeOsdBottom.addView(secondaryControls);

        FrameLayout.LayoutParams bottomParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            Gravity.BOTTOM
        );
        nativeOsdOverlay.addView(nativeOsdBottom, bottomParams);
    }

    private void addOsdButton(LinearLayout row, Button button) {
        LinearLayout.LayoutParams buttonParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            dp(44)
        );
        buttonParams.setMargins(dp(4), 0, dp(4), 0);
        row.addView(button, buttonParams);
    }

    private Button makeOsdButton(String label) {
        Button button = new Button(getActivity());
        button.setText(label);
        button.setTextColor(Color.WHITE);
        button.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        button.setAllCaps(false);
        button.setMinWidth(dp(82));
        button.setPadding(dp(14), 0, dp(14), 0);
        button.setFocusable(true);
        button.setFocusableInTouchMode(false);
        button.setOnFocusChangeListener((view, hasFocus) -> {
            if (hasFocus) {
                nativeUiHandler.removeCallbacks(hideNativeOsdRunnable);
            } else if (nativeOsdVisible) {
                scheduleNativeOsdHide();
            }
        });

        StateListDrawable states = new StateListDrawable();
        states.addState(
            new int[] { android.R.attr.state_focused },
            makeRounded(Color.rgb(11, 99, 246), dp(9))
        );
        states.addState(
            new int[] { android.R.attr.state_pressed },
            makeRounded(Color.rgb(45, 135, 255), dp(9))
        );
        states.addState(
            new int[] {},
            makeRounded(Color.argb(205, 18, 35, 52), dp(9))
        );
        button.setBackground(states);
        return button;
    }

    private TextView makeText(String text, float sp, int color, boolean bold) {
        TextView view = new TextView(getActivity());
        view.setText(text);
        view.setTextColor(color);
        view.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        if (bold) view.setTypeface(view.getTypeface(), android.graphics.Typeface.BOLD);
        view.setSingleLine(true);
        view.setEllipsize(android.text.TextUtils.TruncateAt.END);
        return view;
    }

    private GradientDrawable makeRounded(int color, int radiusPx) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(radiusPx);
        return drawable;
    }

    private GradientDrawable makeGradient(int[] colors, GradientDrawable.Orientation orientation) {
        return new GradientDrawable(orientation, colors);
    }

    private int dp(int value) {
        float density = getContext().getResources().getDisplayMetrics().density;
        return Math.round(value * density);
    }

    private String normalizeLanguageCode(String value) {
        String normalized = safeString(value).trim().toLowerCase(Locale.US);
        return "auto".equals(normalized) ? "" : normalized;
    }

    private String normalizeSubtitleMode(String value) {
        String normalized = safeString(value).trim().toLowerCase(Locale.US);
        if ("off".equals(normalized) || "preferred".equals(normalized)) {
            return normalized;
        }
        return "auto";
    }

    private void applyNativeTrackPreferences() {
        if (nativePlayer == null) return;

        TrackSelectionParameters.Builder builder =
            nativePlayer.getTrackSelectionParameters().buildUpon();

        // Explicit saved preferences control new media selections. Temporary
        // in-player track overrides are intentionally not promoted to settings.
        builder.clearOverridesOfType(C.TRACK_TYPE_AUDIO);
        builder.clearOverridesOfType(C.TRACK_TYPE_TEXT);

        if (preferredAudioLanguage.isEmpty()) {
            builder.setPreferredAudioLanguages(new String[0]);
        } else {
            builder.setPreferredAudioLanguages(preferredAudioLanguage);
        }

        if ("off".equals(subtitleDefaultMode)) {
            builder.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true);
            builder.setPreferredTextLanguages(new String[0]);
        } else {
            builder.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, false);
            if ("preferred".equals(subtitleDefaultMode) && !preferredSubtitleLanguage.isEmpty()) {
                builder.setPreferredTextLanguages(preferredSubtitleLanguage);
            } else {
                builder.setPreferredTextLanguages(new String[0]);
            }
        }

        nativePlayer.setTrackSelectionParameters(builder.build());
    }

    private String normalizePerformanceMode(String value) {
        String normalized = safeString(value).trim().toLowerCase(Locale.US);
        if ("fast".equals(normalized) || "balanced".equals(normalized) || "stable".equals(normalized)) {
            return normalized;
        }
        return "auto";
    }

    private String normalizeQualityPreference(String value) {
        String normalized = safeString(value).trim().toLowerCase(Locale.US);
        if (
            "1080p".equals(normalized) ||
            "720p".equals(normalized) ||
            "480p".equals(normalized) ||
            "low".equals(normalized)
        ) {
            return normalized;
        }
        return "auto";
    }

    private void applyNativeVideoQualityPreference() {
        if (nativePlayer == null) return;

        TrackSelectionParameters.Builder builder =
            nativePlayer.getTrackSelectionParameters().buildUpon();
        builder.clearOverridesOfType(C.TRACK_TYPE_VIDEO);
        builder.setForceLowestBitrate(false);
        builder.setMaxVideoSize(Integer.MAX_VALUE, Integer.MAX_VALUE);

        switch (nativeQualityPreference) {
            case "1080p":
                builder.setMaxVideoSize(1920, 1080);
                break;
            case "720p":
                builder.setMaxVideoSize(1280, 720);
                break;
            case "480p":
                builder.setMaxVideoSize(854, 480);
                break;
            case "low":
                builder.setForceLowestBitrate(true);
                break;
            case "auto":
            default:
                break;
        }

        nativePlayer.setTrackSelectionParameters(builder.build());
    }

    private void resetNativePlaybackHealth() {
        nativeRecoveryAttempt = 0;
        nativeRecoveryStage = 0;
        nativeRebuildAttempted = false;
        nativeRebufferCount = 0;
        nativeEverReady = false;
        nativeBufferingIncident = false;
        nativePlaybackStartedElapsedMs = SystemClock.elapsedRealtime();
        nativeStartupTimeMs = -1L;
        nativeLastReadyElapsedMs = 0L;
        nativeRecentStalls.clear();
    }

    private void pruneNativeStalls(long now) {
        for (int i = nativeRecentStalls.size() - 1; i >= 0; i--) {
            if (now - nativeRecentStalls.get(i) > 60_000L) {
                nativeRecentStalls.remove(i);
            }
        }
    }

    private void maybeResetNativeRecoveryAfterHealthyPlayback() {
        if (nativePlayer == null || nativeRecoveryStage == 0) return;
        if (!nativePlayer.isPlaying() || nativeLastReadyElapsedMs <= 0L) return;

        long now = SystemClock.elapsedRealtime();
        if (now - nativeLastReadyElapsedMs >= 30_000L) {
            nativeRecoveryAttempt = 0;
            nativeRecoveryStage = 0;
            nativeRebuildAttempted = false;
        }
    }

    private void maybeRelaxAutoPerformanceMode() {
        if (
            nativePlayer == null ||
            !"auto".equals(nativePerformanceMode) ||
            !"stable".equals(nativeEffectivePerformanceMode) ||
            !nativePlayer.isPlaying()
        ) {
            return;
        }

        long now = SystemClock.elapsedRealtime();
        pruneNativeStalls(now);

        if (
            nativeRecentStalls.isEmpty() &&
            nativeLastReadyElapsedMs > 0L &&
            now - nativeLastReadyElapsedMs >= 75_000L
        ) {
            nativeEffectivePerformanceMode = "balanced";
            rebuildNativePlayerForPerformanceMode("auto-stable-recovery");
        }
    }

    private boolean scheduleNativeRecovery(PlaybackException error) {
        if (nativePlayer == null) return false;

        if (nativeRecoveryAttempt < nativeMaxRetryAttempts) {
            nativeRecoveryAttempt += 1;
            int attempt = nativeRecoveryAttempt;
            long delayMs = Math.min(8_000L, 1_000L << Math.min(3, attempt - 1));

            nativeUiHandler.postDelayed(() -> {
                if (nativePlayer == null) return;
                try {
                    nativePlayer.prepare();
                    nativePlayer.play();
                    emitPlayerState("recovery-retry-" + attempt);
                } catch (Exception ignored) {
                }
            }, delayMs);
            return true;
        }

        if (nativeRecoveryStage == 0) {
            nativeRecoveryStage = 1;
            nativeRecoveryAttempt = 0;
            emitPlayerCommand("recoverStream", "reresolve");

            // If the React/provider resolver cannot answer, do not hang forever.
            nativeUiHandler.postDelayed(() -> {
                if (
                    nativePlayer != null &&
                    nativeRecoveryStage == 1 &&
                    nativePlayer.getPlaybackState() == Player.STATE_IDLE
                ) {
                    nativeRecoveryStage = 2;
                    nativeRebuildAttempted = true;
                    rebuildNativePlayerForPerformanceMode("recovery-fallback-rebuild");
                }
            }, 5_000L);
            return true;
        }

        if (!nativeRebuildAttempted) {
            nativeRecoveryStage = 2;
            nativeRecoveryAttempt = 0;
            nativeRebuildAttempted = true;
            nativeUiHandler.post(() ->
                rebuildNativePlayerForPerformanceMode("recovery-player-rebuild")
            );
            return true;
        }

        return false;
    }

    private Format getSelectedVideoFormat() {
        if (nativePlayer == null) return null;

        Tracks tracks = nativePlayer.getCurrentTracks();
        for (Tracks.Group group : tracks.getGroups()) {
            if (group.getType() != C.TRACK_TYPE_VIDEO) continue;
            for (int i = 0; i < group.length; i++) {
                if (group.isTrackSelected(i)) return group.getTrackFormat(i);
            }
        }
        return null;
    }

    private String inferNativeProtocol() {
        String lower = nativePlayerUrl.toLowerCase(Locale.US);
        if (lower.contains(".m3u8")) return "HLS";
        if (lower.contains(".mpd")) return "DASH";
        if (lower.matches(".*\\.ts(?:$|[?#]).*")) return "MPEG-TS";
        if (lower.contains(".mp4")) return "MP4 / Progressive";
        if (lower.startsWith("https://")) return "HTTPS media";
        if (lower.startsWith("http://")) return "HTTP media";
        return "Media3 source";
    }

    private String nativeHealthRating(double bufferedSeconds) {
        if (nativeRecoveryStage > 0 || nativeRecentStalls.size() >= 2) return "poor";
        if (nativePlayer != null && nativePlayer.getPlaybackState() == Player.STATE_BUFFERING) return "fair";
        if (bufferedSeconds >= 5.0) return "optimal";
        if (bufferedSeconds >= 2.0) return "good";
        return "fair";
    }

    private String nativeDiagnosticMessage(double bufferedSeconds) {
        if (nativeRecoveryStage == 1) {
            return "Re-resolving the same selected stream after bounded player retries.";
        }
        if (nativeRecoveryStage >= 2) {
            return "Rebuilding the Media3 player for the same selected stream.";
        }
        if (nativeRecoveryAttempt > 0) {
            return "Retrying the same selected stream (" + nativeRecoveryAttempt + "/" + nativeMaxRetryAttempts + ").";
        }
        if (
            "auto".equals(nativePerformanceMode) &&
            "stable".equals(nativeEffectivePerformanceMode)
        ) {
            return "Auto mode increased the native buffer after repeated stalls.";
        }
        if (nativePlayer != null && nativePlayer.getPlaybackState() == Player.STATE_BUFFERING) {
            return "Media3 is buffering the selected stream.";
        }
        if (bufferedSeconds < 2.0 && nativePlayer != null && nativePlayer.isPlaying()) {
            return "Playback is active with a small forward buffer.";
        }
        return "Native Media3 playback is healthy on the selected stream.";
    }

    private JSObject buildNativeDiagnostics() {
        pruneNativeStalls(SystemClock.elapsedRealtime());
        JSObject diagnostics = new JSObject();
        diagnostics.put("active", nativePlayer != null);
        diagnostics.put("state", nativePlayer == null ? "idle" : playbackStateName(nativePlayer.getPlaybackState()));
        diagnostics.put("performanceMode", nativePerformanceMode);
        diagnostics.put("effectivePerformanceMode", nativeEffectivePerformanceMode);
        diagnostics.put("qualityPreference", nativeQualityPreference);
        diagnostics.put("maxRetryAttempts", nativeMaxRetryAttempts);
        diagnostics.put("recoveryAttempt", nativeRecoveryAttempt);
        diagnostics.put("recoveryStage", nativeRecoveryStage);
        diagnostics.put("rebufferCount", nativeRebufferCount);
        diagnostics.put("startupTimeMs", nativeStartupTimeMs >= 0L ? nativeStartupTimeMs : 0L);
        diagnostics.put("protocol", inferNativeProtocol());
        diagnostics.put("estimatedBandwidthBps", 0);
        diagnostics.put("estimatedBandwidthAvailable", false);
        diagnostics.put("droppedFrames", 0);
        diagnostics.put("totalFrames", 0);
        diagnostics.put("droppedFramesAvailable", false);

        if (nativePlayer == null) {
            diagnostics.put("bufferedSeconds", 0.0);
            diagnostics.put("bitrateBps", 0);
            diagnostics.put("width", 0);
            diagnostics.put("height", 0);
            diagnostics.put("resolution", "—");
            diagnostics.put("healthRating", "good");
            diagnostics.put("diagnosticMessage", "No active native playback session.");
            return diagnostics;
        }

        long position = Math.max(0L, nativePlayer.getCurrentPosition());
        long bufferedPosition = Math.max(position, nativePlayer.getBufferedPosition());
        double bufferedSeconds = Math.max(0.0, (bufferedPosition - position) / 1000.0);
        Format selectedVideo = getSelectedVideoFormat();

        int width = selectedVideo != null && selectedVideo.width > 0 ? selectedVideo.width : 0;
        int height = selectedVideo != null && selectedVideo.height > 0 ? selectedVideo.height : 0;
        int bitrate = selectedVideo != null && selectedVideo.bitrate > 0 ? selectedVideo.bitrate : 0;

        diagnostics.put("bufferedSeconds", bufferedSeconds);
        diagnostics.put("bitrateBps", bitrate);
        diagnostics.put("width", width);
        diagnostics.put("height", height);
        diagnostics.put("resolution", width > 0 && height > 0 ? width + "x" + height : "—");
        diagnostics.put("healthRating", nativeHealthRating(bufferedSeconds));
        diagnostics.put("diagnosticMessage", nativeDiagnosticMessage(bufferedSeconds));

        JSONArray levels = new JSONArray();
        int levelId = 0;
        for (Tracks.Group group : nativePlayer.getCurrentTracks().getGroups()) {
            if (group.getType() != C.TRACK_TYPE_VIDEO) continue;
            for (int i = 0; i < group.length; i++) {
                Format format = group.getTrackFormat(i);
                JSONObject level = new JSONObject();
                try {
                    level.put("id", levelId++);
                    level.put("name", format.height > 0 ? format.height + "p" : "Video Track");
                    level.put("width", format.width > 0 ? format.width : 0);
                    level.put("height", format.height > 0 ? format.height : 0);
                    level.put("bitrate", format.bitrate > 0 ? format.bitrate : 0);
                    level.put("selected", group.isTrackSelected(i));
                    level.put("supported", group.isTrackSupported(i));
                    levels.put(level);
                } catch (JSONException ignored) {
                }
            }
        }
        diagnostics.put("availableLevels", levels);
        return diagnostics;
    }

    private void seekNativeBy(long offsetMs) {
        if (nativePlayer == null) return;
        long duration = nativePlayer.getDuration();
        long target = Math.max(0L, nativePlayer.getCurrentPosition() + offsetMs);
        if (duration > 0L && duration != C.TIME_UNSET) {
            target = Math.min(duration, target);
        }
        nativePlayer.seekTo(target);
        updateNativeProgressText();
    }

    private void toggleNativeMute() {
        if (nativePlayer == null) return;
        if (nativePlayer.getVolume() > 0f) {
            lastNonZeroVolume = nativePlayer.getVolume();
            nativePlayer.setVolume(0f);
        } else {
            nativePlayer.setVolume(lastNonZeroVolume > 0f ? lastNonZeroVolume : 1f);
        }
        updateNativeOsdText();
    }

    private void changeNativeVolume(float delta) {
        if (nativePlayer == null) return;
        float next = Math.max(0f, Math.min(1f, nativePlayer.getVolume() + delta));
        if (next > 0f) lastNonZeroVolume = next;
        nativePlayer.setVolume(next);
        updateNativeOsdText();
    }

    private void cycleNativeAspectRatio() {
        if (nativePlayerView == null) return;
        nativeAspectMode = (nativeAspectMode + 1) % 3;
        if (nativeAspectMode == 0) {
            nativePlayerView.setResizeMode(AspectRatioFrameLayout.RESIZE_MODE_FIT);
        } else if (nativeAspectMode == 1) {
            nativePlayerView.setResizeMode(AspectRatioFrameLayout.RESIZE_MODE_FILL);
        } else {
            nativePlayerView.setResizeMode(AspectRatioFrameLayout.RESIZE_MODE_ZOOM);
        }
        updateNativeOsdText();
    }

    private String nativeAspectLabel() {
        if (nativeAspectMode == 1) return "Fill";
        if (nativeAspectMode == 2) return "Zoom";
        return "Fit";
    }

    private String formatNativeTime(long ms) {
        if (ms < 0L || ms == C.TIME_UNSET) return "00:00";
        long totalSeconds = ms / 1000L;
        long hours = totalSeconds / 3600L;
        long minutes = (totalSeconds % 3600L) / 60L;
        long seconds = totalSeconds % 60L;
        if (hours > 0L) {
            return String.format(Locale.US, "%d:%02d:%02d", hours, minutes, seconds);
        }
        return String.format(Locale.US, "%02d:%02d", minutes, seconds);
    }

    private void updateNativeProgressText() {
        if (nativeProgressView == null || nativePlayer == null) return;
        boolean isLive = "live".equals(nativePlayerMediaType);
        long duration = nativePlayer.getDuration();

        if (isLive || duration <= 0L || duration == C.TIME_UNSET) {
            nativeProgressView.setText("");
            nativeProgressView.setVisibility(View.GONE);
            return;
        }

        nativeProgressView.setVisibility(View.VISIBLE);
        nativeProgressView.setText(
            formatNativeTime(nativePlayer.getCurrentPosition()) +
            "  /  " +
            formatNativeTime(duration)
        );
    }

    private int numericDigitFromKeyCode(int keyCode) {
        if (keyCode >= KeyEvent.KEYCODE_0 && keyCode <= KeyEvent.KEYCODE_9) {
            return keyCode - KeyEvent.KEYCODE_0;
        }
        if (keyCode >= KeyEvent.KEYCODE_NUMPAD_0 && keyCode <= KeyEvent.KEYCODE_NUMPAD_9) {
            return keyCode - KeyEvent.KEYCODE_NUMPAD_0;
        }
        return -1;
    }

    private void appendNativeNumericChannelDigit(int digit) {
        if (!"live".equals(nativePlayerMediaType) || digit < 0 || digit > 9) return;
        if (nativeNumericEntry.length() >= 6) {
            nativeNumericEntry.setLength(0);
        }
        nativeNumericEntry.append(digit);
        nativeUiHandler.removeCallbacks(commitNativeNumericEntryRunnable);

        if (nativeNumericChannelView != null) {
            nativeNumericChannelView.setText(nativeNumericEntry.toString());
            nativeNumericChannelView.setVisibility(View.VISIBLE);
        }

        showNativeOsd(false);
        nativeUiHandler.postDelayed(commitNativeNumericEntryRunnable, 1500L);
    }

    private void commitNativeNumericChannelEntry() {
        if (nativeNumericEntry.length() == 0) return;
        String value = nativeNumericEntry.toString();
        nativeNumericEntry.setLength(0);
        if (nativeNumericChannelView != null) {
            nativeNumericChannelView.setVisibility(View.GONE);
            nativeNumericChannelView.setText("");
        }
        emitPlayerCommand("numericChannel", value);
        scheduleNativeOsdHide();
    }

    private void updateNativeOsdText() {
        if (getActivity() == null) return;
        getActivity().runOnUiThread(() -> {
            if (nativeTitleView == null) return;

            String channelPrefix = nativePlayerChannelNumber.isEmpty()
                ? ""
                : "CH " + nativePlayerChannelNumber;
            nativeChannelView.setText(channelPrefix);
            nativeTitleView.setText(nativePlayerTitle.isEmpty() ? "Get Smart Player" : nativePlayerTitle);

            String current = nativePlayerCurrentProgram.isEmpty()
                ? ("live".equals(nativePlayerMediaType) ? "Live programming" : "")
                : nativePlayerCurrentProgram;
            nativeProgramView.setText(current);

            String next = nativePlayerNextProgram.isEmpty()
                ? ""
                : "Up Next  •  " + nativePlayerNextProgram;
            nativeNextProgramView.setText(next);

            boolean isLive = "live".equals(nativePlayerMediaType);
            nativeStatusView.setText(isLive ? "LIVE" : playbackStateName(
                nativePlayer == null ? Player.STATE_IDLE : nativePlayer.getPlaybackState()
            ).toUpperCase(Locale.US));
            nativeStatusView.setBackground(
                makeRounded(
                    isLive ? Color.rgb(193, 48, 67) : Color.rgb(11, 99, 246),
                    dp(7)
                )
            );

            boolean liveControls = "live".equals(nativePlayerMediaType);
            if (nativeGuideButton != null) nativeGuideButton.setVisibility(liveControls ? View.VISIBLE : View.GONE);
            if (nativePreviousButton != null) nativePreviousButton.setVisibility(liveControls ? View.VISIBLE : View.GONE);
            if (nativeNextButton != null) nativeNextButton.setVisibility(liveControls ? View.VISIBLE : View.GONE);
            if (nativeLastButton != null) nativeLastButton.setVisibility(liveControls ? View.VISIBLE : View.GONE);
            if (nativeSeekBackButton != null) nativeSeekBackButton.setVisibility(liveControls ? View.GONE : View.VISIBLE);
            if (nativeSeekForwardButton != null) nativeSeekForwardButton.setVisibility(liveControls ? View.GONE : View.VISIBLE);

            if (nativePlayPauseButton != null && nativePlayer != null) {
                nativePlayPauseButton.setText(nativePlayer.isPlaying() ? "Pause" : "Play");
            }

            if (nativeMuteButton != null && nativePlayer != null) {
                int percent = Math.round(nativePlayer.getVolume() * 100f);
                nativeMuteButton.setText(percent == 0 ? "Unmute" : "Mute " + percent + "%");
            }

            if (nativeAspectButton != null) {
                nativeAspectButton.setText(nativeAspectLabel());
            }

            updateNativeProgressText();

            if (nativeAudioButton != null && nativePlayer != null) {
                int count = countTracks(nativePlayer.getCurrentTracks(), C.TRACK_TYPE_AUDIO);
                nativeAudioButton.setText(count > 1 ? "Audio (" + count + ")" : "Audio");
            }

            if (nativeSubtitleButton != null && nativePlayer != null) {
                int count = countTracks(nativePlayer.getCurrentTracks(), C.TRACK_TYPE_TEXT);
                nativeSubtitleButton.setText(count > 0 ? "CC (" + count + ")" : "CC");
                nativeSubtitleButton.setEnabled(count > 0);
                nativeSubtitleButton.setAlpha(count > 0 ? 1f : 0.45f);
            }
        });
    }

    private void showNativeOsd(boolean autoHide) {
        nativeUiHandler.removeCallbacks(hideNativeOsdRunnable);
        nativeUiHandler.removeCallbacks(refreshNativeProgressRunnable);
        nativeOsdVisible = true;
        if (nativeOsdOverlay != null) {
            nativeOsdOverlay.setVisibility(View.VISIBLE);
            nativeOsdOverlay.setClickable(true);
        }
        updateNativeOsdText();
        nativeUiHandler.post(refreshNativeProgressRunnable);

        if (nativePlayPauseButton != null) {
            nativePlayPauseButton.requestFocus();
        }

        if (autoHide) {
            scheduleNativeOsdHide();
        }
    }

    private void scheduleNativeOsdHide() {
        nativeUiHandler.removeCallbacks(hideNativeOsdRunnable);
        nativeUiHandler.postDelayed(hideNativeOsdRunnable, 4500L);
    }

    private void hideNativeOsd() {
        nativeUiHandler.removeCallbacks(hideNativeOsdRunnable);
        nativeUiHandler.removeCallbacks(refreshNativeProgressRunnable);
        nativeOsdVisible = false;
        if (nativeOsdOverlay != null) {
            nativeOsdOverlay.setVisibility(View.GONE);
            nativeOsdOverlay.setClickable(false);
        }
        if (nativePlayerView != null && nativePlayerVisible) {
            nativePlayerView.requestFocus();
        }
    }

    private void showNativeTrackDialog(int trackType, String title) {
        if (nativePlayer == null || getActivity() == null) return;

        List<NativeTrackChoice> choices = collectNativeTrackChoices(trackType);
        boolean allowOff = trackType == C.TRACK_TYPE_TEXT;
        int extra = allowOff ? 2 : 1;
        String[] labels = new String[choices.size() + extra];
        labels[0] = "Auto";
        int start = 1;

        if (allowOff) {
            labels[1] = "Off";
            start = 2;
        }

        int checked = 0;
        boolean disabled = nativePlayer
            .getTrackSelectionParameters()
            .getTrackTypeDisabled(trackType);

        if (allowOff && disabled) checked = 1;

        for (int i = 0; i < choices.size(); i++) {
            NativeTrackChoice choice = choices.get(i);
            labels[i + start] = choice.label;
            if (!disabled && choice.selected) checked = i + start;
        }

        nativeUiHandler.removeCallbacks(hideNativeOsdRunnable);

        new AlertDialog.Builder(getActivity())
            .setTitle(title)
            .setSingleChoiceItems(labels, checked, (dialog, which) -> {
                TrackSelectionParameters.Builder builder =
                    nativePlayer.getTrackSelectionParameters().buildUpon();
                builder.clearOverridesOfType(trackType);

                if (allowOff && which == 1) {
                    builder.setTrackTypeDisabled(trackType, true);
                } else {
                    builder.setTrackTypeDisabled(trackType, false);
                    if (which >= start) {
                        NativeTrackChoice choice = choices.get(which - start);
                        builder.setOverrideForType(
                            new TrackSelectionOverride(choice.group, choice.trackIndex)
                        );
                    }
                }

                nativePlayer.setTrackSelectionParameters(builder.build());
                dialog.dismiss();
                updateNativeOsdText();
                notifyListeners(
                    "playerTracks",
                    buildDetailedTrackSummary(nativePlayer.getCurrentTracks())
                );
                showNativeOsd(true);
            })
            .setNegativeButton("Cancel", (dialog, which) -> {
                dialog.dismiss();
                showNativeOsd(true);
            })
            .show();
    }

    private List<NativeTrackChoice> collectNativeTrackChoices(int trackType) {
        List<NativeTrackChoice> choices = new ArrayList<>();
        if (nativePlayer == null) return choices;

        for (Tracks.Group group : nativePlayer.getCurrentTracks().getGroups()) {
            if (group.getType() != trackType) continue;
            TrackGroup mediaTrackGroup = group.getMediaTrackGroup();

            for (int i = 0; i < group.length; i++) {
                if (!group.isTrackSupported(i)) continue;
                Format format = group.getTrackFormat(i);
                choices.add(
                    new NativeTrackChoice(
                        mediaTrackGroup,
                        i,
                        formatTrackLabel(format, trackType, i),
                        group.isTrackSelected(i)
                    )
                );
            }
        }
        return choices;
    }

    private NativeTrackChoice findNativeTrackChoice(int trackType, String groupId, int trackIndex) {
        for (Tracks.Group group : nativePlayer.getCurrentTracks().getGroups()) {
            if (group.getType() != trackType) continue;
            TrackGroup mediaTrackGroup = group.getMediaTrackGroup();
            if (!safeString(mediaTrackGroup.id).equals(groupId)) continue;
            if (trackIndex < 0 || trackIndex >= group.length || !group.isTrackSupported(trackIndex)) {
                return null;
            }
            return new NativeTrackChoice(
                mediaTrackGroup,
                trackIndex,
                formatTrackLabel(group.getTrackFormat(trackIndex), trackType, trackIndex),
                group.isTrackSelected(trackIndex)
            );
        }
        return null;
    }

    private int countTracks(Tracks tracks, int trackType) {
        int count = 0;
        if (tracks == null) return count;
        for (Tracks.Group group : tracks.getGroups()) {
            if (group.getType() == trackType) count += group.length;
        }
        return count;
    }

    private String formatTrackLabel(Format format, int trackType, int index) {
        List<String> parts = new ArrayList<>();

        if (format.label != null && !format.label.trim().isEmpty()) {
            parts.add(format.label.trim());
        }

        if (format.language != null && !format.language.trim().isEmpty()) {
            try {
                Locale locale = Locale.forLanguageTag(format.language);
                String language = locale.getDisplayLanguage();
                if (language != null && !language.trim().isEmpty()) {
                    parts.add(language);
                } else {
                    parts.add(format.language.toUpperCase(Locale.US));
                }
            } catch (Exception ignored) {
                parts.add(format.language.toUpperCase(Locale.US));
            }
        }

        if (trackType == C.TRACK_TYPE_VIDEO && format.height > 0) {
            parts.add(format.height + "p");
        }

        if (trackType == C.TRACK_TYPE_AUDIO && format.channelCount > 0) {
            parts.add(format.channelCount + "ch");
        }

        if (format.sampleMimeType != null && !format.sampleMimeType.isEmpty()) {
            String mime = format.sampleMimeType;
            int slash = mime.indexOf('/');
            parts.add(slash >= 0 ? mime.substring(slash + 1).toUpperCase(Locale.US) : mime);
        }

        if (parts.isEmpty()) {
            if (trackType == C.TRACK_TYPE_AUDIO) return "Audio " + (index + 1);
            if (trackType == C.TRACK_TYPE_TEXT) return "Subtitle " + (index + 1);
            if (trackType == C.TRACK_TYPE_VIDEO) return "Video " + (index + 1);
            return "Track " + (index + 1);
        }

        StringBuilder label = new StringBuilder();
        for (String part : parts) {
            if (label.length() > 0) label.append(" • ");
            label.append(part);
        }
        return label.toString();
    }

    private JSObject buildDetailedTrackSummary(Tracks tracks) {
        JSONArray audio = new JSONArray();
        JSONArray video = new JSONArray();
        JSONArray text = new JSONArray();

        if (tracks != null) {
            for (Tracks.Group group : tracks.getGroups()) {
                TrackGroup mediaTrackGroup = group.getMediaTrackGroup();

                for (int i = 0; i < group.length; i++) {
                    Format format = group.getTrackFormat(i);
                    JSONObject item = new JSONObject();
                    try {
                        item.put("groupId", safeString(mediaTrackGroup.id));
                        item.put("trackIndex", i);
                        item.put("type", trackTypeName(group.getType()));
                        item.put("label", formatTrackLabel(format, group.getType(), i));
                        item.put("language", safeString(format.language));
                        item.put("mimeType", safeString(format.sampleMimeType));
                        item.put("codecs", safeString(format.codecs));
                        item.put("bitrate", format.bitrate > 0 ? format.bitrate : 0);
                        item.put("width", format.width > 0 ? format.width : 0);
                        item.put("height", format.height > 0 ? format.height : 0);
                        item.put("channelCount", format.channelCount > 0 ? format.channelCount : 0);
                        item.put("selected", group.isTrackSelected(i));
                        item.put("supported", group.isTrackSupported(i));
                    } catch (JSONException ignored) {
                    }

                    if (group.getType() == C.TRACK_TYPE_AUDIO) audio.put(item);
                    else if (group.getType() == C.TRACK_TYPE_VIDEO) video.put(item);
                    else if (group.getType() == C.TRACK_TYPE_TEXT) text.put(item);
                }
            }
        }

        JSObject summary = new JSObject();
        summary.put("audioTracks", audio);
        summary.put("videoTracks", video);
        summary.put("textTracks", text);
        return summary;
    }

    private String trackTypeName(int trackType) {
        if (trackType == C.TRACK_TYPE_AUDIO) return "audio";
        if (trackType == C.TRACK_TYPE_VIDEO) return "video";
        if (trackType == C.TRACK_TYPE_TEXT) return "text";
        return "unknown";
    }

    public static boolean dispatchPlayerKeyEvent(KeyEvent event) {
        GetSmartProviderPlugin plugin = activeInstance.get();
        return plugin != null && plugin.handleNativePlayerKeyEvent(event);
    }

    private boolean handleNativePlayerKeyEvent(KeyEvent event) {
        if (
            event == null ||
            event.getAction() != KeyEvent.ACTION_DOWN ||
            nativePlayer == null ||
            nativePlayerView == null ||
            !nativePlayerVisible
        ) {
            return false;
        }

        int keyCode = event.getKeyCode();
        int digit = numericDigitFromKeyCode(keyCode);

        if (digit >= 0 && "live".equals(nativePlayerMediaType)) {
            appendNativeNumericChannelDigit(digit);
            return true;
        }

        if (keyCode == KeyEvent.KEYCODE_MEDIA_STOP) {
            emitPlayerCommand("stop");
            return true;
        }

        if (keyCode == KeyEvent.KEYCODE_CHANNEL_UP) {
            emitPlayerCommand("channelPrevious");
            showNativeOsd(true);
            return true;
        }

        if (keyCode == KeyEvent.KEYCODE_CHANNEL_DOWN) {
            emitPlayerCommand("channelNext");
            showNativeOsd(true);
            return true;
        }

        if (keyCode == KeyEvent.KEYCODE_LAST_CHANNEL) {
            emitPlayerCommand("lastChannel");
            showNativeOsd(true);
            return true;
        }

        if (keyCode == KeyEvent.KEYCODE_MUTE) {
            toggleNativeMute();
            showNativeOsd(true);
            return true;
        }

        if (keyCode == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE) {
            if (nativePlayer.isPlaying()) nativePlayer.pause();
            else nativePlayer.play();
            showNativeOsd(true);
            return true;
        }

        if (keyCode == KeyEvent.KEYCODE_MEDIA_PLAY) {
            nativePlayer.play();
            showNativeOsd(true);
            return true;
        }

        if (keyCode == KeyEvent.KEYCODE_MEDIA_PAUSE) {
            nativePlayer.pause();
            showNativeOsd(true);
            return true;
        }

        if (keyCode == KeyEvent.KEYCODE_MEDIA_REWIND && !"live".equals(nativePlayerMediaType)) {
            seekNativeBy(-10_000L);
            showNativeOsd(true);
            return true;
        }

        if (keyCode == KeyEvent.KEYCODE_MEDIA_FAST_FORWARD && !"live".equals(nativePlayerMediaType)) {
            seekNativeBy(10_000L);
            showNativeOsd(true);
            return true;
        }

        if (keyCode == KeyEvent.KEYCODE_GUIDE || keyCode == KeyEvent.KEYCODE_MENU) {
            emitPlayerCommand("guide");
            return true;
        }

        if (nativeOsdVisible) {
            if (keyCode == KeyEvent.KEYCODE_BACK) {
                hideNativeOsd();
                return true;
            }
            return false;
        }

        if ("live".equals(nativePlayerMediaType)) {
            if (keyCode == KeyEvent.KEYCODE_DPAD_UP) {
                emitPlayerCommand("channelPrevious");
                showNativeOsd(true);
                return true;
            }

            if (keyCode == KeyEvent.KEYCODE_DPAD_DOWN) {
                emitPlayerCommand("channelNext");
                showNativeOsd(true);
                return true;
            }

            if (keyCode == KeyEvent.KEYCODE_DPAD_LEFT) {
                emitPlayerCommand("guide");
                return true;
            }
        } else {
            if (keyCode == KeyEvent.KEYCODE_DPAD_LEFT) {
                seekNativeBy(-10_000L);
                showNativeOsd(true);
                return true;
            }
            if (keyCode == KeyEvent.KEYCODE_DPAD_RIGHT) {
                seekNativeBy(10_000L);
                showNativeOsd(true);
                return true;
            }
        }

        if (keyCode == KeyEvent.KEYCODE_BACK) {
            emitPlayerCommand("back");
            return true;
        }

        if (keyCode == KeyEvent.KEYCODE_DPAD_CENTER || keyCode == KeyEvent.KEYCODE_ENTER) {
            showNativeOsd(true);
            return true;
        }

        return false;
    }

    private void applyNativePlayerVisibility() {
        if (nativePlayerOverlay == null) return;

        nativePlayerOverlay.setVisibility(nativePlayerVisible ? View.VISIBLE : View.GONE);
        if (nativePlayerVisible) {
            showNativeOsd(true);
        } else {
            nativeUiHandler.removeCallbacks(hideNativeOsdRunnable);
            nativeUiHandler.removeCallbacks(refreshNativeProgressRunnable);
            nativeUiHandler.removeCallbacks(commitNativeNumericEntryRunnable);
            nativeNumericEntry.setLength(0);
            if (nativeOsdOverlay != null) nativeOsdOverlay.setVisibility(View.GONE);
            if (nativeNumericChannelView != null) nativeNumericChannelView.setVisibility(View.GONE);
        }
        emitPlayerState("visibility-applied");
    }

    private void emitPlayerCommand(String command) {
        emitPlayerCommand(command, null);
    }

    private void emitPlayerCommand(String command, String value) {
        JSObject payload = new JSObject();
        payload.put("command", command);
        if (value != null) payload.put("value", value);
        notifyListeners("playerCommand", payload);
    }

    private void emitPlayerState(String reason) {
        notifyListeners("playerState", buildPlayerState(reason));
    }

    private JSObject buildPlayerState(String reason) {
        JSObject state = new JSObject();
        state.put("reason", reason);
        state.put("active", nativePlayer != null);
        state.put("visible", nativePlayerVisible);
        state.put("title", nativePlayerTitle);
        state.put("mediaType", nativePlayerMediaType);
        state.put("channelNumber", nativePlayerChannelNumber);
        state.put("currentProgram", nativePlayerCurrentProgram);
        state.put("nextProgram", nativePlayerNextProgram);
        state.put("osdVisible", nativeOsdVisible);
        state.put("aspectMode", nativeAspectLabel());
        state.put("preferredAudioLanguage", preferredAudioLanguage);
        state.put("subtitleDefaultMode", subtitleDefaultMode);
        state.put("preferredSubtitleLanguage", preferredSubtitleLanguage);

        if (nativePlayer == null) {
            state.put("playbackState", "idle");
            state.put("isPlaying", false);
            state.put("playWhenReady", false);
            state.put("positionMs", 0);
            state.put("durationMs", 0);
            state.put("bufferedPositionMs", 0);
            state.put("volume", 1.0);
            return state;
        }

        state.put("playbackState", playbackStateName(nativePlayer.getPlaybackState()));
        state.put("isPlaying", nativePlayer.isPlaying());
        state.put("playWhenReady", nativePlayer.getPlayWhenReady());
        state.put("positionMs", nativePlayer.getCurrentPosition());
        long duration = nativePlayer.getDuration();
        state.put("durationMs", duration > 0 && duration != C.TIME_UNSET ? duration : 0);
        state.put("bufferedPositionMs", Math.max(0L, nativePlayer.getBufferedPosition()));
        state.put("volume", nativePlayer.getVolume());
        return state;
    }

    private String playbackStateName(int state) {
        switch (state) {
            case Player.STATE_BUFFERING:
                return "buffering";
            case Player.STATE_READY:
                return "ready";
            case Player.STATE_ENDED:
                return "ended";
            case Player.STATE_IDLE:
            default:
                return "idle";
        }
    }

    private String safePlaybackErrorMessage(PlaybackException error) {
        if (error == null) return "Playback error.";
        String message = error.getMessage();
        if (message == null || message.trim().isEmpty()) {
            return "Playback error.";
        }
        String sanitized = message
            .replaceAll("https?://[^\\s]+", "[stream]")
            .replaceAll("(?i)(username|password|token)=([^&\\s]+)", "$1=[redacted]");
        return sanitized.length() > 240 ? sanitized.substring(0, 240) : sanitized;
    }

    private void releaseNativePlayer() {
        nativeUiHandler.removeCallbacks(hideNativeOsdRunnable);
        nativeUiHandler.removeCallbacks(refreshNativeProgressRunnable);
        nativeUiHandler.removeCallbacks(refreshNativeDiagnosticsRunnable);
        nativeUiHandler.removeCallbacks(commitNativeNumericEntryRunnable);
        nativeNumericEntry.setLength(0);
        if (nativePlayer != null) {
            nativePlayer.removeListener(nativePlayerListener);
        }
        if (nativePlayerView != null) {
            nativePlayerView.setPlayer(null);
            nativePlayerView.setKeepScreenOn(false);
        }
        if (nativePlayer != null) {
            nativePlayer.release();
            nativePlayer = null;
        }
        if (nativePlayerOverlay != null) {
            ViewGroup parent = (ViewGroup) nativePlayerOverlay.getParent();
            if (parent != null) parent.removeView(nativePlayerOverlay);
            nativePlayerOverlay = null;
        }
        nativePlayerView = null;
        nativeOsdOverlay = null;
        nativeOsdTop = null;
        nativeOsdBottom = null;
        nativeChannelView = null;
        nativeTitleView = null;
        nativeProgramView = null;
        nativeNextProgramView = null;
        nativeStatusView = null;
        nativeProgressView = null;
        nativeNumericChannelView = null;
        nativeGuideButton = null;
        nativePreviousButton = null;
        nativeNextButton = null;
        nativeLastButton = null;
        nativeSeekBackButton = null;
        nativeSeekForwardButton = null;
        nativePlayPauseButton = null;
        nativeAudioButton = null;
        nativeSubtitleButton = null;
        nativeMuteButton = null;
        nativeVolumeDownButton = null;
        nativeVolumeUpButton = null;
        nativeAspectButton = null;
        nativeStopButton = null;
        nativePlayerUrl = "";
        nativePlayerTitle = "";
        nativePlayerMediaType = "";
        nativePlayerChannelNumber = "";
        nativePlayerCurrentProgram = "";
        nativePlayerNextProgram = "";
        nativeOsdVisible = false;
        nativeAspectMode = 0;
        preferredAudioLanguage = "";
        subtitleDefaultMode = "auto";
        preferredSubtitleLanguage = "";
        nativePerformanceMode = "auto";
        nativeEffectivePerformanceMode = "balanced";
        nativeBuiltPerformanceMode = "";
        nativeQualityPreference = "auto";
        nativeMaxRetryAttempts = 3;
        nativeRecoveryAttempt = 0;
        nativeRecoveryStage = 0;
        nativeRebuildAttempted = false;
        nativeRebufferCount = 0;
        nativeEverReady = false;
        nativeBufferingIncident = false;
        nativePlaybackStartedElapsedMs = 0L;
        nativeStartupTimeMs = -1L;
        nativeLastReadyElapsedMs = 0L;
        nativeRecentStalls.clear();
        notifyListeners("playerState", buildPlayerState("stopped"));
        notifyListeners("playerDiagnostics", buildNativeDiagnostics());
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

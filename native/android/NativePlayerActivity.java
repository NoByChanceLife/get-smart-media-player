package com.getsmartmedia.player;

import android.app.Activity;
import android.net.Uri;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.widget.FrameLayout;

import androidx.media3.common.MediaItem;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.ui.PlayerView;

/**
 * App-owned native Media3 playback surface.
 * Provider URLs remain inside the Android process and are never sent through
 * the Capacitor web server. D-pad/channel keys switch adjacent live streams.
 */
public class NativePlayerActivity extends Activity {
    public static final String EXTRA_URL = "getsmart.media.url";
    public static final String EXTRA_PREV_URL = "getsmart.media.prevUrl";
    public static final String EXTRA_NEXT_URL = "getsmart.media.nextUrl";
    public static final String EXTRA_TITLE = "getsmart.media.title";

    private ExoPlayer player;
    private PlayerView playerView;
    private String currentUrl;
    private String previousUrl;
    private String nextUrl;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().getDecorView().setSystemUiVisibility(
            android.view.View.SYSTEM_UI_FLAG_FULLSCREEN |
            android.view.View.SYSTEM_UI_FLAG_HIDE_NAVIGATION |
            android.view.View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        );

        currentUrl = getIntent().getStringExtra(EXTRA_URL);
        previousUrl = getIntent().getStringExtra(EXTRA_PREV_URL);
        nextUrl = getIntent().getStringExtra(EXTRA_NEXT_URL);

        FrameLayout root = new FrameLayout(this);
        playerView = new PlayerView(this);
        playerView.setUseController(true);
        playerView.setControllerAutoShow(true);
        playerView.setKeepScreenOn(true);
        root.addView(playerView, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        setContentView(root);

        player = new ExoPlayer.Builder(this).build();
        playerView.setPlayer(player);
        playUrl(currentUrl);
    }

    private void playUrl(String url) {
        if (url == null || url.trim().isEmpty() || player == null) return;
        currentUrl = url;
        player.setMediaItem(MediaItem.fromUri(Uri.parse(url)));
        player.prepare();
        player.setPlayWhenReady(true);
    }

    private boolean switchChannel(boolean forward) {
        String candidate = forward ? nextUrl : previousUrl;
        if (candidate == null || candidate.trim().isEmpty()) return false;

        // The JS layer supplies the immediate neighbors. Swap the opposite slot
        // so repeated alternating channel keys remain intuitive in this first
        // native pass; the full native playlist comes next.
        if (forward) {
            previousUrl = currentUrl;
        } else {
            nextUrl = currentUrl;
        }
        playUrl(candidate);
        playerView.showController();
        return true;
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (event.getAction() == KeyEvent.ACTION_DOWN) {
            switch (event.getKeyCode()) {
                case KeyEvent.KEYCODE_CHANNEL_UP:
                case KeyEvent.KEYCODE_DPAD_UP:
                    if (switchChannel(false)) return true;
                    break;
                case KeyEvent.KEYCODE_CHANNEL_DOWN:
                case KeyEvent.KEYCODE_DPAD_DOWN:
                    if (switchChannel(true)) return true;
                    break;
                case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
                    if (player != null) {
                        if (player.isPlaying()) player.pause(); else player.play();
                        return true;
                    }
                    break;
                case KeyEvent.KEYCODE_MEDIA_STOP:
                    finish();
                    return true;
            }
        }
        return super.dispatchKeyEvent(event);
    }

    @Override
    protected void onStop() {
        super.onStop();
        if (isFinishing()) releasePlayer();
    }

    @Override
    protected void onDestroy() {
        releasePlayer();
        super.onDestroy();
    }

    private void releasePlayer() {
        if (player != null) {
            player.release();
            player = null;
        }
    }
}

package com.getsmartmedia.player;

import android.os.Bundle;
import android.view.KeyEvent;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(GetSmartProviderPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (GetSmartProviderPlugin.dispatchPlayerKeyEvent(event)) {
            return true;
        }
        return super.dispatchKeyEvent(event);
    }
}

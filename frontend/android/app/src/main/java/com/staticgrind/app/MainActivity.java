package com.staticgrind.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugins that live in the app rather than in an npm package have to be
        // registered by hand, and before super.onCreate, which is where the
        // bridge is built and the plugin list is read.
        registerPlugin(MediaSaverPlugin.class);
        super.onCreate(savedInstanceState);
    }
}

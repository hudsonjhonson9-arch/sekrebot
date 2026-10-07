package com.bapperida.absensi;

import android.os.Bundle;
import android.provider.Settings;
import android.widget.Toast;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Pengecekan Opsi Pengembang (Developer Options) & USB Debugging (ADB)
        int devOptions = Settings.Global.getInt(getContentResolver(), "development_settings_enabled", 0);
        int adbEnabled = Settings.Global.getInt(getContentResolver(), "adb_enabled", 0);
        
        if (devOptions == 1 || adbEnabled == 1) {
            Toast.makeText(this, "⚠️ Opsi Pengembang (Developer Options) Aktif! Mohon matikan Opsi Pengembang di Pengaturan HP untuk menggunakan aplikasi ini.", Toast.LENGTH_LONG).show();
            finishAffinity(); // Tutup aplikasi sepenuhnya
            System.exit(0);
        }
    }
}

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 Starting Capacitor Android Setup...');

// 1. Prepare clean web assets in "www" folder
console.log('🧹 Cleaning and preparing clean web assets in "www" folder...');
if (fs.existsSync('www')) {
  fs.rmSync('www', { recursive: true, force: true });
}
fs.mkdirSync('www');

// Helper to copy folder recursively
function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  let entries = fs.readdirSync(src, { withFileTypes: true });
  for (let entry of entries) {
    let srcPath = path.join(src, entry.name);
    let destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Copy essential files and folders to "www"
fs.copyFileSync('index.html', 'www/index.html');
if (fs.existsSync('manifest.json')) fs.copyFileSync('manifest.json', 'www/manifest.json');
if (fs.existsSync('service-worker.js')) fs.copyFileSync('service-worker.js', 'www/service-worker.js');
if (fs.existsSync('css')) copyDirSync('css', 'www/css');
if (fs.existsSync('js')) copyDirSync('js', 'www/js');
console.log('✅ Clean web assets copied to "www"!');

// 2. Write capacitor.config.json pointing to "www"
const config = {
  appId: 'com.bapperida.absensi',
  appName: 'Absensi Digital',
  webDir: 'www',
  bundledWebRuntime: false,
  plugins: {
    CapacitorUpdater: {
      autoUpdate: true,
      stats: false
    }
  }
};
fs.writeFileSync('capacitor.config.json', JSON.stringify(config, null, 2));
console.log('✅ capacitor.config.json written!');

// 3. Install Capacitor packages
console.log('📦 Installing Capacitor NPM packages...');
execSync('npm install @capacitor/core @capacitor/cli @capacitor/android --save-dev', { stdio: 'inherit' });

// 4. Initialize Android platform
console.log('🤖 Adding Android Platform...');
try {
  execSync('npx cap add android', { stdio: 'inherit' });
} catch (e) {
  console.log('ℹ️ Android platform already added or skipped.');
}

// 5. Inject Geolocation & Camera permissions into AndroidManifest.xml
const manifestPath = path.join('android', 'app', 'src', 'main', 'AndroidManifest.xml');
if (fs.existsSync(manifestPath)) {
  let manifest = fs.readFileSync(manifestPath, 'utf8');
  
  const permissions = `
    <!-- Permissions added for Absensi Digital -->
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-feature android:name="android.hardware.location.gps" android:required="true" />
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-feature android:name="android.hardware.camera" android:required="true" />
    <uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />`;
  
  if (!manifest.includes('android.permission.ACCESS_FINE_LOCATION')) {
    if (manifest.includes('<uses-permission android:name="android.permission.INTERNET" />')) {
      manifest = manifest.replace(
        '<uses-permission android:name="android.permission.INTERNET" />',
        '<uses-permission android:name="android.permission.INTERNET" />' + permissions
      );
    } else {
      manifest = manifest.replace('</manifest>', permissions + '\n</manifest>');
    }
    fs.writeFileSync(manifestPath, manifest);
    console.log('✅ AndroidManifest.xml updated with Geolocation & Camera permissions!');
  } else {
    console.log('ℹ️ AndroidManifest.xml already has Geolocation & Camera permissions.');
  }
} else {
  console.log('⚠️ AndroidManifest.xml not found!');
}

// 6. Update MainActivity.java with Developer Mode Block
const mainActivityPath = path.join(
  'android', 'app', 'src', 'main', 'java', 'com', 'bapperida', 'absensi', 'MainActivity.java'
);

const secureJavaCode = `package com.bapperida.absensi;

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
`;

const targetDir = path.dirname(mainActivityPath);
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

fs.writeFileSync(mainActivityPath, secureJavaCode);
console.log('🛡️ MainActivity.java has been secured against Developer Options & USB Debugging!');

// 7. Upgrade Gradle version in gradle-wrapper.properties to 8.13 to prevent Java 17/21 multi-release JAR errors
const wrapperPath = path.join('android', 'gradle', 'wrapper', 'gradle-wrapper.properties');
if (fs.existsSync(wrapperPath)) {
  let content = fs.readFileSync(wrapperPath, 'utf8');
  if (content.includes('gradle-8.2.1-all.zip') || content.includes('gradle-8.2.1-bin.zip')) {
    content = content.replace(/gradle-8\.2\.1-(all|bin)\.zip/, 'gradle-8.13-all.zip');
    fs.writeFileSync(wrapperPath, content);
    console.log('✅ gradle-wrapper.properties upgraded to Gradle 8.13!');
  } else {
    content = content.replace(/gradle-\d+(\.\d+)*-(all|bin)\.zip/, 'gradle-8.13-all.zip');
    fs.writeFileSync(wrapperPath, content);
    console.log('✅ gradle-wrapper.properties updated to Gradle 8.13!');
  }
} else {
  console.log('⚠️ gradle-wrapper.properties not found! Skipping Gradle upgrade.');
}

// 8. Generate Android icons and splash screens dynamically from the assets folder
console.log('🎨 Generating Android icons and splash screens from assets...');
try {
  execSync('npx @capacitor/assets generate --android', { stdio: 'inherit' });
  console.log('✅ Android icons and splash screens generated successfully!');
} catch (e) {
  console.log('⚠️ Failed to generate assets dynamically. Skipping asset generation.');
}

console.log('🎉 Setup complete! You can now compile the project or run inside GitHub Actions.');

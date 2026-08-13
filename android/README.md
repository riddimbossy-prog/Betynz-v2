# Betynz Android APK

This folder contains the lightweight Android shell for https://betynz.com.

## What it does

- Opens Betynz in a native Android WebView while keeping the live website as the single source of truth.
- Keeps Betynz navigation inside the app and sends external links to the appropriate Android app/browser.
- Preserves first-party cookies for account sessions.
- Supports file selection, downloads, back navigation, rotation, tablets and foldables.
- Rejects clear-text HTTP traffic and mixed content.

## Build locally

Requirements: JDK 17, Android SDK 35 and Gradle 8.10.2 or newer.

```bash
cd android
gradle :app:assembleDebug
```

Installable APK output:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Build with GitHub Actions

Open the repository's **Actions** tab and run **Android APK**. A successful run uploads an artifact containing `betynz.apk`.

The automated APK is a debug-signed installable build intended for direct device testing. Before publishing to Google Play, create a private release keystore and add a signed release/AAB workflow. Never commit a keystore or signing password to GitHub.

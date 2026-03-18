# Android Permissions Required

The Android platform directory (`mobile/android/`) is not scaffolded until `npx cap add android`
is run. Once it exists, add the following to:

`mobile/android/app/src/main/AndroidManifest.xml`

## Camera (required for QR scanning)

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-feature android:name="android.hardware.camera" android:required="true" />
<uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />
```

## Barcode Scanning (`@capacitor-mlkit/barcode-scanning`)

Per the plugin docs, also add inside `<application>`:

```xml
<meta-data
    android:name="com.google.mlkit.vision.DEPENDENCIES"
    android:value="barcode_ui" />
```

## Network (required for HTTP + WebSocket to Supervisor)

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
```

## mDNS / NSD (required for `@capacitor-community/mdns` if installed)

```xml
<uses-permission android:name="android.permission.CHANGE_WIFI_MULTICAST_STATE" />
```

## allowMixedContent (for HTTP connections to LAN Supervisor over HTTP)

Already set in `capacitor.config.ts` via `android.allowMixedContent: true`.
In the manifest `<application>` tag, also ensure:

```xml
android:usesCleartextTraffic="true"
```

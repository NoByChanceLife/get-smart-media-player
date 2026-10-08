#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -d android ]; then
  npx cap add android
fi

PKG_DIR="android/app/src/main/java/com/getsmartmedia/player"
mkdir -p "$PKG_DIR"
cp native/android/GetSmartProviderPlugin.java "$PKG_DIR/GetSmartProviderPlugin.java"
cp native/android/MainActivity.java "$PKG_DIR/MainActivity.java"
cp native/android/AndroidManifest.xml android/app/src/main/AndroidManifest.xml

npx cap sync android

echo "Get Smart Android shell synchronized."

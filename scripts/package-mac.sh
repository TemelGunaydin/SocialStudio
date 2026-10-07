#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
VERSION=v22.23.3
ARCH="${ARCH:-$(uname -m)}"
case "$ARCH" in
  arm64) NODE_ARCH=arm64; TARGET=arm64-apple-macosx13.0 ;;
  x86_64|x64) NODE_ARCH=x64; TARGET=x86_64-apple-macosx13.0 ;;
  *) echo 'Desteklenen mimariler: arm64, x86_64' >&2; exit 1 ;;
esac
NAME="node-$VERSION-darwin-$NODE_ARCH"
CACHE="$ROOT/.cache/mac-runtime"
APP="$ROOT/dist/Social Studio.app"
mkdir -p "$CACHE" "$ROOT/dist"
# Official standalone Node, not the developer's Homebrew binary and its local dylibs.
if [ ! -d "$CACHE/$NAME" ]; then
  curl --fail --location --proto '=https' --tlsv1.2 "https://nodejs.org/dist/$VERSION/SHASUMS256.txt" -o "$CACHE/SHASUMS256.txt"
  curl --fail --location --proto '=https' --tlsv1.2 "https://nodejs.org/dist/$VERSION/$NAME.tar.gz" -o "$CACHE/$NAME.tar.gz"
  ( cd "$CACHE"; grep " $NAME.tar.gz$" SHASUMS256.txt | shasum -a 256 -c - )
  tar -xzf "$CACHE/$NAME.tar.gz" -C "$CACHE"
fi
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/runtime/bin" "$APP/Contents/Resources/studio"
cp "$CACHE/$NAME/bin/node" "$APP/Contents/Resources/runtime/bin/node"
cp "$CACHE/$NAME/LICENSE" "$APP/Contents/Resources/runtime/LICENSE"
# Allowlist only. Never copy .env, data, .git, tests or local logs into a release.
cp -R server public "$APP/Contents/Resources/studio/"
cp package.json LICENSE "$APP/Contents/Resources/studio/"
xcrun swiftc -swift-version 6 -parse-as-library -target "$TARGET" -framework AppKit desktop/Launcher.swift -o "$APP/Contents/MacOS/SocialStudio"
cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>SocialStudio</string>
<key>CFBundleIdentifier</key><string>com.buildandruns.social-studio</string>
<key>CFBundleName</key><string>Social Studio</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>1.0.0</string>
<key>CFBundleVersion</key><string>1</string>
<key>LSMinimumSystemVersion</key><string>13.0</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST
codesign --force --sign - "$APP/Contents/Resources/runtime/bin/node"
codesign --force --sign - "$APP"
ditto -c -k --keepParent "$APP" "$ROOT/dist/Social-Studio-mac-$NODE_ARCH.zip"
printf '\nHazır: %s\n' "$APP"
echo 'Bu yerel geliştirme paketi ad-hoc imzalıdır. Herkese dağıtım öncesinde Developer ID imzası ve Apple notarization gerekir.'

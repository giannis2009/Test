#!/bin/bash
# AppleFX installer for Premiere Pro (macOS)
# 1) Allows unsigned CEP extensions  2) Copies AppleFX into the CEP extensions folder
set -e
for v in 9 10 11 12 13 14; do defaults write "com.adobe.CSXS.$v" PlayerDebugMode 1; done
SRC="$(cd "$(dirname "$0")/../AppleFX" && pwd)"
DEST="$HOME/Library/Application Support/Adobe/CEP/extensions/AppleFX"
rm -rf "$DEST"
mkdir -p "$(dirname "$DEST")"
cp -R "$SRC" "$DEST"
xattr -dr com.apple.quarantine "$DEST" 2>/dev/null || true
echo "AppleFX installed to $DEST"
echo "Restart Premiere Pro and open: Window > Extensions > AppleFX"

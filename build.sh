#!/bin/bash
# Tab Anxiety — Chrome Web Store build script
# Creates a zip ready for upload to https://chrome.google.com/webstore/devconsole

set -e

OUT="tab-anxiety.zip"

echo "Building Tab Anxiety..."

# Remove old build
rm -f "$OUT"

# Create zip with only extension files (exclude dev artifacts)
zip -r "$OUT" \
  manifest.json \
  background.js \
  content.js \
  content.css \
  popup.html \
  popup.js \
  popup.css \
  newtab.html \
  newtab.js \
  newtab.css \
  icons/icon16.png \
  icons/icon48.png \
  icons/icon128.png \
  --exclude "*.DS_Store" \
  --exclude "*.ico" \
  --exclude "*/generate-icons.html"

SIZE=$(du -h "$OUT" | cut -f1)
echo "✓ Built: $OUT ($SIZE)"
echo ""
echo "Upload at: https://chrome.google.com/webstore/devconsole"
echo ""
echo "Store listing checklist:"
echo "  [ ] Short description (≤132 chars)"
echo "  [ ] Detailed description"
echo "  [ ] 1280×800 or 640×400 screenshot(s)"
echo "  [ ] 440×280 small promo tile (optional but recommended)"
echo "  [ ] Privacy policy URL (required if collecting data)"
echo "      → Tab Anxiety stores all data locally. No data leaves your device."

#!/usr/bin/env bash
# Builds the two release zips in dist/.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf dist && mkdir -p dist
# For people installing by hand: contains an "extension" folder to Load unpacked.
zip -rq dist/geo-no-extension.zip extension -x '*.DS_Store'
# For the Chrome Web Store / Edge Add-ons upload: manifest.json at the zip root.
(cd extension && zip -rq ../dist/geo-no-store-upload.zip . -x '*.DS_Store')
echo "Built dist/geo-no-extension.zip and dist/geo-no-store-upload.zip"

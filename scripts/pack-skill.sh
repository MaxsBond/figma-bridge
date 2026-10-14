#!/bin/sh
# Build dist/figma-bridge-skill.zip for skill marketplaces (SKILL.md at the zip root).
set -e
cd "$(dirname "$0")/.."
rm -rf dist/skill && mkdir -p dist/skill
cp -R skills/figma-bridge/. dist/skill/
cp LICENSE dist/skill/
rm -f dist/figma-bridge-skill.zip
(cd dist/skill && zip -qrX ../figma-bridge-skill.zip . -x '.DS_Store')
rm -rf dist/skill
echo "dist/figma-bridge-skill.zip"

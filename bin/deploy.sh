#!/bin/bash
set -e

echo "Building Orpheus-edge..."
npm run build

echo "Deploying to Talos..."
TALOS_STATIC="../talos/static"

# Clear old files
find "$TALOS_STATIC" -mindepth 1 ! -name '.gitkeep' -delete

# Copy new build
cp -r dist/* "$TALOS_STATIC/"

echo "Deployment completed!"
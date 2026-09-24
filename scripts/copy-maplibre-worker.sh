#!/bin/sh
# MapLibre runs its tile parsing in a Web Worker it resolves RELATIVE to its own
# module — which, once a bundler has moved that module into a chunk, points at nothing.
# So the worker and the shared module it imports are served from public/ as plain
# files, and PresentMap.tsx tells MapLibre where with setWorkerUrl(). Run on postinstall
# so the copy always matches the installed version; public/maplibre/ is gitignored.
set -eu
mkdir -p public/maplibre
cp node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs public/maplibre/
cp node_modules/maplibre-gl/dist/maplibre-gl-shared.mjs public/maplibre/

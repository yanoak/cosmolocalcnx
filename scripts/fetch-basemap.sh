#!/bin/sh
# The Present chapter's basemap: a Protomaps world extract, zoom 0-6, one file.
#
# Pinned to one daily build so the extract is reproducible; bump the date deliberately
# and re-run. About 45 MB. Committed under public/basemap/ because two surfaces need it
# in place with no server: the exhibition laptop serves the static export offline, and
# phones range-request tiles from the same path on the Vercel URL. Neither can fetch it
# at build time — Vercel builds from git.
#
# Needs the pmtiles CLI: brew install pmtiles
set -eu
BUILD="${PROTOMAPS_BUILD:-20260923}"
MAXZOOM="${PROTOMAPS_MAXZOOM:-6}"
OUT="public/basemap/protomaps-${BUILD}-z${MAXZOOM}.pmtiles"
mkdir -p public/basemap
pmtiles extract "https://build.protomaps.com/${BUILD}.pmtiles" "$OUT" --maxzoom="$MAXZOOM"
pmtiles show "$OUT" | head -12

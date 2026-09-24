---
slug: 2026-09-24_faiways-map-export
status: active
started: 2026-09-24
finished:
issue:
---

# The Faiways map — the Futures scene exported for print, in layers

## Context

The newspaper printed for the exhibition wants a map of its world: the valley with the twelve
2045 places, and the district as an inset. `docs/roadmap.md` has said since the start that the
newspaper map is an *export* of the same hotspots rather than a second drawing, and the Futures
plan owns the data. Yan asked on 24 Sep 2026 for the basemap, the icons and the labels as
separate deliverables, printed as half an A3 — A4 landscape.

## Goal

From the internal page `/export`: for each of the two maps, a raster basemap PNG at the page's
exact pixel size, and one SVG the same size whose named groups — water, roads, rail, icons,
labels — a layout program opens as editable layers over it. Nothing drawn twice: the same fit,
the same projection, the same hotspots and the same copy as the screen.

## Approach

**The camera never rotates, so the page is the screen at a different size.** `isometricFit`
for a viewport of 3508 × 2480 gives the zoom and target; `projectView` puts every world point
on the page. `mapexport.ts` is that arithmetic plus the SVG writer, pure and tested. The
basemap is the Diorama itself, mounted at the page's pixel size with `dpr={1}` and a preserved
drawing buffer, with everything vector switched off — no rivers, no roads, no pins — and read
back with `toDataURL`.

**Vectors stay vectors.** Rivers, roads and the railway are polylines in the features file, so
they go to the SVG as paths with the screen's own weights scaled to the page's dpi. Icons are
`image` elements referencing the 1024 px sprites on their measured ground anchors — 14 mm on
the long edge by default, which is 165 px at 300 dpi from a 1024 px source. Labels are live
text in the piece's typeface, above or below as the hotspot says. The valley's pins and lines
take their terrain heights from the same decoded field the screen uses, so they sit where the
screen puts them.

**The city prints as geometry.** The screen shows everything beyond 1,250 m as a 4.8 m raster;
at 3508 px across 5.8 km the page is 1.65 m per pixel, so the export imports the full document
and renders all 68,704 buildings — which is why the page is internal and in `.vercelignore`.

**Same gate as `/print`, for the same reason.** No server, no auth; the directory is absent
from the deployed build rather than hidden in it.

## Tasks

- [x] `mapexport.ts` — page spec, `pageProjection`, `toPage`, `overlaySvg`; 8 tests
- [x] `Diorama` takes `dpr` and `exportable`
- [x] `/export` — map, dpi, icon size, label size, roads-and-rail toggle; basemap PNG and overlay
      SVG downloads; a live preview of the overlay over the render, scaled to the window
- [x] `.vercelignore` entry
- [ ] **Run it on the laptop and open the pair in Illustrator** — registration, icon sharpness,
      whether 14 mm and 8 pt are right for the page. Yan's
- [ ] Bleed and crop marks, if the printer wants them — a page-size option, not a redesign
- [ ] Thai labels, when the copy has them

## Verification

1. `/export`, valley: the preview shows the hillshade with twelve icons and labels over it and
   the rivers in blue; "Download basemap PNG" gives a 3508 × 2480 image with no lines or icons;
   "Download overlay SVG" gives a file that, placed beside it, opens in Illustrator with the
   basemap as its first layer and the pins registered on it.
2. City: the four district pins on the full-geometry diorama; the PNG is crisp at 100%.
3. Chiang Dao stands on the northern edge with "64 km north" in its label, as on screen.
4. Turn roads and rail off: the SVG has no `roads-*` or `rail` groups.

## Out of scope

- The Past chapter's map. Same machinery would do it; nobody has asked.
- A PDF. The layout program makes that from the pair.

## Outcome

_Built 24 Sep 2026 evening, tests green, not yet run on the laptop._

# Design system

## Where it comes from

A photograph of the cover of **PROGRESS**, 1 June 1967, Summer Edition — a Thai magazine found in
an old house in Chiang Mai. The cover is a four-plate offset print: a green masthead, a yellow
wordmark, a rose frame, a blue map of Thailand with hand-drawn leader lines fanning out to a list
of school names.

It earns its place beyond being a nice object. It is a **1967 vision of progress** for the same
country this project imagines in 2045, which is an argument rather than a mood. And its limited
ink palette lands exactly on the register the exhibition needs: flat, printed, clearly a
proposition rather than a photorealistic developer's render.

The photograph itself is **not in this repo** — it is a picture of a third-party artefact and
carries camera EXIF. It lives under `docs/references/`, which is gitignored. What is committed is
the palette derived from it, below. Colours are not copyrightable; the photograph is somebody's.

### The palette is white-balanced, not as-shot

The cover was photographed on a phone, so every raw value carried that room's white balance. The
palette below was normalised against the paper as a neutral, lifted to the lightness aged stock
actually has, and then had a deliberate warmth dialled back in — `(1.015, 1.000, 0.955)`. The
warmth is a design decision. The room lighting was not.

Re-run that derivation if the cover is ever reshot properly. It is a few lines and the inputs are
six sampled patches.

## The one rule

**The theme is not the scene document.** The scene says `kind: "residential"`. The theme says what
residential looks like. Two files, and nothing in the renderer or the DOM ever names a raw colour.

Everything follows from this: a second neighbourhood in December inherits the theme for free,
re-importing OSM never touches it, and reskinning never touches authored content. It is the same
separation as `baseline` versus `edits`, applied to appearance.

## Layer 1 — palette

Raw values, named for the source. These appear in exactly one file and are referenced only by the
role table below.

| Token | Hex | H/S/L |
|---|---|---|
| `progress.green` | `#375D51` | 161° 26% 29% |
| `progress.yellow` | `#ECD83B` | 53° 82% 58% |
| `progress.rose` | `#DA627A` | 348° 62% 62% |
| `progress.blue` | `#677FA2` | 216° 24% 52% |
| `progress.ink` | `#446DA7` | 215° 42% 46% |
| `progress.paper` | `#E4E0D6` | 43° 21% 87% |

Four hue families — warm yellow/cream, green, blue, rose — because that is what a four-plate job
gives you. Resist adding a fifth.

## Layer 2 — roles

The only names used anywhere in code.

| Role | Source | Top | Side | Shade |
|---|---|---|---|---|
| `building.stock` | yellow | `#F1E169` | `#ECD83B` | `#DAC310` |
| `building.intervention` | rose | `#E48B9D` | `#DA627A` | `#D32B4D` |
| `building.civic` | green | `#4A7D6D` | `#375D51` | `#1F3830` |
| `water` | blue | `#879AB5` | `#677FA2` | `#496183` |

| Surface | Hex |
|---|---|
| `ground` | `#D8D2C4` |
| `road` | `#C1BAA8` |

**The stock/intervention split is the semantic work this palette does.** Everything on screen is
2045, so the distinction that matters is not past versus future — it is the city that was already
there versus what a scenario proposes. Inherited stock reads as the warm yellows of the paper era;
interventions read rose. A visitor can see what is being argued for without reading a word.

## The three-tone ramp

Each surface role expands to three tones — top face, light side, shade side — derived from the base
rather than hand-picked:

```
top   = base, lightness +10%
side  = base
shade = base, lightness −12%, saturation +4%
```

This is the classic isometric trick: form comes from face orientation, not from lights. It is a
**pure function and gets a unit test**, per the working conventions in `CLAUDE.md`.

## Materials are unlit

No lights in the scene. `MeshBasicMaterial` or equivalent, with the ramp tone chosen per face
orientation.

The reason is modifiability, not just performance. With lit materials the rendered colour is the
token *multiplied by lighting*, so changing a token does not predictably change what you see and
the system stops being adjustable in the way it needs to be. Unlit makes every token literally the
pixel it produces. It is also cheaper on a phone and it matches the flat ink of the source.

Revisit only if the flat version reads as cardboard on a real device.

## DOM and WebGL read the same tokens

One source of truth, two consumers: CSS custom properties for panels and chrome, `THREE.Color` for
materials.

**Set colour management deliberately.** three.js treats a hex as sRGB and converts to a linear
working space; if `outputColorSpace` and material setup are not handled on purpose, a swatch in the
DOM and a building in the canvas will not match, and the afternoon spent finding that out is
entirely avoidable. Decide it once, in the same commit that introduces the tokens.

## Contrast is a rule, not a preference

The diorama may be as vivid as it likes. Text may not — visitors read this standing in a bright
mall, on their own phones, at arm's length.

**UI text tokens are derived darker from the palette rather than taken from it.** Measured against
`progress.paper`:

| Token | Hex | Ratio |
|---|---|---|
| `ui.text` | `#1E2F49` | 10.2:1 |
| `ui.text.muted` | `#2F4C74` | 6.6:1 |
| `ui.accent` | `#B52B46` | 4.7:1 |
| `ui.focus` | `#33574B` | 6.1:1 |

For reference, the raw palette values fail badly as text: the rose reaches 2.6:1 and the yellow
1.1:1. Never put body text in a palette colour.

Everything that carries text must hit **4.5:1**. This is checked, not eyeballed — the ratio
function is pure and testable like the ramp.

## How to change it

1. **Edit the palette file.** Six hex values. Everything downstream re-derives — ramps, surfaces,
   UI tokens — because nothing else hardcodes a colour.
2. **Hot-reload shows it immediately**, in both the panels and the diorama, because both read the
   same tokens.
3. **Later, a theme panel at `/admin`** — sliders, live preview, copy theme JSON to the clipboard.
   Exactly the pattern the scene editor uses, for the same reason: the editor is the viewer plus a
   layer. Not required for September; editing the file is enough.

Named themes are possible from the start — `progress-1967` is simply the first. A second
neighbourhood or a second source artefact becomes a second theme, not a fork.

## Borrowed from the cover, beyond colour

The cover **is a data visualisation** — a map with leader lines fanning out to a list of names.
That is a ready-made treatment for hotspots: callouts on leader lines rather than floating pins.
Distinctive, cheap, straight out of the source, and it needs no illustrator.

Worth keeping in reserve rather than building on day one.

## September scope

In:

- The palette and role tokens, in one file, feeding both DOM and materials
- The ramp derivation and the contrast check, both as tested pure functions
- Colour management settled in the same commit as the tokens

Out, and deliberately so: a component library, runtime theme switching for visitors, paper grain
and print-misregistration effects. The last of those is a genuinely good idea for item 6 polish if
the buffer survives, and nothing before it depends on it.

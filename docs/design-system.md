# Design system

## Where it comes from

The **Cosmo Local CNX brand system**, designed by Anupong Limsirivong for the programme this
exhibition is one strand of. The concept deck lives at `docs/references/`, which is gitignored
because it is somebody else's document; what is committed is the token table below.

This replaced a palette derived from a 1967 Thai magazine cover on **16 Sep 2026**. The earlier
palette was a good argument — a 1967 vision of progress for the same country this project imagines
in 2045 — and it is preserved in git history if it is ever wanted. It was dropped for a reason that
has nothing to do with taste: **the exhibition has print, signage and a programme identity that the
screen has to match.** A piece that is visibly off-brand beside its own banners reads as a
different project. The brand also arrived with a typeface that solves a problem the roadmap had
open, which is below.

### These values are specified, not sampled

Unlike the palette it replaced, nothing here is derived from a photograph, white-balanced or
rounded. The hex values are taken verbatim from the brand deck and must stay that way — print
matching is the entire reason they are exact. If they ever need to change, they change in the brand
system first and are copied here second.

### The brand's weighting is real, and the role table is where it happens

The deck specifies 55% primary purple, 15% secondary purple/lilac, 10% orange, 10% yellow, 10%
neutral background. Colour proportions on a slide deck do not transfer directly to a diorama, so
the weighting is expressed through *what gets which role*: the building stock is the purple family
because it is 1,182 of the objects on screen, and orange is reserved for the handful of things that
should interrupt.

## The one rule

**The theme is not the scene document.** The scene says `kind: "residential"`. The theme says what
residential looks like. Two files, and nothing in the renderer or the DOM ever names a raw colour.

Everything follows from this: a second neighbourhood in December inherits the theme for free,
re-importing OSM never touches it, and reskinning never touches authored content. It is the same
separation as `baseline` versus `edits`, applied to appearance.

## Layer 1 — palette

Raw values. These appear in exactly one file and are referenced only by the role table below.

| Token | Hex | Brand name |
|---|---|---|
| `cosmo.purple` | `#2B184C` | Cosmo Purple |
| `cosmo.violet` | `#6E4FD3` | Cosmo Violet |
| `cosmo.lilac` | `#B7A7E8` | Cosmo Lilac |
| `cosmo.orange` | `#FF8A00` | Cosmo Orange |
| `cosmo.yellow` | `#FFC72C` | Cosmo Yellow |
| `cosmo.white` | `#F7F4EE` | Warm White |

Secondary and neutral ranges live in `PALETTE_EXTENDED` — Deep Violet, Soft Lilac, Teal, Sky Blue,
Coral, Lime Green, and five neutrals from Charcoal to Off White. They exist so roles have somewhere
to reach for water, parkland and muted text without inventing a colour.

**The diorama is light.** Warm White ground, purple as ink. The brand's 55% purple would suggest a
dark treatment, and it looks better on a projector — but the primary surface is a visitor's own
phone in a bright shopping mall, and that decides it. See the three delivery surfaces in
`CLAUDE.md`.

## Layer 2 — roles

The only names used anywhere in code.

| Role | Source | Top | Side | Shade |
|---|---|---|---|---|
| `building.stock` | lilac | `#D8CFF3` | `#B7A7E8` | `#8E73DF` |
| `building.intervention` | orange | `#FFA133` | `#FF8A00` | `#C26900` |
| `building.civic` | teal | `#04BEB3` | `#038C84` | `#00524D` |
| `water` | sky blue | `#99CAEE` | `#6DB3E7` | `#3498E3` |

| Surface | Hex | Source |
|---|---|---|
| `ground` | `#F7F4EE` | Warm White, straight from the brand |
| `road` | `#E7DECB` | Warm White, darkened |
| `green` | `#C0CEA1` | Lime, pulled well back |

**The stock/intervention split is the semantic work this palette does.** Everything on screen is
2045, so the distinction that matters is not past versus future — it is the city that was already
there versus what a scenario proposes. Inherited stock is lilac, the quiet end of the brand's
dominant family; interventions are orange, the brand's own interrupt colour. A visitor can see what
is being argued for without reading a word.

Two notes on why these are not the raw brand values:

- **Stock is lilac, not violet.** 1,182 buildings at full violet is a wall, not a neighbourhood.
- **Green is a long way off the brand's lime.** Lime Green at full strength reads as highlighter
  rather than grass once it is laid flat on the ground plane.

### The population ramp

The region register needs a sequential scale, which a brand palette does not supply. It is built
from the brand rather than beside it: `ground → lilac → violet → purple → orange`. Sequential and
light-to-dark, because population has a direction and a spectral ramp would invent boundaries the
data does not have. It starts at the district's own ground tone, so the emptiest cell in Asia is
exactly the colour of the ground in Wat Ket and the two registers read as one piece — and it ends
at orange, so the megacities are the only thing in the frame using the interrupt colour.

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

Measured against `ground` (`#F7F4EE`):

| Token | Hex | Ratio |
|---|---|---|
| `ui.text` | `#2B184C` | 14.3:1 |
| `ui.text.muted` | `#555B66` | 6.2:1 |
| `ui.accent` | `#854800` | 6.5:1 |
| `ui.focus` | `#6E4FD3` | 5.1:1 |

Cosmo Purple is already a text-weight colour, so `ui.text` takes it unchanged — this palette needs
less derivation than the one it replaced. **The accent still has to be derived:** Cosmo Orange is
2.2:1 on Warm White, which is fine as a surface and illegible as text. Never put body text in
orange or yellow; in this system they are surface colours.

Everything that carries text must hit **4.5:1**. This is checked, not eyeballed — the ratio
function is pure and testable like the ramp, and a test asserts every UI token clears it.

## Typography

**IBM Plex Sans Thai**, specified by the brand, at Light / Regular / Medium / SemiBold / Bold.

It is worth naming what this buys beyond compliance: **one family covers Latin and Thai**, so the
bilingual copy in roadmap item 5 needs no fallback stack, no metric mismatch and no separate Thai
line-height. The Thai typography pass was an open item and the brand closed it.

Self-hosted through `next/font`, not linked from Google, because the laptop and projection machine
run a local static export and must survive the venue wifi failing.

## How to change it

1. **Edit the palette file.** Six hex values, plus the extended range. Everything downstream
   re-derives — ramps, surfaces, UI tokens, the population ramp — because nothing else hardcodes a
   colour. When the palette was swapped wholesale on 16 Sep 2026 the type checker found all four
   places that had reached past a role to a raw value, which is the rule paying for itself.
2. **Hot-reload shows it immediately**, in both the panels and the diorama, because both read the
   same tokens.
3. **Later, a theme panel at `/admin`** — sliders, live preview, copy theme JSON to the clipboard.
   Exactly the pattern the scene editor uses, for the same reason: the editor is the viewer plus a
   layer. Not required for September; editing the file is enough.

Named themes are possible from the start — `progress-1967` was the first and `cosmo-local` is the
current one. A second neighbourhood or a second brand becomes a second theme, not a fork. The 1967
palette is in git history and re-derivable from this file's structure alone.

## Borrowed from the brand, beyond colour

The brand's mark is an eight-point **starburst**, and the deck uses it as a connector — nodes on
routed orthogonal lines, linking places to each other. That is a ready-made treatment for hotspots:
callouts on leader lines with a starburst node, rather than floating pins. Distinctive, cheap,
straight out of the source, and it needs no illustrator.

Worth keeping in reserve rather than building on day one.

## September scope

In:

- The palette and role tokens, in one file, feeding both DOM and materials
- IBM Plex Sans Thai, self-hosted, covering both scripts
- The ramp derivation and the contrast check, both as tested pure functions
- Colour management settled in the same commit as the tokens

Out, and deliberately so: a component library, runtime theme switching for visitors, paper grain
and print-misregistration effects. The last of those is a genuinely good idea for item 6 polish if
the buffer survives, and nothing before it depends on it.

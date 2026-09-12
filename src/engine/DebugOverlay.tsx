'use client';

import { Box, Edges } from '@react-three/drei';
import { PALETTE, UI_TOKENS } from './theme';

/**
 * Twenty lines that turn "looks wrong" into "is 100x too big".
 *
 * 3D bugs do not produce stack traces, which is exactly where LLM-assisted work is
 * weakest — so this goes in on day one, per CLAUDE.md.
 */
export function DebugOverlay({ wireframe }: { wireframe: boolean }) {
  return (
    <group>
      <axesHelper args={[20]} />
      {/* A 1 m cube in clear ground, NOT at the origin — the origin sits inside the
          temple footprint, where the cube cannot be compared against anything. If
          this does not read as a doorstep beside a shophouse, the projection or the
          extrusion is wrong, and that is the bug this catches. */}
      <Box args={[1, 1, 1]} position={[-14, 0.5, -70]}>
        <meshBasicMaterial color={UI_TOKENS['ui.accent']} toneMapped={false} />
        <Edges color={UI_TOKENS['ui.text']} />
      </Box>
      {/* 10 m grid, so distances are readable without measuring. */}
      <gridHelper
        args={[400, 40, PALETTE['progress.ink'], PALETTE['progress.ink']]}
        position={[20, 0.01, 0]}
      />
      {wireframe && <WireframeTint />}
    </group>
  );
}

function WireframeTint() {
  // Rendered as a marker rather than mutating every material: the toggle is read by
  // Diorama, which sets wireframe on the building materials themselves.
  return null;
}

/**
 * The colour-management check, in the DOM rather than the canvas.
 *
 * three.js treats a hex as sRGB and converts to a linear working space. If that is
 * set up wrongly, a building and its swatch disagree. Putting the swatches on screen
 * makes verification step 5 something you can actually see.
 */
export function TokenSwatches() {
  return (
    <div className="swatches" aria-label="Design token swatches, for colour checking">
      {Object.entries(PALETTE).map(([name, value]) => (
        <span key={name} title={`${name} ${value}`} style={{ background: value }} />
      ))}
    </div>
  );
}

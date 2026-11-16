# Pulse Grid

The reference sketch: copy its structure, not its look.

## Idea

A wall of rounded tiles that breathes with the beat. Each hit starts at a
slowly wandering center and ripples to the corners, so the frame reads as one
surface being struck rather than many tiles blinking together.

## Rhythm

120 BPM, 4 bars of 4/4. Tiles hit on quarter notes; the ripple takes one beat
to reach the farthest corner.

## Look

Cyan tiles screened over a deep violet gradient. Roughly one tile in five
flashes pink on a hit, re-rolled per hit and per tile.

## Assets

None.

## Notes

- Works on every canvas: tile size derives from the shorter side.
- The ripple delay is a per-tile grid offset, which is what keeps it seamless.

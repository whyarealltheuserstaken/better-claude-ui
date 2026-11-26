// Draws the two tray icons: `node tools/make-tray-icons.mjs`.
// Normal is a ring; waiting is a filled disc with an exclamation mark, so shape differs as well as colour.
import { writeFileSync } from "node:fs";
import { rgbaPng } from "./png.mjs";

const SIZE = 32;
const SUB = 4; // samples per pixel edge, for smooth outlines
const RING = [124, 134, 240];
const AMBER = [242, 184, 75];
const INK = [29, 21, 3];

/** shade(dx, dy) gives the colour at an offset from the centre, or null for nothing. */
function draw(shade) {
  return rgbaPng(SIZE, (x, y) => {
    const sum = [0, 0, 0];
    let hits = 0;
    for (let i = 0; i < SUB; i++) {
      for (let j = 0; j < SUB; j++) {
        const colour = shade(x + (i + 0.5) / SUB - SIZE / 2, y + (j + 0.5) / SUB - SIZE / 2);
        if (!colour) continue;
        hits += 1;
        colour.forEach((c, k) => (sum[k] += c));
      }
    }
    return hits ? [...sum.map((c) => Math.round(c / hits)), Math.round((255 * hits) / (SUB * SUB))] : [0, 0, 0, 0];
  });
}

const normal = draw((dx, dy) => {
  const r = Math.hypot(dx, dy);
  return (r <= 14 && r >= 8) || r <= 3 ? RING : null;
});

const waiting = draw((dx, dy) => {
  if (Math.hypot(dx, dy) > 15) return null;
  const bar = Math.abs(dx) <= 2.4 && dy >= -9 && dy <= 3;
  const dot = Math.hypot(dx, dy - 8) <= 2.6;
  return bar || dot ? INK : AMBER;
});

writeFileSync(new URL("../src-tauri/icons/tray.png", import.meta.url), normal);
writeFileSync(new URL("../src-tauri/icons/tray-waiting.png", import.meta.url), waiting);

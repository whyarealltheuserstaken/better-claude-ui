/** Small colour maths for 6-digit hex colours: WCAG contrast, mixing and hue. Pure. */

type Rgb = [number, number, number];

export function toRgb(hex: string): Rgb {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
}

const toHex = (c: Rgb) => "#" + c.map((n) => Math.round(n).toString(16).padStart(2, "0")).join("");

/** t=0 gives `a`, t=1 gives `b`. */
export function mix(a: string, b: string, t: number): string {
  const x = toRgb(a);
  const y = toRgb(b);
  return toHex(x.map((v, i) => v + (y[i] - v) * t) as Rgb);
}

function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (hi + 0.05) / (lo + 0.05);
}

const worst = (fg: string, bgs: string[]) => Math.min(...bgs.map((bg) => contrast(fg, bg)));

/** `fg` if it already passes on every background, else the smallest move toward black or white that does. */
export function ensureContrast(fg: string, bgs: string[], min = 4.5): string {
  if (worst(fg, bgs) >= min) return fg;
  for (let step = 1; step <= 50; step++) {
    const options = ["#ffffff", "#000000"].map((end) => mix(fg, end, step / 50)).filter((c) => worst(c, bgs) >= min);
    if (options.length > 0) return options.sort((a, b) => worst(b, bgs) - worst(a, bgs))[0];
  }
  return worst("#ffffff", bgs) >= worst("#000000", bgs) ? "#ffffff" : "#000000";
}

function hsl(hex: string): Rgb {
  const [r, g, b] = toRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

/** Degrees apart on the colour wheel, 0..180. */
export function hueDistance(a: string, b: string): number {
  const d = Math.abs(hsl(a)[0] - hsl(b)[0]);
  return Math.min(d, 360 - d);
}

export function rotateHue(hex: string, degrees: number): string {
  const [h, s, l] = hsl(hex);
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hh = (((h + degrees) % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  const table: Rgb[] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]];
  const m = l - c / 2;
  return toHex(table[Math.floor(hh) % 6].map((v) => (v + m) * 255) as Rgb);
}

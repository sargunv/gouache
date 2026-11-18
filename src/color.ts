// Small color math for deriving tokens, such as a POI label's color from its
// icon's.

function parse(hex: string): number[] {
  const value = hex.replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((digit) => digit + digit)
          .join("")
      : value;
  return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16));
}

function format(rgb: number[]): string {
  return `#${rgb
    .map((channel) =>
      Math.round(Math.min(255, Math.max(0, channel)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/** `a` mixed with `b`: 0 gives `a`, 1 gives `b`. */
export function mix(a: string, b: string, t: number): string {
  const x = parse(a);
  const y = parse(b);
  return format(x.map((channel, i) => channel * (1 - t) + (y[i] ?? 0) * t));
}

/** `hex` as an rgba() color with `alpha`. */
export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = parse(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

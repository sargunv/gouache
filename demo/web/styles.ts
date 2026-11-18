// The styles the page offers. `dark` turns the page's controls dark.

/** A style the page can show; `key` is null for one from a URL. */
export interface Style {
  key: string | null;
  name: string;
  /** An absolute URL. */
  url: string;
  /** A second line under the name, such as where the style comes from. */
  detail?: string;
  dark?: boolean;
}

/** The built style's content hash, from vite.config.ts. */
declare const __STYLE_VERSION__: string;

/** Each style's URL, relative to the page, is resolved against it. */
export const STYLES: Style[] = [
  {
    key: "gouache",
    name: "Gouache",
    url: `./style.json?v=${__STYLE_VERSION__}`,
  },
].map((style) => ({ ...style, url: new URL(style.url, location.href).href }));

// The style for `?style=`: a key of STYLES, or any style's URL, which the
// page names by the style's own name once it loads. Without one, the first
// of STYLES.
export function styleFor(param: string | null): Style {
  const [first] = STYLES;
  if (first === undefined) throw new Error("STYLES is empty");
  if (param === null) return first;
  const url = new URL(param, location.href);
  const known = STYLES.find(
    (style) => style.key === param || style.url === url.href,
  );
  if (known) return known;
  return { key: null, name: "Custom style", detail: url.host, url: url.href };
}

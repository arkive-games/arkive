// Theme tokens for engine-rendered chrome. Defaults follow Arkive's canonical
// Radix palette so every current and future game inherits the same colors.

/** Colors used by `createPinIcon` (marker pins + completion/fragment badges). */
export interface PinTheme {
  /** Fallback "pin" variant: dark translucent outer disc background. */
  pinDiscBg: string;
  /** Fallback "pin" variant: hairline border around the disc. */
  pinBorder: string;
  /** Fallback "pin" variant: default inner-dot color (subtype color overrides). */
  pinDot: string;
  /** "circular" variant: default ring color when a subtype declares no `color`
   *  (e.g. wild pals stay white; a boss subtype can set red via its color). */
  circularBorder: string;
  /** Completed tick + fragment air/water chevron badge color. */
  completedAccent: string;
}

/** Full engine theme: pin colors plus the map chrome (zoom control, status bar). */
export interface MapTheme extends PinTheme {
  /** Zoom-control +/− glyph color. */
  zoomGlyph: string;
  /** Cursor-coordinates pill background in the status bar. */
  statusPillBg: string;
}

export const DEFAULT_PIN_THEME: PinTheme = {
  pinDiscBg: "rgba(0,0,0,0.6)", // 圆形 17 background
  pinBorder: "rgba(255,255,255,1)", // 0.5px hairline
  pinDot: "#0090FF",
  circularBorder: "rgba(255,255,255,0.9)", // creatures/pals: white hairline ring
  completedAccent: "#30A46C",
};

export const DEFAULT_MAP_THEME: MapTheme = {
  ...DEFAULT_PIN_THEME,
  zoomGlyph: "#202020",
  statusPillBg: "rgba(249,249,249,0.94)",
};

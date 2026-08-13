/**
 * Pin colours, on their own so that reading them costs nothing.
 *
 * This module imports NOTHING — not three.js, not React, not even a type. That
 * is its whole reason for existing: an app builds its game theme by spreading
 * `DEFAULT_MAP_THEME` and hands the result to the map view as a prop, and that
 * usually happens in a module which is NOT part of the lazily-loaded map chunk.
 * While these values lived in `pinAtlas.ts` (which needs three.js for its canvas
 * textures), importing them dragged the whole ~1.5 MB engine into the entry
 * chunk of every app.
 *
 * `pinAtlas.ts` re-exports both names, so the barrel's public surface is
 * unchanged and there is still exactly one declaration of each.
 */
export interface PinTheme {
  /** Fallback "pin" variant: dark translucent outer disc background. */
  pinDiscBg: string;
  /** Fallback "pin" variant: hairline border around the disc. */
  pinBorder: string;
  /** Fallback "pin" variant: default inner-dot colour (subtype colour wins). */
  pinDot: string;
  /** "circular" variant: default ring colour when the subtype declares none. */
  circularBorder: string;
  /** Completed tick + fragment air/water chevron colour. */
  completedAccent: string;
}

export const DEFAULT_PIN_THEME: PinTheme = {
  pinDiscBg: "rgba(0,0,0,0.6)",
  pinBorder: "rgba(255,255,255,1)",
  pinDot: "#0090FF",
  circularBorder: "rgba(255,255,255,0.9)",
  completedAccent: "#30A46C",
};

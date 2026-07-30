import { DEFAULT_MAP_THEME, type MapTheme } from '@gamemap/map-engine'

/**
 * Engine-chrome colours. The defaults are AION2's blue Lanhu palette; V Rising's
 * map is warm parchment, so the pin disc and status pill go to dark iron and the
 * accent dot to the game's blood crimson.
 */
export const vrisingTheme: MapTheme = {
  ...DEFAULT_MAP_THEME,
  pinDiscBg: '#221E1F',
  pinBorder: '#D8B45E',
  pinDot: '#D6404A',
  completedAccent: '#D8B45E',
  zoomGlyph: '#E6DED4',
  statusPillBg: 'rgba(16, 14, 15, 0.82)',
}

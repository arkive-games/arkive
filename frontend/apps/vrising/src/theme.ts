import { DEFAULT_MAP_THEME, type MapTheme } from '@gamemap/map-engine'

/** V Rising uses the same Arkive map-engine chrome as the migrated games. */
export const vrisingTheme: MapTheme = {
  ...DEFAULT_MAP_THEME,
  pinDot: '#0F4C49',
  completedAccent: '#EE8A45',
  zoomGlyph: '#153F3D',
  statusPillBg: 'rgba(248, 251, 249, 0.94)',
}

import {
  IconChartBar,
  IconDna2,
  IconGauge,
  IconRoute,
  IconTrophy,
  type Icon,
} from '@tabler/icons-react'

/** Keyed by feature id; a tool without an entry gets the generic wrench. */
export const TOOL_ICONS: Record<string, Icon> = {
  'palworld-breeding': IconDna2,
  'palworld-stat-simulator': IconChartBar,
  'gmzz-score': IconGauge,
  'gmzz-league-points': IconTrophy,
  'gmzz-traintrade-station': IconRoute,
}

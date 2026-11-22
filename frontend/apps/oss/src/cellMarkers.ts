interface CellMarker { id: string; subtype: string; x: number; y: number }

export function indexCellMarkers<T extends CellMarker>(markers: T[], visible: Set<string>, results: Set<string>, selected: string | null) {
  const cells = new Map<string, T[]>()
  const peers = new Map<string, T[]>()
  for (const marker of markers) {
    if (!visible.has(marker.subtype) && marker.id !== selected && !results.has(marker.id)) continue
    const key = `${marker.x},${marker.y}`
    const group = cells.get(key)
    if (group) group.push(marker)
    else cells.set(key, [marker])
  }
  const representatives = []
  for (const group of cells.values()) {
    representatives.push(group.find(m => m.id === selected) ?? group.find(m => results.has(m.id)) ?? group[0])
    if (group.length > 1) for (const marker of group) peers.set(marker.id, group)
  }
  return { representatives, peers }
}

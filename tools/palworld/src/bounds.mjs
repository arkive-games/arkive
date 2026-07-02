export function assignMap(world, maps) {
  for (const m of maps) {
    if (world.X >= m.min.X && world.X <= m.max.X && world.Y >= m.min.Y && world.Y <= m.max.Y) {
      return m.mapId;
    }
  }
  return null;
}

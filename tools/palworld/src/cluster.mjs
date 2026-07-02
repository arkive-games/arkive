const round2 = (v) => Math.round(v * 100) / 100;

export function clusterPoints(points, radius) {
  const sorted = [...points].sort(
    (a, b) => a.x - b.x || a.y - b.y || (a.z ?? 0) - (b.z ?? 0),
  );
  const r2 = radius * radius;
  const clusters = [];
  for (const p of sorted) {
    let placed = false;
    for (const c of clusters) {
      const n = c.items.length;
      const dx = p.x - c.sx / n;
      const dy = p.y - c.sy / n;
      if (dx * dx + dy * dy <= r2) {
        c.items.push(p);
        c.sx += p.x; c.sy += p.y; c.sz += p.z ?? 0;
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push({ items: [p], sx: p.x, sy: p.y, sz: p.z ?? 0 });
  }
  return clusters.map((c) => ({
    x: round2(c.sx / c.items.length),
    y: round2(c.sy / c.items.length),
    z: round2(c.sz / c.items.length),
    items: c.items,
  }));
}

/** Ordered, content-sized rows: fewest rows first, then narrowest balanced surface. */
export function balanceFacetRows(widths: number[], budget: number, gap: number): number[][] {
  if (!widths.length) return []
  const sizes = widths.map(width => Math.min(width, budget))
  const prefix = [0]
  for (const width of sizes) prefix.push(prefix[prefix.length - 1] + width)
  const span = (start: number, end: number) => prefix[end] - prefix[start] + gap * (end - start - 1)
  const n = sizes.length
  for (let rows = 1; rows <= n; rows++) {
    const best = Array.from({ length: rows + 1 }, () => Array<number>(n + 1).fill(Infinity))
    best[0][0] = 0
    for (let r = 1; r <= rows; r++) for (let end = r; end <= n; end++) {
      for (let start = r - 1; start < end; start++) {
        best[r][end] = Math.min(best[r][end], Math.max(best[r - 1][start], span(start, end)))
      }
    }
    const cap = best[rows][n]
    if (cap > budget + 0.1) continue
    // With the minimum longest row fixed, minimize squared widths to balance rows.
    const costs = Array.from({ length: rows + 1 }, () => Array<number>(n + 1).fill(Infinity))
    const cuts = Array.from({ length: rows + 1 }, () => Array<number>(n + 1).fill(0))
    costs[0][0] = 0
    for (let r = 1; r <= rows; r++) for (let end = r; end <= n; end++) {
      for (let start = r - 1; start < end; start++) {
        const width = span(start, end)
        const cost = costs[r - 1][start] + width * width
        if (width <= cap + 0.1 && cost < costs[r][end]) {
          costs[r][end] = cost
          cuts[r][end] = start
        }
      }
    }
    const result: number[][] = []
    let end = n
    for (let r = rows; r > 0; r--) {
      const start = cuts[r][end]
      result.unshift(Array.from({ length: end - start }, (_, index) => start + index))
      end = start
    }
    return result
  }
  return sizes.map((_, index) => [index])
}

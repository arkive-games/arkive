// Horizontal edges occupy two characters: a difference of zero is encoded as "-0".
export function horizontalGlimmithEdgeMark(line: string, column: number) {
  const start = 3 * column + 1
  const field = line.slice(start, start + 2)
  return /^-[0-9]$/.test(field) ? field[1] : field[0]
}

export function glimmithVertexMark(line: string, column: number) {
  const mark = line[3 * column]
  return mark === '1' || mark === '2' || mark === '3' || mark === '4' ? mark : undefined
}

export const glimmithInequalityRotation = { '>': 0, '<': 180, '^': -90, v: 90 } as const

export function glimmithInequalityAngle(mark: string) {
  return Object.hasOwn(glimmithInequalityRotation, mark)
    ? glimmithInequalityRotation[mark as keyof typeof glimmithInequalityRotation]
    : undefined
}

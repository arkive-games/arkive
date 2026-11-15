let guard: ((leave?: () => void) => boolean) | undefined
export function registerBuildNavigationGuard(next: (leave?: () => void) => boolean): () => void {
  guard = next
  return () => { if (guard === next) guard = undefined }
}
export function canLeaveBuild(): boolean { return guard?.() ?? true }
export function requestBuildDeparture(leave: () => void): void {
  if (guard?.(leave) ?? true) leave()
}

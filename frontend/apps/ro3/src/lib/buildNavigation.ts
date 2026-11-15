let guard: (() => boolean) | undefined
export function registerBuildNavigationGuard(next: () => boolean): () => void {
  guard = next
  return () => { if (guard === next) guard = undefined }
}
export function canLeaveBuild(): boolean { return guard?.() ?? true }

export function cleanGameText(value: string, runtimeValue: string): string {
  return value
    .replace(/\\n/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\{[^}]+\}/g, runtimeValue)
    .trim()
}

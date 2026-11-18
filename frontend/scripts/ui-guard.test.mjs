import { describe, expect, it } from 'vitest'
import { findings, inScope, newFindings, checkTokenOwnership } from './ui-guard.mjs'

describe('shared UI guard', () => {
  it('rejects new pixel type, numeric layers, custom radii, color literals and 100vh/h-screen units', () => {
    const actual = findings('packages/ui/src/new-control.tsx', 'className="text-[11px] z-[5001] rounded-[9px] text-[#abc] h-screen min-h-[100vh]"')
    expect(actual.map(item => item.rule)).toEqual(['pixel-type', 'numeric-layer', 'custom-radius', 'literal-color', 'viewport-unit', 'viewport-unit'])
  })
  it('accepts semantic roles, scale classes, comments and game-data boundaries', () => {
    expect(findings('packages/ui/src/control.tsx', '/* font-size: 10px */\n// z-[9999]\nclassName="text-sm rounded-full z-[var(--arkive-layer-popover)] bg-primary"')).toEqual([])
    expect(findings('packages/ui/src/control.tsx', 'const url = "https://arkive.games"; // text-[10px]\nconst size = "text-[11px]"')).toHaveLength(1)
    expect(inScope('apps/ro3/src/locales/zh-CN.json')).toBe(false)
    expect(inScope('apps/ro3/src/CardWiki.tsx')).toBe(false)
    expect(inScope('apps/ro3/src/components/TopNav.tsx')).toBe(true)
    expect(inScope('apps/sts2/src/components/ContentPage.tsx')).toBe(false)
    expect(findings('packages/ui/src/control.tsx', 'className="h-dvh min-h-[100dvh] max-h-[80svh]"')).toEqual([])
  })
  it('does not grandfather duplicates, changed values or moved violations', () => {
    const [old] = findings('packages/ui/src/a.tsx', 'className="text-[11px]"')
    const baseline = { [old.id]: 1 }
    expect(newFindings([old], baseline)).toEqual([])
    expect(newFindings([old, old], baseline)).toEqual([old])
    expect(newFindings(findings('packages/ui/src/a.tsx', 'className="text-[10px]"'), baseline)).toHaveLength(1)
    expect(newFindings(findings('packages/ui/src/b.tsx', 'className="text-[11px]"'), baseline)).toHaveLength(1)
  })
  it('rejects token redefinition and app-owned search styling', () => {
    const errors = checkTokenOwnership({ 'apps/meta/src/components/bad.css': '--arkive-catalog-control-height: 2rem; .catalog-search { color: red }' })
    expect(errors.some(error => error.includes('must be defined only'))).toBe(true)
    expect(errors.some(error => error.includes('catalog search styling belongs'))).toBe(true)
    expect(errors.some(error => error.includes('missing --arkive-encyclopedia-rail-expanded'))).toBe(true)
    expect(checkTokenOwnership({ 'apps/meta/src/all-games.css': '.catalog-search { order: 2; width: 100%; }' }).some(error => error.includes('catalog search styling belongs'))).toBe(false)
  })
  it.each(['h-screen', 'min-h-screen', 'max-h-screen', 'md:h-screen', 'height: 100vh', 'minHeight: "100vh"'])(
    'rejects static viewport height: %s', value => {
      expect(findings('packages/ui/src/control.tsx', value).map(item => item.rule)).toEqual(['viewport-unit'])
    },
  )
  it('requires a working class-based dark variant for every app importing the shared theme', () => {
    const themeImport = '@import "@gamemap/map-shell/arkive-map-theme.css";'
    const errors = source => checkTokenOwnership({ 'apps/future-game/src/index.css': source }).filter(error => error.includes('@custom-variant dark'))
    expect(errors(themeImport)).toHaveLength(1)
    expect(errors(`${themeImport}\n/* @custom-variant dark (&:is(.dark *)); */`)).toHaveLength(1)
    expect(errors(`${themeImport}\n@custom-variant dark (&:is(.light *));`)).toHaveLength(1)
    expect(errors(`${themeImport}\n@custom-variant dark (&:is(.dark *));`)).toEqual([])
    expect(errors(`/* ${themeImport} */`)).toEqual([])
  })
})

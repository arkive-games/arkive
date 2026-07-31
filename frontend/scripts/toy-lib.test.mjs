import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  validateToyConfig,
  checkPackage,
  decidePublishAction,
} from './toy-lib.mjs'

const GOOD_CONFIG = {
  slug: 'arkive-palworld',
  title: '幻兽帕鲁 · Arkive',
  visibility: 'public',
  dataDir: 'data-palworld',
  resourceDir: 'resource-palworld',
  dataBase: 'data',
  resourceBase: 'palres',
}

describe('validateToyConfig', () => {
  it('accepts a complete config', () => {
    expect(() => validateToyConfig(GOOD_CONFIG)).not.toThrow()
  })
  it('rejects a missing required key', () => {
    const { slug, ...rest } = GOOD_CONFIG
    expect(() => validateToyConfig(rest)).toThrow(/slug/)
  })
  it('rejects an invalid slug (uppercase / leading hyphen)', () => {
    expect(() => validateToyConfig({ ...GOOD_CONFIG, slug: 'Arkive-Palworld' })).toThrow(/slug/)
    expect(() => validateToyConfig({ ...GOOD_CONFIG, slug: '-palworld' })).toThrow(/slug/)
  })
  it('rejects an unknown visibility', () => {
    expect(() => validateToyConfig({ ...GOOD_CONFIG, visibility: 'private' })).toThrow(/visibility/)
  })
  it('rejects dataBase/resourceBase containing path separators', () => {
    expect(() => validateToyConfig({ ...GOOD_CONFIG, dataBase: 'a/b' })).toThrow(/dataBase/)
    expect(() => validateToyConfig({ ...GOOD_CONFIG, resourceBase: '../x' })).toThrow(/resourceBase/)
  })
})

describe('checkPackage', () => {
  let dir
  beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), 'toy-pkg-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('passes a clean package', () => {
    writeFileSync(path.join(dir, 'index.html'),
      '<html><head><script src="./assets/app.js"></script></head></html>')
    mkdirSync(path.join(dir, 'assets'))
    writeFileSync(path.join(dir, 'assets', 'app.js'), '')
    expect(checkPackage(dir).errors).toEqual([])
  })
  it('errors when index.html is missing at the root', () => {
    const { errors } = checkPackage(dir)
    expect(errors.join('\n')).toMatch(/index\.html/)
  })
  it('errors on root-absolute src/href in HTML', () => {
    writeFileSync(path.join(dir, 'index.html'),
      '<html><script src="/assets/app.js"></script></html>')
    const { errors } = checkPackage(dir)
    expect(errors.join('\n')).toMatch(/root-absolute/)
  })
  it('does not flag protocol-relative or external URLs', () => {
    writeFileSync(path.join(dir, 'index.html'),
      '<html><a href="https://example.com/x">x</a><img src="//cdn.example.com/i.png"></html>')
    expect(checkPackage(dir).errors).toEqual([])
  })
  it('errors on forbidden entries (.git, node_modules, toy.yaml)', () => {
    writeFileSync(path.join(dir, 'index.html'), '<html></html>')
    mkdirSync(path.join(dir, 'sub', '.git'), { recursive: true })
    writeFileSync(path.join(dir, 'toy.yaml'), '')
    const { errors } = checkPackage(dir)
    expect(errors.join('\n')).toMatch(/\.git/)
    expect(errors.join('\n')).toMatch(/toy\.yaml/)
  })
})

describe('decidePublishAction', () => {
  it('prefers the local history record', () => {
    const action = decidePublishAction({
      history: [{ id: '123', slug: 'arkive-palworld' }],
      mylist: [],
      slug: 'arkive-palworld',
    })
    expect(action).toEqual({ mode: 'update', id: '123', reason: expect.stringContaining('history') })
  })
  it('falls back to a slug match in mylist', () => {
    const action = decidePublishAction({
      history: [],
      mylist: [{ id: '456', slug: 'arkive-palworld' }, { id: '789', slug: 'other' }],
      slug: 'arkive-palworld',
    })
    expect(action).toEqual({ mode: 'update', id: '456', reason: expect.stringContaining('mylist') })
  })
  it('creates when neither knows the slug', () => {
    const action = decidePublishAction({ history: [], mylist: [], slug: 'arkive-palworld' })
    expect(action.mode).toBe('create')
  })
})

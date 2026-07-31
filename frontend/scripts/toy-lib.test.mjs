import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  validateToyConfig,
  bundlesArtifacts,
  fetchesArtifacts,
  yamlToJson,
  checkPackage,
  decidePublishAction,
  slugFromToyUrl,
  parseArgs,
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

// The portal (apps/meta): pure site, nothing to fetch, so no artifact keys.
const SITE_ONLY_CONFIG = {
  slug: 'arkive',
  title: '藏舟攻略网 · Arkive',
  visibility: 'public',
  poster: 'toy-poster.png',
}

// aion2: site only, artifacts fetched from the same CDN the website uses.
const URL_ONLY = {
  dataUrl: 'https://data-aion2.tc-imba.com',
  resourceUrl: 'https://resource-aion2.tc-imba.com',
}
const URL_CONFIG = {
  slug: 'arkive-aion2',
  title: '永恒之塔2 · Arkive',
  visibility: 'public',
  poster: 'toy-poster.png',
  ...URL_ONLY,
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
  it('rejects dataBase equal to resourceBase (they become sibling folders)', () => {
    expect(() => validateToyConfig({ ...GOOD_CONFIG, resourceBase: 'data' })).toThrow(/must differ/)
  })
  it('accepts a site-only config with no artifact keys', () => {
    expect(() => validateToyConfig(SITE_ONLY_CONFIG)).not.toThrow()
  })
  it('rejects a partial artifact group', () => {
    const { resourceDir, ...missingOne } = GOOD_CONFIG
    expect(() => validateToyConfig(missingOne)).toThrow(/all-or-nothing/)
    expect(() => validateToyConfig({ ...SITE_ONLY_CONFIG, dataBase: 'data' })).toThrow(/all-or-nothing/)
  })
  it('rejects an artifact key present but empty', () => {
    expect(() => validateToyConfig({ ...GOOD_CONFIG, dataDir: '' })).toThrow(/dataDir/)
  })

  // Fetching artifacts instead of bundling them — aion2, whose 29k files made
  // the platform time out generating a preview even though the size passed.
  it('accepts absolute artifact URLs with no bundling keys', () => {
    expect(() => validateToyConfig(URL_CONFIG)).not.toThrow()
  })
  it('rejects artifact URLs alongside bundling keys', () => {
    expect(() => validateToyConfig({ ...GOOD_CONFIG, ...URL_ONLY })).toThrow(/mutually exclusive/)
  })
  it('rejects one artifact URL without the other', () => {
    const { resourceUrl, ...half } = URL_CONFIG
    expect(() => validateToyConfig(half)).toThrow(/are a pair/)
  })
  it('rejects a relative or non-https artifact URL', () => {
    for (const dataUrl of ['/data', 'data', '//data.example.com', 'http://data.example.com']) {
      expect(() => validateToyConfig({ ...URL_CONFIG, dataUrl })).toThrow(/absolute URL|must be https/)
    }
  })
  it('rejects a trailing slash (the app joins path segments itself)', () => {
    expect(() => validateToyConfig({ ...URL_CONFIG, dataUrl: 'https://data.example.com/' }))
      .toThrow(/must not end in/)
  })
})

describe('bundlesArtifacts / fetchesArtifacts', () => {
  it('is true for a game config and false for a site-only one', () => {
    expect(bundlesArtifacts(validateToyConfig(GOOD_CONFIG))).toBe(true)
    expect(bundlesArtifacts(validateToyConfig(SITE_ONLY_CONFIG))).toBe(false)
  })
  it('separates fetching from bundling and from a pure site', () => {
    expect(fetchesArtifacts(validateToyConfig(URL_CONFIG))).toBe(true)
    expect(bundlesArtifacts(validateToyConfig(URL_CONFIG))).toBe(false)
    expect(fetchesArtifacts(validateToyConfig(GOOD_CONFIG))).toBe(false)
    expect(fetchesArtifacts(validateToyConfig(SITE_ONLY_CONFIG))).toBe(false)
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

describe('yamlToJson', () => {
  let dir
  beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), 'toy-yaml-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  // Stand-in for `yaml.parse`; the real one is injected by toy-build.
  const parse = (text) => JSON.parse(text)

  it('replaces nested .yaml with .json and removes the source', () => {
    mkdirSync(path.join(dir, 'locales', 'zh-CN'), { recursive: true })
    const yaml = path.join(dir, 'locales', 'zh-CN', 'common.yaml')
    writeFileSync(yaml, '{"a":{"b":"c"}}')
    expect(yamlToJson(dir, parse)).toBe(1)
    expect(existsSync(yaml)).toBe(false)
    const json = path.join(dir, 'locales', 'zh-CN', 'common.json')
    expect(JSON.parse(readFileSync(json, 'utf8'))).toEqual({ a: { b: 'c' } })
  })
  it('leaves other extensions alone', () => {
    writeFileSync(path.join(dir, 'index.html'), '<html></html>')
    writeFileSync(path.join(dir, 'a.json'), '{}')
    expect(yamlToJson(dir, parse)).toBe(0)
    expect(existsSync(path.join(dir, 'index.html'))).toBe(true)
  })
  it('handles the .yml spelling too', () => {
    writeFileSync(path.join(dir, 'x.yml'), '{"k":1}')
    expect(yamlToJson(dir, parse)).toBe(1)
    expect(existsSync(path.join(dir, 'x.json'))).toBe(true)
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
  it('skips a history record whose slug does not match', () => {
    const action = decidePublishAction({
      history: [{ id: '123', slug: 'other' }],
      mylist: [{ id: '456', slug: 'arkive-palworld' }],
      slug: 'arkive-palworld',
    })
    expect(action).toEqual({ mode: 'update', id: '456', reason: expect.stringContaining('mylist') })
  })
  it('matches a history record with no slug field by id alone', () => {
    const action = decidePublishAction({
      history: [{ id: '123' }],
      mylist: [],
      slug: 'arkive-palworld',
    })
    expect(action).toEqual({ mode: 'update', id: '123', reason: expect.stringContaining('history') })
  })
  it('matches a real-shape mylist record (no slug/sub_dir, slug embedded in url)', () => {
    const action = decidePublishAction({
      history: [],
      mylist: [
        { id: 16422826778624, url: 'https://www.bilibili.com/toy/merge-creeper/index.html' },
        { id: 999, url: 'https://www.bilibili.com/toy/arkive-palworld/index.html' },
      ],
      slug: 'arkive-palworld',
    })
    expect(action).toEqual({ mode: 'update', id: '999', reason: expect.stringContaining('mylist') })
  })
})

describe('slugFromToyUrl', () => {
  it('extracts the slug path segment', () => {
    expect(slugFromToyUrl('https://www.bilibili.com/toy/merge-creeper/index.html')).toBe('merge-creeper')
  })
  it('returns null for a non-toy or malformed url', () => {
    expect(slugFromToyUrl('https://www.bilibili.com/video/BV1xx')).toBeNull()
    expect(slugFromToyUrl(undefined)).toBeNull()
    expect(slugFromToyUrl(null)).toBeNull()
  })
})

describe('parseArgs', () => {
  it('parses value flags', () => {
    expect(parseArgs(['--app', 'palworld'])).toEqual({ app: 'palworld' })
  })
  it('parses boolean flags via the second parameter', () => {
    expect(parseArgs(['--submit'], ['submit'])).toEqual({ submit: true })
  })
  it('throws when a flag is missing its value', () => {
    expect(() => parseArgs(['--app'])).toThrow(/needs a value/)
  })
  it('throws when a flag is followed by another flag', () => {
    expect(() => parseArgs(['--app', '--submit'])).toThrow(/needs a value/)
  })
})

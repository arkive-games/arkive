import { Packr } from 'msgpackr'

// The client's SchemeUtils: two big-endian uint32s per 12 Base62 characters.
const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const SIGN_KEY = 10745794
const codec = new Packr({ useRecords: false, mapsAsObjects: false, moreTypes: false, variableMapSize: true })
export const MAX_CODE_LENGTH = 100_000

export function toBase62(bytes: Uint8Array): string {
  const padded = new Uint8Array(Math.ceil(bytes.length / 8) * 8)
  padded.set(bytes)
  const view = new DataView(padded.buffer)
  let out = ''
  for (let i = 0; i < padded.length; i += 4) {
    let word = view.getUint32(i)
    let part = ''
    for (let digit = 0; digit < 6; digit++) {
      part = ALPHABET[word % 62] + part
      word = Math.floor(word / 62)
    }
    out += part
  }
  return out
}

export function fromBase62(text: string): Uint8Array {
  if (!text || text.length % 12 || !/^[0-9A-Za-z]+$/.test(text)) throw new Error('Invalid Base62')
  const bytes = new Uint8Array(text.length / 6 * 4)
  const view = new DataView(bytes.buffer)
  for (let i = 0; i < text.length; i += 6) {
    let word = 0
    for (const char of text.slice(i, i + 6)) word = word * 62 + ALPHABET.indexOf(char)
    if (word > 0xffffffff) throw new Error('Base62 overflow')
    view.setUint32(i / 6 * 4, word)
  }
  return bytes
}

export function checksum(bytes: Uint8Array): number {
  let hash = 2166136261
  for (let i = 0; i < 3; i++) hash = Math.imul(hash ^ ((SIGN_KEY >>> (8 * i)) & 255), 16777619)
  for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619)
  return hash >>> 0
}

export function signBytes(bytes: Uint8Array): string {
  const body = toBase62(bytes)
  const signature = new Uint8Array(4)
  new DataView(signature.buffer).setUint32(0, checksum(fromBase62(body)))
  return toBase62(signature) + body
}

export function extractCode(input: string): string {
  if (input.length > MAX_CODE_LENGTH) throw new Error('Share code too long')
  const code = (input.match(/\[\[([\s\S]*?)\]\]/)?.[1] ?? input).replace(/\s/g, '')
  if (code.length < 24 || code.length % 12 || !/^[0-9A-Za-z]+$/.test(code)) throw new Error('Invalid share code')
  return code
}

export function decodeShare(input: string): Map<number, unknown> {
  const code = extractCode(input)
  const signature = fromBase62(code.slice(0, 12))
  const bytes = fromBase62(code.slice(12))
  if (new DataView(signature.buffer).getUint32(0) !== checksum(bytes)) throw new Error('Invalid checksum')
  let result: unknown
  let end = 0
  codec.unpackMultiple(bytes, (value: unknown, _start?: number, finish?: number) => {
    result = value
    end = finish ?? 0
    return false
  })
  if (!end || bytes.length - end > 7 || bytes.slice(end).some((byte) => byte !== 0)) throw new Error('Invalid padding')
  if (!(result instanceof Map) || !Number.isSafeInteger(result.get(2)) || result.get(2) <= 0) throw new Error('Missing pathway')
  return result as Map<number, unknown>
}

export function encodeShare(data: Map<number, unknown>): string {
  return '[[' + signBytes(codec.pack(data)) + ']]'
}

/** String-keyed action tables become objects; numeric scheme keys stay Maps. */
export function plain(value: unknown): unknown {
  if (value instanceof Map) return Object.fromEntries([...value].map(([key, item]) => [String(key), plain(item)]))
  if (Array.isArray(value)) return value.map(plain)
  return value
}

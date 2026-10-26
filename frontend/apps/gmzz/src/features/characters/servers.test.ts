import { describe, expect, it } from 'vitest'

import { serverName } from './servers'

const servers = [{ id: 1101, name: '灰雾之上' }, { id: 1201, name: '愚者' }]

describe('serverName', () => {
  it('names a listed server and nothing for none', () => {
    expect(serverName(servers, 1201, '?')).toBe('愚者')
    expect(serverName(servers, undefined, '?')).toBeUndefined()
  })

  it('reads an id the list lacks as unknown, but not before the list has loaded', () => {
    expect(serverName(servers, 9999, 'unknown')).toBe('unknown')
    expect(serverName([], 1101, 'unknown')).toBeUndefined()
  })
})

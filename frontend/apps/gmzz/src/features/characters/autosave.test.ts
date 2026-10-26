import { describe, expect, it } from 'vitest'

import { AutoSaver, type Timers } from './autosave'

/** Hand-cranked time: `advance` fires every timer that falls due, in order. */
function fakeTimers() {
  let now = 0
  let next = 0
  const queue = new Map<number, { at: number; callback: () => void }>()
  const timers: Timers = {
    set: (callback, ms) => {
      const id = next++
      queue.set(id, { at: now + ms, callback })
      return id
    },
    clear: (handle) => void queue.delete(handle as number),
    now: () => now,
  }
  const advance = async (ms: number) => {
    const until = now + ms
    for (;;) {
      const due = [...queue.entries()].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at)[0]
      if (!due) break
      queue.delete(due[0])
      now = due[1].at
      due[1].callback()
      await Promise.resolve()
      await Promise.resolve()
    }
    now = until
  }
  return { timers, advance }
}

const settle = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

describe('AutoSaver', () => {
  it('sends once after ten idle seconds, however many edits came before', async () => {
    const { timers, advance } = fakeTimers()
    let sends = 0
    const saver = new AutoSaver(async () => void sends++, { timers })
    saver.touch()
    await advance(5_000)
    saver.touch()
    await advance(9_999)
    expect(sends).toBe(0)
    await advance(1)
    await settle()
    expect(sends).toBe(1)
    expect(saver.pending).toBe(false)
  })

  it('sends within sixty seconds of the first unsent edit while editing never pauses', async () => {
    const { timers, advance } = fakeTimers()
    let sends = 0
    const saver = new AutoSaver(async () => void sends++, { timers })
    for (let t = 0; t < 59_000; t += 5_000) {
      saver.touch()
      await advance(5_000)
    }
    expect(sends).toBe(1)
  })

  it('flush sends immediately and does nothing when nothing is pending', async () => {
    const { timers } = fakeTimers()
    let sends = 0
    const saver = new AutoSaver(async () => void sends++, { timers })
    await saver.flush()
    expect(sends).toBe(0)
    saver.touch()
    await saver.flush()
    expect(sends).toBe(1)
  })

  it('an edit made during an upload is sent by the next one, not lost and not doubled', async () => {
    const { timers, advance } = fakeTimers()
    let sends = 0
    let release: () => void = () => {}
    const saver = new AutoSaver(() => {
      sends++
      return new Promise<void>((resolve) => { release = resolve })
    }, { timers })
    saver.touch()
    await advance(10_000)
    expect(sends).toBe(1)
    saver.touch()
    await advance(10_000)
    expect(sends).toBe(1) // the first is still in flight
    release()
    await settle()
    await advance(10_000)
    expect(sends).toBe(2)
    release()
    await settle()
    expect(saver.pending).toBe(false)
  })

  it('a failed upload keeps going on the next edit', async () => {
    const { timers, advance } = fakeTimers()
    let sends = 0
    const saver = new AutoSaver(async () => {
      sends++
      if (sends === 1) throw new Error('offline')
    }, { timers })
    saver.touch()
    await advance(10_000)
    await settle()
    saver.touch()
    await advance(10_000)
    await settle()
    expect(sends).toBe(2)
  })

  it('stops after dispose', async () => {
    const { timers, advance } = fakeTimers()
    let sends = 0
    const saver = new AutoSaver(async () => void sends++, { timers })
    saver.touch()
    saver.dispose()
    await advance(60_000)
    await saver.flush()
    expect(sends).toBe(0)
  })
})

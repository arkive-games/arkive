// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useUnsavedChanges } from './use-unsaved-changes'

afterEach(cleanup)
const labels = { title: 'Unsaved changes', description: 'Choose how to leave.', save: 'Save and leave', discard: 'Discard and leave', stay: 'Keep editing', failed: 'Save failed' }
function Editor({ dirty = true, save, discard, leave }: { dirty?: boolean; save: () => boolean | Promise<boolean>; discard: () => void; leave: () => void }) {
  const guard = useUnsavedChanges({ dirty, onSave: save, onDiscard: discard, labels })
  return <><button onClick={() => guard.request(leave)}>Leave</button>{guard.dialog}</>
}
describe('unsaved editor exit', () => {
  it('keeps work and the destination pending after a failed save, then retries', async () => {
    const save = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const discard = vi.fn(); const leave = vi.fn()
    render(<Editor save={save} discard={discard} leave={leave} />)
    fireEvent.click(screen.getByText('Leave'))
    fireEvent.click(screen.getByText('Save and leave'))
    await screen.findByRole('alert')
    expect(leave).not.toHaveBeenCalled()
    expect(discard).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Save and leave'))
    await waitFor(() => expect(leave).toHaveBeenCalledOnce())
  })
  it('discards only on the explicit discard choice', () => {
    const save = vi.fn(); const discard = vi.fn(); const leave = vi.fn()
    render(<Editor save={save} discard={discard} leave={leave} />)
    fireEvent.click(screen.getByText('Leave'))
    fireEvent.click(screen.getByText('Keep editing'))
    expect(leave).not.toHaveBeenCalled()
    expect(discard).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Leave'))
    fireEvent.click(screen.getByText('Discard and leave'))
    expect(discard).toHaveBeenCalledOnce()
    expect(leave).toHaveBeenCalledOnce()
    expect(save).not.toHaveBeenCalled()
  })
  it('blocks repeated saving and dismissal while saving is pending', async () => {
    let complete!: (saved: boolean) => void
    const save = vi.fn(() => new Promise<boolean>(resolve => { complete = resolve }))
    const leave = vi.fn()
    render(<Editor save={save} discard={vi.fn()} leave={leave} />)
    fireEvent.click(screen.getByText('Leave'))
    fireEvent.click(screen.getByText('Save and leave'))
    expect((screen.getByText('Keep editing') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByText('Save and leave'))
    expect(save).toHaveBeenCalledOnce()
    complete(true)
    await waitFor(() => expect(leave).toHaveBeenCalledOnce())
  })
  it('only requests native unload confirmation for dirty work', () => {
    const leave = vi.fn()
    const { rerender } = render(<Editor save={() => true} discard={vi.fn()} leave={leave} />)
    const dirtyEvent = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(dirtyEvent)
    expect(dirtyEvent.defaultPrevented).toBe(true)
    rerender(<Editor dirty={false} save={() => true} discard={vi.fn()} leave={leave} />)
    const cleanEvent = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(cleanEvent)
    expect(cleanEvent.defaultPrevented).toBe(false)
    fireEvent.click(screen.getByText('Leave'))
    expect(leave).toHaveBeenCalledOnce()
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })
})

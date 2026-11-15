# Tool Memory and Saving

Ordinary calculators without a save workflow automatically remember validated
inputs on the current device. No login, Save button or leave reminder is required.
Returning, refreshing or reopening the browser restores the inputs; derived
results are recalculated using current data. Use the shared local task-draft
retention and limits. Existing Reset/Clear actions replace remembered inputs
with defaults. Do not persist overlays, picker queries or computed results.

Build, loadout and other editors that manage named/saved schemes use explicit
saving. Unsaved work is not automatically recovered after the user chooses to
leave without saving. The following exit rules apply to those editors.

| State or choice | Behavior |
| --- | --- |
| No unsaved changes | Leave without a save reminder. |
| Dirty work; in-app departure | Offer Save and Leave, Leave Without Saving, Continue Editing. |
| Continue Editing | Stay with all current inputs. |
| Save and Leave | Save successfully before departure; failure/cancellation preserves work and stays. Show save failure when saving fails. |
| Leave Without Saving | Discard unsaved state; next ordinary visit starts fresh. Caching must not rehydrate it. |
| Changes after saving | Dirty again; remind on the next departure. |

Discarding later edits preserves existing explicitly saved records, available
through the tool's supported save/load workflow.

Refresh, tab close, and external navigation use best-effort native unload
confirmation where supported; its wording/buttons are browser-owned. Cancelling
keeps work; permitting departure does not implicitly save. Custom three-action
prompts apply only where the app controls navigation.

Save destination, account needs and saved-record management remain per-editor
decisions. This contract does not redefine
encyclopedia return context, map memory, favorites, progress, or unrelated form
drafts. See [adoption](adoption.md) for the older task-draft policy conflict.

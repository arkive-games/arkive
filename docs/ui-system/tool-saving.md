# Tool Work: Explicit Saving

Tool input/configuration uses explicit saving. Unsaved work is not automatically
recovered after the user chooses to leave without saving.

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

Save destination, account needs, record management, and applicability to tools
without saveable work remain per-tool decisions. This contract does not redefine
encyclopedia return context, map memory, favorites, progress, or unrelated form
drafts. See [adoption](adoption.md) for the older task-draft policy conflict.

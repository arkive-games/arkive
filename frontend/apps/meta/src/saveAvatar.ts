import { result, setCurrentUserAvatar, setCurrentUserAvatarPreset, type ApiClient } from '@gamemap/api-core'
import { AVATAR_PRESETS } from './avatarPresets'

/** Only explicit editor confirmation calls this; legacy local data is never uploaded on load. */
export async function saveAccountAvatar(client: ApiClient['client'], src: string, verifyOwner: () => Promise<void> = async () => {}) {
  const preset = AVATAR_PRESETS.find((item) => item.src === src)
  if (preset) {
    await verifyOwner()
    return result(setCurrentUserAvatarPreset({ client, throwOnError: true, body: { presetId: preset.id } }))
  }
  if (!src.startsWith('data:image/')) throw new Error('Invalid avatar source')
  const response = await fetch(src)
  if (!response.ok) throw new Error('Unable to read avatar image')
  const file = await response.blob()
  await verifyOwner()
  return result(setCurrentUserAvatar({ client, throwOnError: true, body: { file } }))
}

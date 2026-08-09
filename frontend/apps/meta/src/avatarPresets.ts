const avatarAsset = (fileName: string) => `${import.meta.env.BASE_URL}images/avatars/${fileName}`

export const AVATAR_PRESETS = [
  { id: 'water-spirit-explorer', src: avatarAsset('01-water-spirit-explorer.png') },
  { id: 'water-spirit-archivist', src: avatarAsset('02-water-spirit-archivist.png') },
  { id: 'male-tide-navigator', src: avatarAsset('03-male-tide-navigator.png') },
  { id: 'male-sunlit-scout', src: avatarAsset('04-male-sunlit-scout.png') },
  { id: 'male-map-scholar', src: avatarAsset('05-male-map-scholar.png') },
  { id: 'male-harbor-guide', src: avatarAsset('06-male-harbor-guide.png') },
  { id: 'female-night-cartographer', src: avatarAsset('07-female-night-cartographer.png') },
  { id: 'female-amber-trailblazer', src: avatarAsset('08-female-amber-trailblazer.png') },
  { id: 'female-tide-archivist', src: avatarAsset('09-female-tide-archivist.png') },
  { id: 'female-ocean-ranger', src: avatarAsset('10-female-ocean-ranger.png') },
] as const

export const DEFAULT_AVATAR_SRC = AVATAR_PRESETS[0].src

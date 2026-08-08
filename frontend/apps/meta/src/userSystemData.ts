export const CURRENT_USER_ID = '10851724'
export const CURRENT_USER_AVATAR_SEED = 'arkive-current-sailor'

export interface PublicProfileFixture {
  id: string
  nameKey: string
  bioKey: string
  avatarSeed: string
  followerCount: number
  followingCount: number
  likeCount: number
  featuredPostKeys: string[]
}

export const PUBLIC_PROFILE_FIXTURES: PublicProfileFixture[] = [
  {
    id: '10274831',
    nameKey: 'forum.posts.vrising.author',
    bioKey: 'userSystem.publicProfile.bios.vrising',
    avatarSeed: 'arkive-dusk-raven',
    followerCount: 1284,
    followingCount: 47,
    likeCount: 3862,
    featuredPostKeys: ['vrising', 'general'],
  },
  {
    id: '10039267',
    nameKey: 'forum.posts.aion2.author',
    bioKey: 'userSystem.publicProfile.bios.aion2',
    avatarSeed: 'arkive-wind-string',
    followerCount: 946,
    followingCount: 83,
    likeCount: 2719,
    featuredPostKeys: ['aion2', 'official'],
  },
  {
    id: '10357142',
    nameKey: 'forum.posts.palworld.author',
    bioKey: 'userSystem.publicProfile.bios.palworld',
    avatarSeed: 'arkive-island-builder',
    followerCount: 731,
    followingCount: 64,
    likeCount: 1847,
    featuredPostKeys: ['palworld', 'general'],
  },
]

export function avatarUrl(seed: string, size = 128) {
  return `https://i.pravatar.cc/${size}?u=${encodeURIComponent(seed)}`
}

export function publicProfileHref(userId: string, section = 'posts') {
  return `#user/${encodeURIComponent(userId)}/${section}`
}

export function findPublicProfile(userId: string) {
  return PUBLIC_PROFILE_FIXTURES.find((profile) => profile.id === userId)
    ?? PUBLIC_PROFILE_FIXTURES[0]
}

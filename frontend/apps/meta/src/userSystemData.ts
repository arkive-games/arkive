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

export interface RecommendedUser {
  id: string
  nameKey: string
  descriptionKey: string
  avatarSeed: string
}

/**
 * The forum's "who to follow" rail and the account pages' fans/following lists
 * are the same four people, so they share one directory and one id per person.
 * They previously carried two disjoint id sets — slugs here, numbers there —
 * which made a follow taken in the forum invisible in the account pages. The
 * numbers were worse than merely different: they collided with the post authors'
 * `authorNumber` values in PUBLIC_PROFILE_FIXTURES below, so the same id denoted
 * two different people depending on which page asked.
 */
export const RECOMMENDED_USERS: RecommendedUser[] = [
  {
    id: 'white-deer',
    nameKey: 'forum.users.whiteDeer.name',
    descriptionKey: 'forum.users.whiteDeer.description',
    avatarSeed: 'arkive-white-deer',
  },
  {
    id: 'castle-watch',
    nameKey: 'forum.users.castleWatch.name',
    descriptionKey: 'forum.users.castleWatch.description',
    avatarSeed: 'arkive-castle-watch',
  },
  {
    id: 'ranch-duty',
    nameKey: 'forum.users.ranchDuty.name',
    descriptionKey: 'forum.users.ranchDuty.description',
    avatarSeed: 'arkive-ranch-duty',
  },
  {
    id: 'spire-letter',
    nameKey: 'forum.users.spireLetter.name',
    descriptionKey: 'forum.users.spireLetter.description',
    avatarSeed: 'arkive-spire-letter',
  },
]

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

/**
 * Undefined for an unknown id, deliberately. Falling back to the first fixture
 * made every unrecognised `#user/<id>` render one specific person's name, bio and
 * follower counts as if they were the requested user's.
 */
export function findPublicProfile(userId: string): PublicProfileFixture | undefined {
  return PUBLIC_PROFILE_FIXTURES.find((profile) => profile.id === userId)
}

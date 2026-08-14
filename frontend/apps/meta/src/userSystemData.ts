/**
 * What is left of the account pages' local helpers.
 *
 * This file used to hold the forum's cast: four "recommended users" and three
 * public profiles, each with a name key, a bio key, an avatar seed and invented
 * follower and like totals. Every surface that read them reads the API now — the
 * follower and following lists, the notification inbox, a public profile and a
 * profile's posts — so the fixtures are gone rather than kept beside the real
 * thing. Two helpers remain because they are about routing and placeholders, not
 * about people.
 */

/**
 * A deterministic placeholder portrait.
 *
 * Served by a third party, which is why it is not used for anyone real: an
 * account's picture comes from `UserPublic.avatarUrl`, out of our own object
 * storage. Passing a real name or id here would hand it to pravatar.cc.
 */
export function avatarUrl(seed: string, size = 128) {
  return `https://i.pravatar.cc/${size}?u=${encodeURIComponent(seed)}`
}

/**
 * The hash route for a profile.
 *
 * `userId` is an account's permanent uid as a string. Deliberately not the vanity
 * `specialUid`, which the backend documents as display-only and reassignable — a
 * link built from that breaks as soon as the number moves to another account.
 */
export function publicProfileHref(userId: string, section = 'posts') {
  return `#user/${encodeURIComponent(userId)}/${section}`
}

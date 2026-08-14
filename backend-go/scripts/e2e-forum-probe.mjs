// Exercises the forum flows the meta frontend calls, against a running server.
//
// Not a replacement for the Go tests, which cover the same ground more thoroughly
// — this checks the shapes the *client* depends on, over real HTTP: that a video
// link round-trips, that parentId is null rather than absent on a top-level
// comment, and that the reader-scoped feeds are scoped.
//
//   node scripts/e2e-forum-probe.mjs http://127.0.0.1:19011
import { createHash } from 'node:crypto'

const base = (process.argv[2] ?? 'http://127.0.0.1:19011').replace(/\/+$/, '')
const api = `${base}/api/v1/core`

let failures = 0
function check(name, condition, detail) {
  if (condition) {
    console.log(`  ok   ${name}`)
    return
  }
  failures += 1
  console.log(`  FAIL ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`)
}

async function call(method, path, { token, body } = {}) {
  const res = await fetch(`${api}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await res.text()
  let parsed
  try { parsed = JSON.parse(text) } catch { parsed = { raw: text } }
  return { status: res.status, envelope: parsed, data: parsed?.data }
}

// Registration is gated by an Altcha proof-of-work, so the probe solves one the
// way a browser does: hash salt+n until the digest matches the challenge, then
// send the payload base64-encoded as a query parameter.
async function solveAltcha() {
  const { data } = await call('GET', '/auth/altcha')
  for (let n = 0; n <= data.maxNumber; n += 1) {
    if (createHash('sha256').update(data.salt + n).digest('hex') === data.challenge) {
      return Buffer.from(JSON.stringify({
        algorithm: data.algorithm,
        challenge: data.challenge,
        number: n,
        salt: data.salt,
        signature: data.signature,
      })).toString('base64')
    }
  }
  throw new Error('altcha challenge unsolved within maxNumber')
}

async function register(name, email) {
  const altcha = await solveAltcha()
  const path = '/auth/register?altcha=' + encodeURIComponent(altcha)
  const reg = await call('POST', path, { body: { name, email, password: 'hunter2hunter2' } })
  if (reg.status !== 201 && reg.status !== 200) {
    throw new Error(`register failed (${reg.status}): ${JSON.stringify(reg.envelope).slice(0, 200)}`)
  }
  const login = await call('POST', '/auth/jwt/login', { body: { email, password: 'hunter2hunter2' } })
  // The auth routes answer with the token object directly rather than inside the
  // `data` envelope the rest of the API uses, so look in both places.
  const token = login.envelope?.accessToken ?? login.data?.accessToken
  if (!token) throw new Error(`login failed for ${email}: ${JSON.stringify(login.envelope).slice(0, 200)}`)
  return token
}

const stamp = Date.now()
const alice = await register(`Alice-${stamp}`, `alice-${stamp}@example.com`)
const bob = await register(`Bob-${stamp}`, `bob-${stamp}@example.com`)

console.log('\npublishing')
const created = await call('POST', '/forum/posts', {
  token: alice,
  body: {
    channel: 'games',
    title: 'Breeding routes',
    body: 'A body long enough to pass validation.',
    topic: 'guide',
    gameIds: ['palworld'],
    tags: ['breeding'],
    videoUrl: 'https://b23.tv/abc123',
  },
})
check('post created', created.status === 200, created.envelope)
const postNo = created.data?.postNo
check('videoUrl round-trips', created.data?.videoUrl === 'https://b23.tv/abc123', created.data?.videoUrl)
check('featuredAt is null, not absent', created.data?.featuredAt === null, created.data?.featuredAt)
check('images is an array', Array.isArray(created.data?.images), created.data?.images)

console.log('\nrejecting a hostile video link')
const hostile = await call('POST', '/forum/posts', {
  token: alice,
  body: { channel: 'general', title: 'Nope', body: 'A body long enough.', videoUrl: 'javascript:alert(1)' },
})
check('javascript: refused', hostile.status !== 200, hostile.status)

console.log('\ncomments')
const top = await call('POST', `/forum/posts/${postNo}/comments`, { token: bob, body: { body: 'First!' } })
check('comment created', top.status === 200, top.envelope)
check('top-level parentId is null', top.data?.parentId === null, top.data?.parentId)
check('top-level has a floor number', top.data?.commentNo === 1, top.data?.commentNo)

const reply = await call('POST', `/forum/posts/${postNo}/comments`, {
  token: alice,
  body: { body: 'Thanks!', parentId: top.data?.id },
})
check('reply created', reply.status === 200, reply.envelope)
check('reply parentId is set', reply.data?.parentId === top.data?.id, reply.data?.parentId)
check('reply has no floor number', reply.data?.commentNo === null, reply.data?.commentNo)

const thread = await call('GET', `/forum/posts/${postNo}/comments?page=1&pageSize=200`)
check('thread returns both', thread.data?.count === 2, thread.data?.count)

console.log('\nreactions and reader-scoped feeds')
await call('PUT', `/forum/posts/${postNo}/like`, { token: bob })
await call('PUT', `/forum/posts/${postNo}/bookmark`, { token: bob })

const bobLiked = await call('GET', '/forum/posts?liked=true', { token: bob })
check('bob sees his like', bobLiked.data?.count === 1, bobLiked.data?.count)
const aliceLiked = await call('GET', '/forum/posts?liked=true', { token: alice })
check('alice sees none of bob likes', aliceLiked.data?.count === 0, aliceLiked.data?.count)
const anonLiked = await call('GET', '/forum/posts?liked=true')
check('anonymous liked=true is empty, not the whole feed', anonLiked.data?.count === 0, anonLiked.data?.count)
const anonAll = await call('GET', '/forum/posts')
check('...and the unfiltered feed is not empty', anonAll.data?.count > 0, anonAll.data?.count)

const viewerFlags = await call('GET', `/forum/posts/${postNo}`, { token: bob })
check('liked flag is per viewer', viewerFlags.data?.liked === true, viewerFlags.data?.liked)
const anonFlags = await call('GET', `/forum/posts/${postNo}`)
check('anonymous reader sees liked false', anonFlags.data?.liked === false, anonFlags.data?.liked)

console.log('\nediting')
const cleared = await call('PATCH', `/forum/posts/${postNo}`, { token: alice, body: { videoUrl: null } })
check('explicit null clears the video', cleared.data?.videoUrl === null, cleared.data?.videoUrl)
check('editedAt is stamped', typeof cleared.data?.editedAt === 'string', cleared.data?.editedAt)

console.log(failures === 0 ? '\nall probes passed' : `\n${failures} probe(s) failed`)
process.exit(failures === 0 ? 0 : 1)

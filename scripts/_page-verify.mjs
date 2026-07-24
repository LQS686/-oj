const base = 'http://localhost:3000'

const login = await fetch(`${base}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'LQS686', password: 'LQS686LQS' }),
})
const loginJson = await login.json().catch(() => ({}))
const setCookie = typeof login.headers.getSetCookie === 'function' ? login.headers.getSetCookie() : []
let cookie = setCookie.map((c) => c.split(';')[0]).join('; ')
if (!cookie) {
  const raw = login.headers.get('set-cookie') || ''
  cookie = raw
    .split(/,(?=[^;]+?=)/)
    .map((s) => s.split(';')[0].trim())
    .filter(Boolean)
    .join('; ')
}
console.log(
  JSON.stringify({
    loginStatus: login.status,
    ok: loginJson.success ?? loginJson.ok,
    cookieLen: cookie.length,
  })
)

const paths = [
  '/',
  '/problems',
  '/contests',
  '/training',
  '/classes',
  '/rank',
  '/announcements',
  '/submissions',
  '/notifications',
  '/settings',
  '/profile',
  '/classes/6a5f0782d6f0d7d2c88816e4',
  '/classes/6a5f0782d6f0d7d2c88816e4/assignments/6a6078cfe6011e9695bf6969',
  '/admin',
  '/admin/problems',
  '/admin/contests',
  '/admin/classes',
  '/admin/trainings',
  '/admin/users',
  '/admin/announcements',
  '/admin/settings',
  '/admin/submissions',
  '/admin/trainings/categories',
  '/login',
  '/register',
  '/forgot-password',
  '/403',
]

async function check(path) {
  const t0 = Date.now()
  try {
    const res = await fetch(base + path, {
      headers: { Cookie: cookie, Accept: 'text/html' },
      redirect: 'manual',
    })
    const loc = res.headers.get('location')
    let body = ''
    if (res.status === 200) body = await res.text()
    const ms = Date.now() - t0
    const bad =
      body.includes('Application error') ||
      body.includes('Unhandled Runtime Error') ||
      /This page could not be found/i.test(body) ||
      body.includes('Internal Server Error')
    const hasNext = body.includes('__NEXT_DATA__') || body.includes('/_next/')
    return { path, status: res.status, ms, loc, bad, hasNext, len: body.length }
  } catch (e) {
    return { path, status: 'ERR', ms: Date.now() - t0, error: String(e) }
  }
}

const results = []
for (const p of paths) results.push(await check(p))

async function api(p) {
  const r = await fetch(base + p, {
    headers: { Cookie: cookie, Accept: 'application/json' },
  })
  return r.json().catch(() => ({}))
}

const problems = await api('/api/problems?page=1&pageSize=1')
const contests = await api('/api/contests?page=1&pageSize=1')
const trainings = await api('/api/trainings?page=1&pageSize=1')
const anns = await api('/api/announcements?limit=1')
const me = await api('/api/auth/me')

const problemList = problems.data?.problems || problems.data?.items || []
const contestList = contests.data?.contests || contests.data?.items || []
const trainingList = trainings.data?.items || trainings.data?.trainings || []
const annList = anns.data?.items || []

const pid = problemList[0]?.problemNumber || problemList[0]?.id
const cid = contestList[0]?.id
const tid = trainingList[0]?.id
const aid = annList[0]?.id
const uid = me.data?.id || me.user?.id || me.data?.user?.id

const details = []
if (pid) details.push(`/problem/${pid}`)
if (cid) details.push(`/contests/${cid}`, `/contests/${cid}/rank`)
if (tid) details.push(`/training/${tid}`)
if (aid) details.push(`/announcements/${aid}`)
if (uid) details.push(`/user/${uid}`)

for (const p of details) results.push(await check(p))

const summary = {
  discovered: { pid, cid, tid, aid, uid },
  fail: results.filter((r) => r.bad || r.status === 'ERR' || (typeof r.status === 'number' && r.status >= 500)),
  redirect: results.filter((r) => typeof r.status === 'number' && r.status >= 300 && r.status < 400),
  ok: results.filter((r) => r.status === 200 && !r.bad),
  other: results.filter(
    (r) =>
      !(r.status === 200 && !r.bad) &&
      !(typeof r.status === 'number' && r.status >= 300 && r.status < 400) &&
      !(r.bad || r.status === 'ERR' || (typeof r.status === 'number' && r.status >= 500))
  ),
  all: results,
}

console.log(JSON.stringify(summary, null, 2))

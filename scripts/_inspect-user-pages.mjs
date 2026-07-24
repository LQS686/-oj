/**
 * Visual/DOM smoke via sequential page loads (cookie auth).
 * Checks title + error markers in HTML (SSR/RSC payload).
 */
const BASE = 'http://localhost:3000'

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'LQS686', password: 'LQS686LQS' }),
  })
  const setCookie = res.headers.getSetCookie?.() || []
  const raw = setCookie.join('; ') || res.headers.get('set-cookie') || ''
  const m = raw.match(/token=([^;]+)/)
  if (!m) throw new Error('no token')
  return `token=${m[1]}`
}

async function inspect(path, cookie) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Cookie: cookie, Accept: 'text/html' },
  })
  const html = await res.text()
  const title = (html.match(/<title>([^<]*)<\/title>/i) || [])[1] || ''
  const issues = []
  if (res.status >= 400) issues.push(`status ${res.status}`)
  if (/Application error|Unhandled Runtime Error|Server Error/i.test(html)) issues.push('error banner')
  if (/ChunkLoadError|Hydration failed/i.test(html)) issues.push('hydration/chunk')
  // Next.js error digest in flight data
  if (/"digest":"[^"]+"/.test(html) && /error/i.test(html)) issues.push('error digest')
  return { path, status: res.status, title: title.trim(), ok: issues.length === 0, issues }
}

const paths = [
  '/',
  '/problems',
  '/contests',
  '/training',
  '/classes',
  '/rank',
  '/announcements',
  '/announcements/6a5d8883348510586a9a9514',
  '/submissions',
  '/notifications',
  '/settings',
  '/profile',
  '/user/6a5c726c86db3431057904f2',
  '/problem/LP1069',
  '/problems/LP1069/solutions',
  '/contests/6a6092c95f62db19b015926c',
  '/contests/6a6092c95f62db19b015926c/rank',
  '/contests/6a6092c95f62db19b015926c/problems',
  '/contests/6a6092c95f62db19b015926c/submissions',
  '/contests/6a6092c95f62db19b015926c/problems/6a5f40019746e145f46ebc23',
  '/contests/create',
  '/training/6a6038a47c427a70f11eb6fb',
  '/training/6a6038a47c427a70f11eb6fb/problems/6a5f40019746e145f46ebc23',
  '/classes/6a5f0782d6f0d7d2c88816e4',
  '/classes/6a5f0782d6f0d7d2c88816e4?tab=manage',
  '/classes/6a5f0782d6f0d7d2c88816e4/assignments/6a6078cfe6011e9695bf6969',
  '/classes/6a5f0782d6f0d7d2c88816e4/assignments/6a6078cfe6011e9695bf6969/submissions',
  '/classes/6a5f0782d6f0d7d2c88816e4/notes/6a6093c7e6011e9695bf6972',
  '/classes/6a5f0782d6f0d7d2c88816e4/members',
  '/classes/6a5f0782d6f0d7d2c88816e4/members/6a5f08a1d6f0d7d2c88816e8/activity',
  '/classes/6a5f0782d6f0d7d2c88816e4/members/6a5f08a1d6f0d7d2c88816e8/permissions',
  '/classes/6a5f0782d6f0d7d2c88816e4/requests',
  '/classes/6a5f0782d6f0d7d2c88816e4/invites',
  '/classes/6a5f0782d6f0d7d2c88816e4/manage',
  '/classes/6a5f0782d6f0d7d2c88816e4/problems',
  '/classes/create',
  '/submission/6a6094495f62db19b0159282',
  '/login',
  '/register',
  '/forgot-password',
  '/403',
  '/admin',
  '/admin/problems',
  '/admin/contests',
  '/admin/trainings',
  '/admin/classes',
  '/admin/users',
  '/admin/announcements',
  '/admin/submissions',
  '/admin/settings',
]

const cookie = await login()
const results = []
for (const p of paths) results.push(await inspect(p, cookie))
const failed = results.filter((r) => !r.ok)
console.log(
  JSON.stringify(
    {
      total: results.length,
      passed: results.length - failed.length,
      failed: failed.length,
      failures: failed,
      titles: results.map((r) => ({ path: r.path, title: r.title, status: r.status })),
    },
    null,
    2
  )
)

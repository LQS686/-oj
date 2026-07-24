/**
 * Browser visual check helper results collector (run via node + fetch won't work for DOM).
 * Instead: output checklist for agent to walk; or use puppeteer if present.
 *
 * This script uses undici/fetch + cookie and checks API endpoints that pages depend on.
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
  return `token=${m[1]}`
}

async function api(path, cookie) {
  const res = await fetch(`${BASE}${path}`, { headers: { Cookie: cookie } })
  const json = await res.json().catch(() => null)
  const ok = res.status < 400 && (json?.success === true || json?.ok === true || json?.data != null || res.status === 204)
  return { path, status: res.status, ok: !!ok, code: json?.code || json?.error || null }
}

const cookie = await login()
const apis = [
  '/api/home/dashboard',
  '/api/problems?page=1&pageSize=5',
  '/api/contests?page=1&pageSize=5',
  '/api/trainings?page=1&pageSize=5',
  '/api/classes?mine=true&page=1&pageSize=5',
  '/api/rankings?type=rating&page=1&limit=20',
  '/api/announcements?limit=5',
  '/api/submissions?page=1&pageSize=5',
  '/api/notifications?page=1&pageSize=5',
  '/api/auth/me',
  '/api/users/profile',
  '/api/users/6a5c726c86db3431057904f2/info',
  '/api/users/6a5c726c86db3431057904f2/stats',
  '/api/problems/LP1069',
  '/api/contests/6a6092c95f62db19b015926c',
  '/api/trainings/6a6038a47c427a70f11eb6fb',
  '/api/classes/6a5f0782d6f0d7d2c88816e4',
  '/api/classes/6a5f0782d6f0d7d2c88816e4/assignments',
  '/api/classes/6a5f0782d6f0d7d2c88816e4/assignments/6a6078cfe6011e9695bf6969',
  '/api/classes/6a5f0782d6f0d7d2c88816e4/notes',
  '/api/admin/dashboard',
  '/api/admin/problems?page=1&pageSize=5',
  '/api/admin/users?page=1&pageSize=5',
]

const results = []
for (const p of apis) results.push(await api(p, cookie))
const failed = results.filter((r) => !r.ok)
console.log(JSON.stringify({ total: results.length, passed: results.length - failed.length, failed, results }, null, 2))

/**
 * Smoke-check all user-facing pages (logged-in).
 * Usage: node scripts/_smoke-user-pages.mjs
 */
import 'dotenv/config'

const BASE = process.env.SMOKE_BASE || 'http://localhost:3000'

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'LQS686', password: 'LQS686LQS' }),
  })
  const setCookie = res.headers.getSetCookie?.() || []
  const raw = setCookie.join('; ') || res.headers.get('set-cookie') || ''
  const tokenMatch = raw.match(/token=([^;]+)/)
  const json = await res.json()
  if (!json.success && !json.ok) throw new Error('login failed: ' + JSON.stringify(json))
  return {
    cookie: tokenMatch ? `token=${tokenMatch[1]}` : '',
    userId: json.data?.user?.id,
  }
}

async function getJson(path, cookie) {
  const res = await fetch(`${BASE}${path}`, {
    headers: cookie ? { Cookie: cookie } : {},
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, json }
}

async function checkPage(path, cookie) {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      Cookie: cookie || '',
      Accept: 'text/html',
    },
    redirect: 'manual',
  })
  const loc = res.headers.get('location')
  let body = ''
  try {
    body = await res.text()
  } catch {
    body = ''
  }
  const issues = []
  if (res.status >= 400) issues.push(`HTTP ${res.status}`)
  if (res.status >= 300 && res.status < 400 && loc) issues.push(`redirect→${loc}`)
  if (/Application error|Unhandled Runtime Error|__NEXT_DATA__.*"err"/i.test(body)) {
    issues.push('runtime error in HTML')
  }
  if (/Cannot find module|Module not found/i.test(body)) issues.push('module not found')
  // RSC/flight pages may be short; only flag empty for classic HTML
  if (body.length < 40 && res.status === 200) issues.push('suspiciously short body')
  return { path, status: res.status, location: loc, ok: issues.length === 0 && res.status < 400, issues }
}

async function main() {
  const { cookie, userId } = await login()
  if (!cookie) throw new Error('no token cookie')

  // Resolve dynamic IDs
  const classes = await getJson('/api/classes?mine=true&page=1&pageSize=5', cookie)
  const classId =
    classes.json?.data?.classes?.[0]?.id ||
    classes.json?.data?.items?.[0]?.id ||
    classes.json?.data?.[0]?.id

  const assignments = classId
    ? await getJson(`/api/classes/${classId}/assignments`, cookie)
    : { json: null }
  const assignmentId =
    assignments.json?.data?.assignments?.[0]?.id ||
    assignments.json?.data?.[0]?.id

  const notes = classId ? await getJson(`/api/classes/${classId}/notes`, cookie) : { json: null }
  const noteId = notes.json?.data?.notes?.[0]?.id || notes.json?.data?.[0]?.id

  const members = classId ? await getJson(`/api/classes/${classId}`, cookie) : { json: null }
  const memberUserId =
    members.json?.data?.members?.find((m) => m.userId !== userId)?.userId ||
    members.json?.data?.members?.[0]?.userId

  const problems = await getJson('/api/problems?page=1&pageSize=1', cookie)
  const problem =
    problems.json?.data?.problems?.[0] ||
    problems.json?.data?.items?.[0] ||
    problems.json?.data?.[0]
  const problemId = problem?.id
  const problemNumber = problem?.problemNumber || problemId

  const contests = await getJson('/api/contests?page=1&pageSize=1', cookie)
  const contestId =
    contests.json?.data?.contests?.[0]?.id ||
    contests.json?.data?.items?.[0]?.id ||
    contests.json?.data?.[0]?.id

  const trainings = await getJson('/api/trainings?page=1&pageSize=1', cookie)
  const trainingId =
    trainings.json?.data?.trainings?.[0]?.id ||
    trainings.json?.data?.items?.[0]?.id ||
    trainings.json?.data?.[0]?.id

  let trainingProblemId = null
  if (trainingId) {
    const tpl = await getJson(`/api/trainings/${trainingId}/problem-list`, cookie)
    trainingProblemId = tpl.json?.data?.problems?.[0]?.problemId || tpl.json?.data?.problems?.[0]?.id
  }

  let contestProblemId = null
  if (contestId) {
    const cpl = await getJson(`/api/contests/${contestId}/problems`, cookie)
    const arr = cpl.json?.data
    contestProblemId = Array.isArray(arr) ? arr[0]?.problemId || arr[0]?.id : null
  }

  const submissions = await getJson('/api/submissions?page=1&pageSize=1', cookie)
  const submissionId =
    submissions.json?.data?.submissions?.[0]?.id ||
    submissions.json?.data?.items?.[0]?.id ||
    submissions.json?.data?.[0]?.id

  const announcements = await getJson('/api/announcements?limit=1', cookie)
  const announcementId =
    announcements.json?.data?.items?.[0]?.id || announcements.json?.data?.[0]?.id

  const routes = [
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
    '/login',
    '/register',
    '/forgot-password',
    '/403',
    userId ? `/user/${userId}` : null,
    problemNumber ? `/problem/${problemNumber}` : null,
    problemId ? `/problems/${problemId}` : null,
    problemId ? `/problems/${problemId}/solutions` : null,
    contestId ? `/contests/${contestId}` : null,
    contestId ? `/contests/${contestId}/rank` : null,
    contestId ? `/contests/${contestId}/problems` : null,
    contestId ? `/contests/${contestId}/submissions` : null,
    contestId && contestProblemId
      ? `/contests/${contestId}/problems/${contestProblemId}`
      : null,
    contestId ? `/contests/${contestId}/edit` : null,
    '/contests/create',
    trainingId ? `/training/${trainingId}` : null,
    trainingId && trainingProblemId
      ? `/training/${trainingId}/problems/${trainingProblemId}`
      : null,
    classId ? `/classes/${classId}` : null,
    classId ? `/classes/${classId}?tab=manage` : null,
    classId ? `/classes/${classId}/assignments` : null,
    classId && assignmentId
      ? `/classes/${classId}/assignments/${assignmentId}`
      : null,
    classId && assignmentId
      ? `/classes/${classId}/assignments/${assignmentId}/submissions`
      : null,
    classId ? `/classes/${classId}/notes` : null,
    classId && noteId ? `/classes/${classId}/notes/${noteId}` : null,
    classId ? `/classes/${classId}/members` : null,
    classId && memberUserId
      ? `/classes/${classId}/members/${memberUserId}/activity`
      : null,
    classId && memberUserId
      ? `/classes/${classId}/members/${memberUserId}/permissions`
      : null,
    classId ? `/classes/${classId}/requests` : null,
    classId ? `/classes/${classId}/invites` : null,
    classId ? `/classes/${classId}/manage` : null,
    classId ? `/classes/${classId}/problems` : null,
    '/classes/create',
    announcementId ? `/announcements/${announcementId}` : null,
    submissionId ? `/submission/${submissionId}` : null,
    // admin smoke (this account is SYSTEM_ADMIN)
    '/admin',
    '/admin/problems',
    '/admin/contests',
    '/admin/trainings',
    '/admin/classes',
    '/admin/users',
    '/admin/announcements',
    '/admin/submissions',
    '/admin/settings',
  ].filter(Boolean)

  const results = []
  for (const path of routes) {
    results.push(await checkPage(path, cookie))
  }

  const failed = results.filter((r) => !r.ok)
  const skippedDynamic = {
    classId,
    assignmentId,
    noteId,
    memberUserId,
    problemNumber,
    contestId,
    contestProblemId,
    trainingId,
    trainingProblemId,
    submissionId,
    announcementId,
    userId,
  }

  console.log(
    JSON.stringify(
      {
        total: results.length,
        passed: results.filter((r) => r.ok).length,
        failed: failed.length,
        ids: skippedDynamic,
        failures: failed,
        sampleOk: results.filter((r) => r.ok).slice(0, 5).map((r) => r.path),
      },
      null,
      2
    )
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

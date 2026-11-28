import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const base = process.env.QA_BASE_URL
const password = process.env.QA_SALES_PASSWORD
assert.match(base ?? '', /^http:\/\/127\.0\.0\.1:\d+$/)
assert.ok(password, 'Set QA_SALES_PASSWORD for the two isolated test accounts')

async function request(path, { status = 200, method = 'GET', token, body } = {}) {
  const res = await fetch(`${base}/mp/v1${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body && JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  })
  const json = await res.json()
  assert.equal(res.status, status, `${method} ${path.replace(/d1_[\w.-]+/, '<owner-ticket>')}`)
  return json
}

async function sales(letter) {
  const { data } = await request('/auth/password', {
    method: 'POST',
    body: { email: `sales-${letter}@qa.invalid`, password },
  })
  return data
}

const label = randomUUID()
const community = `隔离测试小区 ${label.slice(0, 4)}号${label.slice(4, 8)}`
const phone = '00012345678'
const answers = {
  house: { type: 'flat', bedrooms: 3, livingRooms: 2, area: 120, stage: 'rough' },
  lighting: { design: 'main' },
  level: { tier: 'light' },
  security: { camera: 'none', sensors: [] },
  sceneCards: ['lighting', 'security', 'curtain'],
  ecosystem: { primary: 'mijia' },
}

async function submitNeed() {
  const {
    data: { token },
  } = await request('/need-leads')
  const { data: saved } = await request('/need-leads', {
    method: 'POST',
    body: { token, source: 'scene', answers },
  })
  const { data } = await request(`/need-leads/${token}/submit`, {
    method: 'POST',
    body: { revision: saved.revision, phone, community },
  })
  assert.ok(data.total > 0 && data.pendingPrice > 0)
  return { ...data, ownerToken: token }
}

const pool = `?status=unassigned&q=${encodeURIComponent(community)}`
const summaryView = '?view=unassigned'
const poolList = async (session) => (await request(`/projects${pool}`, session)).data.items
const salesA = await sales('a')
const salesB = await sales('b')
const {
  data: { id: privateId },
} = await request('/projects', {
  ...salesB,
  method: 'POST',
  body: { name: '销售乙隔离私有项目', community },
})
await request(`/projects/${privateId}`, salesB)
await request(`/projects/${privateId}`, { ...salesA, status: 404 })
await request(`/projects/${privateId}${summaryView}`, { ...salesA, status: 404 })

const need = await submitNeed()
const path = `/projects/${need.projectId}`
for (const member of [salesA, salesB]) {
  const rows = await poolList(member)
  assert.equal(rows.length, 1)
  const [row] = rows
  assert.deepEqual(Object.keys(row).sort(), [
    'area',
    'budget',
    'community',
    'id',
    'pendingPriceCount',
    'submittedAt',
  ])
  assert.equal(row.id, need.projectId)
  assert.equal(row.community, community)
  assert.equal(row.area, 120)
  assert.equal(row.budget, need.total)
  assert.equal(row.pendingPriceCount, need.pendingPrice)
  assert.ok(Number.isFinite(Date.parse(row.submittedAt)))
}
await request(`/projects${pool}`, { token: need.ownerToken, status: 401 })
await request(path + summaryView, { status: 401 })
await request(path, { ...salesA, status: 404 })
await request(path, { ...salesA, status: 400, method: 'PUT', body: { name: '领取前不可编辑' } })
const {
  data: { unassigned },
} = await request(path + summaryView, salesA)
assert.deepEqual(Object.keys(unassigned).sort(), [
  'area',
  'budget',
  'claimTicket',
  'community',
  'id',
  'pendingPriceCount',
  'submittedAt',
  'summary',
])
assert.ok(unassigned.summary.includes('平层 3室2厅'))
assert.ok(!JSON.stringify(unassigned).includes(phone))
assert.equal(unassigned.budget, need.total)
await request(path + '/claim', {
  ...salesB,
  status: 404,
  method: 'POST',
  body: { ticket: unassigned.claimTicket },
})
await request(path + '/claim', {
  ...salesA,
  method: 'POST',
  body: { ticket: unassigned.claimTicket, owner: salesB.user.id },
})
const { data: claimed } = await request(path, salesA)
assert.ok(claimed.project.customerPhone === phone, 'Claimant can read the fixture phone')
assert.equal(claimed.owner.id, salesA.user.id)
assert.ok(claimed.project.notes.includes('【业主需求单】'))
assert.ok(claimed.project.notes.includes('估算：') && claimed.project.notes.includes('待查价：'))
await request(path, {
  ...salesA,
  method: 'PUT',
  body: {
    name: '销售甲跟进中',
    community,
    customerPhone: phone,
    budget: need.total,
    notes: '销售甲核对了交付时间',
  },
})
const { data: resubmitted } = await request(`/need-leads/${need.ownerToken}/submit`, {
  method: 'POST',
  body: { revision: need.revision },
})
assert.equal(resubmitted.projectId, need.projectId)
const { data: afterResubmit } = await request(path, salesA)
assert.equal(afterResubmit.owner.id, salesA.user.id)
assert.ok(afterResubmit.project.notes.includes('销售甲核对了交付时间'))
assert.ok(afterResubmit.project.customerPhone === phone, 'Resubmit preserves existing contact')
assert.deepEqual(await poolList(salesB), [])
const { data: generalB } = await request('/projects?status=all&limit=50', salesB)
assert.ok(!generalB.items.some((project) => project.id === need.projectId))
const denied = await request(path, { ...salesB, status: 404 })
await request(path + summaryView, { ...salesB, status: 404 })
await request(path + '/claim', { ...salesB, status: 404, method: 'POST' })
console.log(
  JSON.stringify({
    acceptance:
      'owner submit, both pool lists, redacted detail, forbidden edit, claim, owner edit, resubmit, private isolation',
    total: need.total,
    pending: need.pendingPrice,
    denied: denied.error,
  }),
)

const race = await submitNeed()
const racePath = `/projects/${race.projectId}`
const members = [salesA, salesB]
const tickets = await Promise.all(
  members.map(async (member) => {
    const { data } = await request(racePath + summaryView, member)
    return data.unassigned.claimTicket
  }),
)
const results = await Promise.all(
  members.map(async (member, index) => {
    const res = await fetch(base + '/mp/v1' + racePath + '/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${member.token}` },
      body: JSON.stringify({ ticket: tickets[index] }),
      signal: AbortSignal.timeout(15_000),
    })
    return { status: res.status, body: await res.json() }
  }),
)
assert.deepEqual(results.map((result) => result.status).sort(), [200, 409])
const winner = results.findIndex((result) => result.status === 200)
const loser = 1 - winner
assert.equal(results[loser].body.code, 'PROJECT_CLAIMED')
assert.equal(results[loser].body.error, `已被 ${members[winner].user.name} 领取`)
const { data: final } = await request(racePath, members[winner])
assert.equal(final.owner.id, members[winner].user.id)
await request(racePath, { ...members[loser], status: 404 })
assert.deepEqual(await poolList(members[loser]), [])
console.log(
  JSON.stringify({
    acceptance: 'simultaneous claims',
    statuses: results.map((result) => result.status),
    loserMessage: results[loser].body.error,
    ownerCount: 1,
  }),
)

const ownerResubmit = await submitNeed()
const resubmitPath = `/projects/${ownerResubmit.projectId}`
const {
  data: { unassigned: resubmitEntry },
} = await request(resubmitPath + summaryView, salesA)
const [, { data: duringClaim }] = await Promise.all([
  request(resubmitPath + '/claim', {
    ...salesA,
    method: 'POST',
    body: { ticket: resubmitEntry.claimTicket },
  }),
  request(`/need-leads/${ownerResubmit.ownerToken}/submit`, {
    method: 'POST',
    body: { revision: ownerResubmit.revision },
  }),
])
assert.equal(duringClaim.projectId, ownerResubmit.projectId)
const { data: afterRace } = await request(resubmitPath, salesA)
assert.equal(afterRace.owner.id, salesA.user.id)
assert.ok(afterRace.project.customerPhone === phone, 'Resubmit racing with claim preserves contact')
assert.deepEqual(await poolList(salesB), [])
console.log(
  JSON.stringify({
    acceptance: 'owner resubmit concurrently with claim',
    ownerRetained: true,
    contactRetained: true,
    noReentry: true,
  }),
)

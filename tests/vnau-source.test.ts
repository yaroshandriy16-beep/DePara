import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { VnauScheduleSource } from '../src/data/vnau.ts'

const group = { kind: 'group', id: '42' } as const
const lesson = { sourceId: 'lesson-1', date: '2026-11-02', startTime: '08:30', endTime: '09:50', subject: 'Дисципліна', academicGroupId: '42', group: 'Група/1', teacher: 'Викладач', room: 'Ауд. 1', type: 'Лекція' }
const snapshot = { schemaVersion: 1, source: 'vnau-mkr', sourceKind: 'group', universityId: 'vsau', timeZone: 'Europe/Kyiv', groupId: '42', groupName: 'Група', status: 'success', lastSuccessAt: '2026-11-02T12:00:00Z', lastCheckedAt: '2026-11-02T12:00:00Z', coverageStart: '2026-11-01', coverageEnd: '2026-11-14', lessons: [lesson, { ...lesson, sourceId: 'lesson-2', group: 'Група/2' }] }
const originalFetch = globalThis.fetch
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
function setup() {
  const storage = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    get length() { return storage.size },
    key: (index: number) => [...storage.keys()][index] ?? null,
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  } })
  return new VnauScheduleSource(group, 'https://example.test/group-42.json')
}
afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage)
  else Reflect.deleteProperty(globalThis, 'localStorage')
})

test('confirmed dated lessons preserve simultaneous subgroups; failed check retains them', async () => {
  const source = setup()
  globalThis.fetch = async () => new Response(JSON.stringify(snapshot))
  const first = await source.load()
  assert.equal(first.status, 'success')
  assert.equal(first.lessons.length, 2)
  assert.equal(first.lessons[0].date, '2026-11-02')
  assert.equal(first.lessons[0].academicGroupId, '42')
  assert.equal(first.coverageStart, '2026-11-01')
  assert.equal(first.coverageEnd, '2026-11-14')
  globalThis.fetch = async () => { throw new Error('offline') }
  const offline = await source.load()
  assert.equal(offline.status, 'error')
  assert.equal(offline.fromCache, true)
  assert.equal(offline.lessons.length, 2)
  assert.equal(offline.lastSuccessAt, snapshot.lastSuccessAt)
})

test('different identities cannot access the same cached schedule', async () => {
  const source = setup()
  globalThis.fetch = async () => new Response(JSON.stringify(snapshot))
  await source.load()
  globalThis.fetch = async () => { throw new Error('offline') }
  const teacher = await new VnauScheduleSource({ kind: 'teacher', id: '42' }, 'https://example.test/teacher.json').load()
  const otherGroup = await new VnauScheduleSource({ kind: 'group', id: '43' }, 'https://example.test/group.json').load()
  assert.equal(teacher.hasConfirmedData, false)
  assert.equal(otherGroup.hasConfirmedData, false)
})

test('different calendar ranges never reuse another week as a confirmed empty schedule', async () => {
  setup()
  const first = new VnauScheduleSource(group, 'https://example.test/group.json', { start: '2026-11-01', end: '2026-11-14' })
  globalThis.fetch = async () => new Response(JSON.stringify(snapshot))
  assert.equal((await first.load()).hasConfirmedData, true)
  const following = new VnauScheduleSource(group, 'https://example.test/group.json', { start: '2026-11-15', end: '2026-11-28' })
  globalThis.fetch = async () => { throw new Error('offline') }
  assert.equal((await following.load()).hasConfirmedData, false)
  globalThis.fetch = async () => new Response(JSON.stringify(snapshot))
  assert.equal((await following.load()).hasConfirmedData, false)
  assert.throws(() => new VnauScheduleSource(group, 'https://example.test/group.json', { start: '2026-11-01', end: '2026-12-02' }))
})

test('malformed data and mismatched group do not replace confirmed cache', async () => {
  const source = setup()
  globalThis.fetch = async () => new Response(JSON.stringify(snapshot))
  await source.load()
  for (const bad of [{ ...snapshot, groupId: '43' }, { ...snapshot, lessons: [{ ...lesson, date: '2026-02-30' }] }]) {
    globalThis.fetch = async () => new Response(JSON.stringify(bad))
    const result = await source.load()
    assert.equal(result.status, 'error')
    assert.equal(result.lessons.length, 2)
  }
})

test('a confirmed empty result differs from unavailable data', async () => {
  const source = setup()
  globalThis.fetch = async () => new Response(JSON.stringify({ ...snapshot, lessons: [] }))
  const result = await source.load()
  assert.equal(result.status, 'success')
  assert.equal(result.hasConfirmedData, true)
  assert.deepEqual(result.lessons, [])
})

test('missing coverage or lessons outside it cannot be presented as a confirmed empty day', async () => {
  const source = setup()
  for (const bad of [{ ...snapshot, coverageStart: undefined }, { ...snapshot, coverageStart: '2026-11-03' }]) {
    globalThis.fetch = async () => new Response(JSON.stringify(bad))
    const result = await source.load()
    assert.equal(result.status, 'error')
    assert.equal(result.hasConfirmedData, false)
  }
})

test('server failed-check metadata can retain the last successful data', async () => {
  const source = setup()
  globalThis.fetch = async () => new Response(JSON.stringify({ ...snapshot, status: 'error', lastCheckedAt: '2026-11-02T13:00:00Z' }))
  const result = await source.load()
  assert.equal(result.status, 'error')
  assert.equal(result.hasConfirmedData, true)
  assert.equal(result.lessons.length, 2)
  assert.equal(result.lastSuccessAt, snapshot.lastSuccessAt)
})

test('only HTTPS cache endpoints are accepted', () => {
  assert.throws(() => new VnauScheduleSource(group, 'http://81.30.162.30/'))
})


test('older successful JSON cannot replace a more recent cached snapshot', async () => {
  const source = setup()
  globalThis.fetch = async () => new Response(JSON.stringify(snapshot))
  await source.load()
  globalThis.fetch = async () => new Response(JSON.stringify({ ...snapshot, lastSuccessAt: '2026-11-01T12:00:00Z', lessons: [] }))
  const result = await source.load()
  assert.equal(result.status, 'success')
  assert.equal(result.fromCache, true)
  assert.equal(result.lessons.length, 2)
})

test('legacy getLessons refuses stale data without accompanying status', async () => {
  const source = setup()
  globalThis.fetch = async () => new Response(JSON.stringify(snapshot))
  await source.load()
  globalThis.fetch = async () => { throw new Error('offline') }
  await assert.rejects(source.getLessons(), /use load/)
})

test('teacher data uses teacher ID and preserves overlapping groups', async () => {
  setup()
  const source = new VnauScheduleSource({ kind: 'teacher', id: '1847' }, 'https://example.test/teacher-1847.json')
  const teacherLessons = [
    { ...lesson, sourceId: 'teacher-a', teacherId: '1847', group: 'Група А' },
    { ...lesson, sourceId: 'teacher-b', teacherId: '1847', group: 'Група Б' },
  ]
  globalThis.fetch = async () => new Response(JSON.stringify({ ...snapshot, sourceKind: 'teacher', teacherId: '1847', teacherName: 'Викладач', lessons: teacherLessons }))
  const result = await source.load()
  assert.equal(result.status, 'success')
  assert.deepEqual(result.lessons.map(item => item.group), ['Група А', 'Група Б'])
  assert.ok(result.lessons.every(item => item.teacherId === '1847'))
})

test('lesson metadata is preserved and invalid source metadata is rejected', async () => {
  const source = setup()
  const withMetadata = { ...lesson, lessonNumber: 2, addedDate: '2026-10-30', updatedIndicator: true }
  globalThis.fetch = async () => new Response(JSON.stringify({ ...snapshot, lessons: [withMetadata] }))
  const first = await source.load()
  assert.equal(first.lessons[0].lessonNumber, 2)
  assert.equal(first.lessons[0].addedDate, '2026-10-30')
  assert.equal(first.lessons[0].updatedIndicator, true)
  globalThis.fetch = async () => new Response(JSON.stringify({ ...snapshot, lessons: [{ ...withMetadata, updatedIndicator: 'false' }] }))
  const rejected = await source.load()
  assert.equal(rejected.status, 'error')
  assert.equal(rejected.lessons[0].updatedIndicator, true)
})

test('old schedule copies are bounded without deleting profile settings or the current copy', async () => {
  const source = setup(), now = Date.now()
  localStorage.setItem('depara-selection-v2', 'profile selection')
  for (let i = 0; i < 25; i++) localStorage.setItem(`depara-vnau-v1:group:${100 + i}`, JSON.stringify({version: 1, snapshot, lastUsedAt: now - (i + 1) * 86400000}))
  localStorage.setItem('depara-vnau-v1:group:999', JSON.stringify({version: 1, snapshot, lastUsedAt: now - 31 * 86400000}))
  globalThis.fetch = async () => new Response(JSON.stringify(snapshot))
  assert.equal((await source.load()).hasConfirmedData, true)
  const keys = Array.from({length: localStorage.length}, (_, index) => localStorage.key(index)!).filter(key => key.startsWith('depara-vnau-v1:'))
  assert.ok(keys.length <= 20)
  assert.ok(keys.includes('depara-vnau-v1:group:42'))
  assert.ok(!keys.includes('depara-vnau-v1:group:999'))
  assert.equal(localStorage.getItem('depara-selection-v2'), 'profile selection')
  globalThis.fetch = async () => { throw new Error('offline') }
  assert.equal((await source.load()).lessons.length, 2)
})

test('an old confirmed schedule remains available when the source is offline', async () => {
  const source = setup()
  globalThis.fetch = async () => new Response(JSON.stringify(snapshot))
  await source.load()
  const cacheKey = 'depara-vnau-v1:group:42'
  const entry = JSON.parse(localStorage.getItem(cacheKey)!)
  entry.lastUsedAt = Date.now() - 40 * 86400000
  localStorage.setItem(cacheKey, JSON.stringify(entry))
  globalThis.fetch = async () => { throw new Error('offline') }
  const cached = await source.load()
  assert.equal(cached.status, 'error')
  assert.equal(cached.lessons.length, 2)
  assert.ok(localStorage.getItem(cacheKey))
})

test('daily usage sampling does not expire a schedule before 30 days of inactivity', async () => {
  const source = setup(), now = Date.now()
  const retained = 'depara-vnau-v1:group:100', expired = 'depara-vnau-v1:group:101'
  localStorage.setItem(retained, JSON.stringify({version: 1, snapshot, lastUsedAt: now - 30.5 * 86400000}))
  localStorage.setItem(expired, JSON.stringify({version: 1, snapshot, lastUsedAt: now - 32 * 86400000}))
  globalThis.fetch = async () => new Response(JSON.stringify(snapshot))
  await source.load()
  assert.ok(localStorage.getItem(retained))
  assert.equal(localStorage.getItem(expired), null)
})

test('an oversized result does not replace the last confirmed offline copy', async () => {
  const source = setup()
  globalThis.fetch = async () => new Response(JSON.stringify(snapshot))
  await source.load()
  const bigLessons = Array.from({length: 1100}, (_, index) => ({...lesson, sourceId: `large-${index}`, subject: 'x'.repeat(1000)}))
  globalThis.fetch = async () => new Response(JSON.stringify({...snapshot, lessons: bigLessons}))
  assert.equal((await source.load()).lessons.length, 1100)
  globalThis.fetch = async () => { throw new Error('offline') }
  const cached = await source.load()
  assert.equal(cached.status, 'error')
  assert.equal(cached.lessons.length, 2)
})

import type { Lesson, ScheduleSource } from './schedule'

/**
 * Future HTTPS cache contract. No real VNAU integration is enabled here: the
 * producer must be validated against both public MKR forms before use.
 */
export type VnauSelection =
  | { kind: 'group'; id: string }
  | { kind: 'teacher'; id: string }
export type VnauSyncState = 'success' | 'loading' | 'error' | 'unknown'
export type VnauDateRange = { start: string; end: string }

export interface VnauResult {
  selection: VnauSelection
  status: VnauSyncState
  lastSuccessAt?: string
  lastCheckedAt?: string
  /** Inclusive calendar interval actually checked by MKR. */
  coverageStart?: string
  coverageEnd?: string
  lessons: Lesson[]
  /** Empty lessons are only meaningful when there is confirmed data. */
  hasConfirmedData: boolean
  fromCache: boolean
}

type RecordValue = Record<string, unknown>
type CacheEntry = { version: 1; snapshot: VnauSnapshot; lastUsedAt?: number }
type VnauSnapshot = {
  schemaVersion: 1
  source: 'vnau-mkr'
  sourceKind: 'group' | 'teacher'
  universityId: 'vsau'
  timeZone: 'Europe/Kyiv'
  groupId?: string
  teacherId?: string
  groupName?: string
  teacherName?: string
  status: VnauSyncState
  lastSuccessAt?: string
  lastCheckedAt?: string
  coverageStart?: string
  coverageEnd?: string
  lessons: Lesson[]
}
const CACHE_PREFIX = 'depara-vnau-v1:'
// These are limits for disposable schedule copies, never for profile settings.
const CACHE_MAX_ENTRIES = 20
const CACHE_MAX_BYTES = 1024 * 1024
const CACHE_IDLE_MS = 30 * 24 * 60 * 60 * 1000
const CACHE_TOUCH_MS = 24 * 60 * 60 * 1000
const sourceKinds = ['success', 'loading', 'error', 'unknown'] as const
const own = (value: unknown): value is RecordValue => typeof value === 'object' && value !== null && !Array.isArray(value)
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= 1024
const optionalText = (value: unknown): value is string | undefined | null => value === undefined || value === null || (typeof value === 'string' && value.length <= 1024)
const time = (value: unknown): value is string => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)
function date(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const check = new Date(Date.UTC(year, month - 1, day))
  return year >= 1900 && check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day
}
function instant(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && date(value.slice(0, 10)) && Number.isFinite(Date.parse(value))
}
function optionalInstant(value: unknown): value is string | undefined | null { return value === undefined || value === null || instant(value) }
function validSelection(selection: VnauSelection): boolean {
  return (selection.kind === 'group' || selection.kind === 'teacher') && /^[A-Za-z0-9_-]{1,128}$/.test(selection.id)
}
function key(selection: VnauSelection, range?: VnauDateRange) {
  return `${CACHE_PREFIX}${selection.kind}:${selection.id}${range ? `:${range.start}:${range.end}` : ''}`
}

/** Strictly validate metadata and every lesson; malformed JSON is never success. */
function parseSnapshot(value: unknown, selection: VnauSelection, range?: VnauDateRange): VnauSnapshot | null {
  if (!own(value) || value.schemaVersion !== 1 || value.source !== 'vnau-mkr' || value.universityId !== 'vsau' || value.timeZone !== 'Europe/Kyiv' || value.sourceKind !== selection.kind) return null
  if ((selection.kind === 'group' ? value.groupId : value.teacherId) !== selection.id) return null
  if (!text(selection.kind === 'group' ? value.groupName : value.teacherName)) return null
  if (typeof value.status !== 'string' || !sourceKinds.includes(value.status as VnauSyncState) || !optionalInstant(value.lastSuccessAt) || !optionalInstant(value.lastCheckedAt) || !Array.isArray(value.lessons)) return null
  if (value.status === 'success' && !instant(value.lastSuccessAt)) return null
  if (value.lessons.length > 0 && !instant(value.lastSuccessAt)) return null
  const hasConfirmedData = value.status === 'success' || value.lessons.length > 0 || value.lastSuccessAt != null
  if (hasConfirmedData && (!date(value.coverageStart) || !date(value.coverageEnd) || value.coverageStart > value.coverageEnd)) return null
  if (hasConfirmedData && range && (value.coverageStart !== range.start || value.coverageEnd !== range.end)) return null
  if (!hasConfirmedData && (value.coverageStart != null || value.coverageEnd != null)) return null
  if (value.lessons.length > 5000) return null
  const lessons: Lesson[] = []
  const ids = new Set<string>()
  for (const item of value.lessons) {
    if (!own(item) || !text(item.sourceId) || ids.has(item.sourceId) || !date(item.date) || !time(item.startTime) || !time(item.endTime) || item.endTime <= item.startTime || !text(item.subject)) return null
    if (typeof value.coverageStart !== 'string' || typeof value.coverageEnd !== 'string' || item.date < value.coverageStart || item.date > value.coverageEnd) return null
    if (!optionalText(item.type) || !optionalText(item.room) || !optionalText(item.group) || !optionalText(item.teacher) || !optionalText(item.academicGroupId) || !optionalText(item.teacherId) || !optionalText(item.subgroup) || !optionalText(item.shortSubject)) return null
    if (item.lessonNumber != null && (!Number.isInteger(item.lessonNumber) || (item.lessonNumber as number) < 1 || (item.lessonNumber as number) > 100)) return null
    if (item.addedDate != null && !date(item.addedDate)) return null
    if (item.updatedIndicator != null && typeof item.updatedIndicator !== 'boolean') return null
    if (selection.kind === 'group' && item.academicGroupId !== selection.id) return null
    if (selection.kind === 'teacher' && item.teacherId !== selection.id) return null
    ids.add(item.sourceId)
    // Compute weekday from calendar components, without converting the date to UTC.
    const [year, month, day] = item.date.split('-').map(Number)
    lessons.push({
      id: item.sourceId,
      sourceId: item.sourceId,
      date: item.date,
      day: new Date(year, month - 1, day).getDay(),
      startsAt: item.startTime,
      endsAt: item.endTime,
      title: item.subject,
      type: item.type ?? '',
      location: item.room ?? '',
      teacher: item.teacher ?? '',
      group: item.group ?? '',
      academicGroupId: item.academicGroupId ?? undefined,
      teacherId: item.teacherId ?? undefined,
      subgroup: item.subgroup ?? undefined,
      lessonNumber: (item.lessonNumber as number | null | undefined) ?? undefined,
      shortSubject: item.shortSubject ?? undefined,
      addedDate: (item.addedDate as string | null | undefined) ?? undefined,
      updatedIndicator: (item.updatedIndicator as boolean | null | undefined) ?? undefined,
      color: 'blue',
    })
  }
  return {
    schemaVersion: 1, source: 'vnau-mkr', sourceKind: selection.kind,
    universityId: 'vsau', timeZone: 'Europe/Kyiv',
    ...(selection.kind === 'group' ? { groupId: selection.id, groupName: value.groupName as string } : { teacherId: selection.id, teacherName: value.teacherName as string }),
    status: value.status as VnauSyncState,
    lastSuccessAt: value.lastSuccessAt ?? undefined,
    lastCheckedAt: value.lastCheckedAt ?? undefined,
    coverageStart: value.coverageStart as string | undefined,
    coverageEnd: value.coverageEnd as string | undefined,
    lessons,
  }
}

function loadCached(selection: VnauSelection, range?: VnauDateRange): VnauSnapshot | null {
  try {
    const cacheKey = key(selection, range)
    const data: unknown = JSON.parse(localStorage.getItem(cacheKey) || 'null')
    if (!own(data) || data.version !== 1 || !own(data.snapshot)) return null
    // Cached lessons use the app model: validate by converting back to the raw format.
    const s = data.snapshot
    if (!Array.isArray(s.lessons)) return null
    const normalized = { ...s, lessons: s.lessons.map(item => own(item) ? { ...item, startTime: item.startsAt, endTime: item.endsAt, subject: item.title, room: item.location } : item) }
    const parsed = parseSnapshot(normalized, selection, range)
    if (parsed?.status !== 'success' || !parsed.lastSuccessAt) return null
    const now = Date.now()
    if (typeof data.lastUsedAt !== 'number' || now - data.lastUsedAt >= CACHE_TOUCH_MS) {
      // Updating usage is optional; a full or unavailable browser store must
      // never prevent the previously confirmed schedule from being displayed.
      try { localStorage.setItem(cacheKey, JSON.stringify({ ...data, lastUsedAt: now })) } catch { /* optional */ }
    }
    return parsed
  } catch { return null }
}

function pruneCached(protectedKey: string, now: number): void {
  try {
    const entries: { key: string; used: number; bytes: number }[] = []
    const encoder = new TextEncoder()
    // Gather keys before deletion; localStorage indexes change on removal.
    for (let index = 0; index < localStorage.length; index++) {
      const cacheKey = localStorage.key(index)
      if (!cacheKey?.startsWith(CACHE_PREFIX)) continue
      const raw = localStorage.getItem(cacheKey)
      if (raw === null) continue
      let used = 0
      try {
        const data: unknown = JSON.parse(raw)
        if (own(data) && typeof data.lastUsedAt === 'number' && Number.isFinite(data.lastUsedAt)) used = data.lastUsedAt
        else if (own(data) && own(data.snapshot) && instant(data.snapshot.lastSuccessAt)) used = Date.parse(data.snapshot.lastSuccessAt)
      } catch { /* malformed entries can be discarded */ }
      entries.push({ key: cacheKey, used, bytes: encoder.encode(cacheKey).byteLength + encoder.encode(raw).byteLength })
    }
    let remaining = entries.length
    let bytes = entries.reduce((sum, entry) => sum + entry.bytes, 0)
    for (const entry of entries.sort((a, b) => a.used - b.used)) {
      if (entry.key === protectedKey) continue
      // Usage updates are sampled daily, so leave a day's margin before expiry.
      const expired = now >= entry.used && now - entry.used >= CACHE_IDLE_MS + CACHE_TOUCH_MS
      if (!expired && remaining <= CACHE_MAX_ENTRIES && bytes <= CACHE_MAX_BYTES) continue
      localStorage.removeItem(entry.key)
      remaining--
      bytes -= entry.bytes
    }
  } catch { /* best effort; never interfere with showing a schedule */ }
}

function saveCached(selection: VnauSelection, snapshot: VnauSnapshot, range?: VnauDateRange): void {
  if (snapshot.status !== 'success' || !snapshot.lastSuccessAt) return
  const cacheKey = key(selection, range), now = Date.now()
  const data = JSON.stringify({ version: 1, snapshot, lastUsedAt: now } satisfies CacheEntry)
  // Do not evict useful previous data to make room for one oversized result.
  if (new TextEncoder().encode(cacheKey).byteLength + new TextEncoder().encode(data).byteLength > CACHE_MAX_BYTES) return
  try {
    // Store first: if the browser rejects the write, older confirmed copies stay intact.
    localStorage.setItem(cacheKey, data)
    pruneCached(cacheKey, now)
  } catch { /* Storage is optional. */ }
}

/**
 * Adapter for a separately validated, deployed HTTPS JSON cache. The endpoint
 * is explicit; the Mini App never connects to MKR's unencrypted HTTP server.
 * Callers can inspect load() for status and must not treat missing data as demo.
 */
export class VnauScheduleSource implements ScheduleSource {
  readonly kind = 'external' as const
  private readonly selection: VnauSelection
  private readonly endpoint: string
  private readonly range?: VnauDateRange
  constructor(selection: VnauSelection, endpoint: string, range?: VnauDateRange) {
    this.selection = selection
    this.endpoint = endpoint
    this.range = range
    if (!validSelection(selection)) throw new Error('Invalid VNAU schedule ID')
    if (range && (!date(range.start) || !date(range.end) || range.start > range.end || (Date.parse(`${range.end}T00:00:00Z`) - Date.parse(`${range.start}T00:00:00Z`)) / 86400000 >= 31)) throw new Error('Invalid VNAU schedule range')
    const url = new URL(endpoint)
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('VNAU cache must use HTTPS')
  }
  async load(): Promise<VnauResult> {
    const cached = loadCached(this.selection, this.range)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 120000)
    try {
      let response = await fetch(this.endpoint, { credentials: 'omit', cache: 'no-cache', redirect: 'error', signal: controller.signal })
      // The server serializes access to the university. Retry once only when
      // it explicitly asks clients to wait; never poll MKR from the browser.
      if ((response.status === 429 || response.status === 503) && response.headers.has('Retry-After')) {
        const delay = Math.min(10, Math.max(1, Number(response.headers.get('Retry-After')) || 2))
        await new Promise(resolve => setTimeout(resolve, delay * 1000))
        response = await fetch(this.endpoint, { credentials: 'omit', cache: 'no-cache', redirect: 'error', signal: controller.signal })
      }
      if (!response.ok) throw new Error('Cache unavailable')
      const parsed = parseSnapshot(await response.json(), this.selection, this.range)
      if (!parsed) throw new Error('Invalid schedule data')
      if (parsed.status === 'success') {
        // Another request may have stored newer data while this one was in flight.
        const latestCache = loadCached(this.selection, this.range)
        const useCache = Boolean(latestCache?.lastSuccessAt && parsed.lastSuccessAt && Date.parse(latestCache.lastSuccessAt) > Date.parse(parsed.lastSuccessAt))
        const confirmed = useCache ? latestCache! : parsed
        if (!useCache) saveCached(this.selection, parsed, this.range)
        return { selection: this.selection, status: 'success', lastSuccessAt: confirmed.lastSuccessAt, lastCheckedAt: parsed.lastCheckedAt, coverageStart: confirmed.coverageStart, coverageEnd: confirmed.coverageEnd, lessons: confirmed.lessons, hasConfirmedData: true, fromCache: useCache }
      }
      // Failure metadata may be published with a previously confirmed snapshot.
      // Keep whichever known success is newer; a failed check itself is not success.
      const remoteCached = parsed.lastSuccessAt ? { ...parsed, status: 'success' as const } : null
      const latestCache = loadCached(this.selection, this.range) ?? cached
      const confirmed = remoteCached && (!latestCache || Date.parse(remoteCached.lastSuccessAt!) > Date.parse(latestCache.lastSuccessAt!)) ? remoteCached : latestCache
      if (confirmed === remoteCached && remoteCached) saveCached(this.selection, remoteCached, this.range)
      return { selection: this.selection, status: parsed.status, lastSuccessAt: confirmed?.lastSuccessAt, lastCheckedAt: parsed.lastCheckedAt, coverageStart: confirmed?.coverageStart, coverageEnd: confirmed?.coverageEnd, lessons: confirmed?.lessons ?? [], hasConfirmedData: Boolean(confirmed), fromCache: Boolean(confirmed) }
    } catch {
      const latestCache = loadCached(this.selection, this.range) ?? cached
      return { selection: this.selection, status: 'error', lastSuccessAt: latestCache?.lastSuccessAt, coverageStart: latestCache?.coverageStart, coverageEnd: latestCache?.coverageEnd, lessons: latestCache?.lessons ?? [], hasConfirmedData: Boolean(latestCache), fromCache: Boolean(latestCache) }
    } finally {
      clearTimeout(timeout)
    }
  }
  async getLessons(): Promise<Lesson[]> {
    const result = await this.load()
    if (!result.hasConfirmedData || result.status !== 'success') throw new Error('VNAU schedule unavailable; use load() for cached data and status')
    return result.lessons
  }
}

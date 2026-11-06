/** Read-only VNAU API for Cloudflare Workers. No bot or cron is enabled here. */
import {DurableObject} from 'cloudflare:workers';
import {SourceError} from './matrix.mjs';
import {MkrSession, faculties, courses, groups, teachers, groupSchedule, teacherSchedule} from './upstream.mjs';

const TWO_HOURS = 2 * 60 * 60 * 1000, ERROR_TTL = 10 * 60 * 1000;
const CACHE_RETENTION = 30 * 24 * 60 * 60 * 1000, TOUCH_INTERVAL = 24 * 60 * 60 * 1000;
// A single shared store has an account-wide bound; arbitrary searches or IDs
// cannot create an unlimited number of separate persistent databases.
const MAX_ENTRIES = 512, MAX_CACHE_BYTES = 5 * 1024 * 1024, MAX_ENTRY_BYTES = 1024 * 1024;
const ID = /^\d{1,12}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SITE_ORIGIN = 'https://yaroshandriy16-beep.github.io';
const encoder = new TextEncoder();

class ApiError extends Error {
  constructor(status, message, retryAfter) {super(message); this.status = status; this.retryAfter = retryAfter}
}
function validDate(value) {
  if (!DATE.test(value)) return false;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value;
}
function validateWindow(start, end) {
  if (!validDate(start) || !validDate(end) || start > end || (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000 >= 31) throw new ApiError(400, 'Оберіть коректний діапазон до 31 дня.');
}
function only(query, key) {
  const values = query.getAll(key);
  if (values.length !== 1 || !values[0]) throw new ApiError(400, 'Некоректні параметри запиту.');
  return values[0];
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const iso = now => new Date(now).toISOString().replace(/\.\d{3}Z$/, 'Z');

/** The university is one shared resource: only brief reservations use this DO. */
export class RateGate extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS gate (id INTEGER PRIMARY KEY, token TEXT, kind TEXT, busy_until INTEGER NOT NULL, last_source INTEGER NOT NULL, last_schedule INTEGER NOT NULL, last_search INTEGER NOT NULL)');
    this.ctx.storage.sql.exec("INSERT OR IGNORE INTO gate VALUES (1, '', '', 0, 0, 0, 0)");
  }
  reserve(kind) {
    if (!['catalogue', 'search', 'schedule'].includes(kind)) throw new Error('Invalid operation');
    const now = Date.now(), state = this.ctx.storage.sql.exec('SELECT * FROM gate WHERE id = 1').one();
    const earliest = Math.max(state.busy_until || 0, (state.last_source || 0) + 1000,
      kind === 'schedule' ? (state.last_schedule || 0) + 10000 : 0,
      kind === 'search' ? (state.last_search || 0) + 5000 : 0);
    if (earliest > now) return {ok: false, retryAfter: Math.max(1, Math.ceil((earliest - now) / 1000))};
    const token = crypto.randomUUID();
    this.ctx.storage.sql.exec('UPDATE gate SET token = ?, kind = ?, busy_until = ? WHERE id = 1', token, kind, now + 120000);
    return {ok: true, token};
  }
  release(token) {
    const state = this.ctx.storage.sql.exec('SELECT token, kind FROM gate WHERE id = 1').one();
    if (!token || state.token !== token) return false;
    const now = Date.now();
    this.ctx.storage.sql.exec("UPDATE gate SET token = '', busy_until = 0, last_source = ?, last_schedule = CASE WHEN kind = 'schedule' THEN ? ELSE last_schedule END, last_search = CASE WHEN kind = 'search' THEN ? ELSE last_search END, kind = '' WHERE id = 1", now, now, now);
    return true;
  }
}

async function sourceOperation(env, kind, operation, waitForCooldown = false) {
  const gate = env.MKR_GATE.getByName('public-vnau-source');
  let ticket = await gate.reserve(kind);
  if (!ticket.ok && waitForCooldown && ticket.retryAfter <= 11) {
    await delay(ticket.retryAfter * 1000);
    ticket = await gate.reserve(kind);
  }
  if (!ticket.ok) throw new ApiError(429, 'Джерело ВНАУ зайняте. Спробуйте ще раз.', ticket.retryAfter);
  try {
    const fetcher = env.LOCAL_UPSTREAM ? (url, init) => env.LOCAL_UPSTREAM.fetch(url, init) : fetch;
    return await operation(new MkrSession(fetcher));
  } finally {
    // If release fails the short durable lease still expires on its own.
    try {await gate.release(ticket.token)} catch { /* no upstream details in logs */ }
  }
}

function chunkRanges(start, end) {
  const ranges = [];
  let current = Date.parse(`${start}T00:00:00Z`), last = Date.parse(`${end}T00:00:00Z`);
  while (current <= last) {
    const next = Math.min(last, current + 13 * 86400000);
    ranges.push({start: new Date(current).toISOString().slice(0, 10), end: new Date(next).toISOString().slice(0, 10)});
    current = next + 86400000;
  }
  return ranges;
}

function payload(kind, detail, status, checked, previous, name, lessons) {
  const teacher = kind === 'teacher';
  const result = {schemaVersion: 1, source: 'vnau-mkr', sourceKind: kind, universityId: 'vsau', timeZone: 'Europe/Kyiv',
    ...(teacher ? {teacherId: detail.id, teacherName: name} : {groupId: detail.id, groupName: name}),
    status, lastCheckedAt: iso(checked), lessons: status === 'success' ? lessons : previous?.lastSuccessAt ? previous.lessons : []};
  if (status === 'success') Object.assign(result, {lastSuccessAt: iso(checked), coverageStart: detail.start, coverageEnd: detail.end});
  else if (previous?.lastSuccessAt) Object.assign(result, {lastSuccessAt: previous.lastSuccessAt, coverageStart: previous.coverageStart, coverageEnd: previous.coverageEnd});
  return result;
}

/** One bounded store shared by all users; entries are separated by source ID. */
export class SourceCache extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.inflight = new Map();
    this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, value TEXT NOT NULL, checked INTEGER NOT NULL, used INTEGER NOT NULL)');
  }
  cacheKey(detail) {
    const owner = objectName(detail);
    return detail.type === 'schedule' ? `${owner}:${detail.start}:${detail.end}` : owner;
  }
  entry(key) {
    const row = this.ctx.storage.sql.exec('SELECT value, checked, used FROM cache WHERE key = ?', key).toArray()[0];
    if (!row) return null;
    try {return {value: JSON.parse(row.value), checked: row.checked, used: row.used}}
    catch {throw new ApiError(503, 'Збережені дані потребують перевірки.')}
  }
  async touched(key, row, now) {
    if (now - row.used < TOUCH_INTERVAL) return;
    this.ctx.storage.sql.exec('UPDATE cache SET used = ? WHERE key = ?', now, key);
    if (await this.ctx.storage.getAlarm() === null) await this.ctx.storage.setAlarm(now + CACHE_RETENTION + TOUCH_INTERVAL);
  }
  async save(key, value, now) {
    const raw = JSON.stringify(value), size = encoder.encode(raw).byteLength;
    if (size > MAX_ENTRY_BYTES) throw new ApiError(503, 'Не вдалося зберегти розклад.');
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec('INSERT INTO cache (key, value, checked, used) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, checked = excluded.checked, used = excluded.used', key, raw, now, now);
      const rows = this.ctx.storage.sql.exec('SELECT key, length(CAST(value AS BLOB)) AS size FROM cache ORDER BY used DESC, key').toArray();
      let bytes = rows.reduce((sum, row) => sum + row.size, 0), count = rows.length;
      for (const row of rows.reverse()) {
        if (count <= MAX_ENTRIES && bytes <= MAX_CACHE_BYTES) break;
        if (row.key === key) continue;
        this.ctx.storage.sql.exec('DELETE FROM cache WHERE key = ?', row.key);
        count--; bytes -= row.size;
      }
    });
    if (await this.ctx.storage.getAlarm() === null) await this.ctx.storage.setAlarm(now + CACHE_RETENTION + TOUCH_INTERVAL);
  }
  async alarm() {
    const now = Date.now();
    // Usage is sampled daily; allow an extra day so we never expire a copy
    // less than 30 days after its actual most recent use.
    this.ctx.storage.sql.exec('DELETE FROM cache WHERE used < ?', now - CACHE_RETENTION - TOUCH_INTERVAL);
    const next = this.ctx.storage.sql.exec('SELECT MIN(used) AS oldest FROM cache').one().oldest;
    if (next !== null) await this.ctx.storage.setAlarm(Math.max(now + 60000, next + CACHE_RETENTION + TOUCH_INTERVAL));
  }
  async get(detail) {
    try {return {ok: true, value: await this.read(detail)}}
    catch (error) {
      if (error instanceof ApiError) return {ok: false, status: error.status, message: error.message, retryAfter: error.retryAfter};
      if (error instanceof SourceError && error.message.startsWith('Забагато результатів.')) return {ok: false, status: 503, message: error.message};
      return {ok: false, status: 503, message: 'Джерело ВНАУ тимчасово недоступне.'};
    }
  }
  async read(detail) {
    const key = this.cacheKey(detail), now = Date.now(), cached = this.entry(key);
    if (detail.type === 'schedule' && cached?.value?.sourceKind === 'group' && cached.value.groupName !== detail.name) throw new ApiError(400, 'Назва групи не відповідає ID.');
    const ttl = detail.type === 'schedule' ? (cached?.value?.status === 'success' ? TWO_HOURS : ERROR_TTL) : detail.type === 'teachers' ? 15 * 60 * 1000 : 6 * 60 * 60 * 1000;
    if (cached && now >= cached.checked && now - cached.checked < ttl) {
      await this.touched(key, cached, now);
      return cached.value;
    }
    if (this.inflight.has(key)) return this.inflight.get(key);
    const pending = this.refresh(detail, key, cached?.value || null);
    this.inflight.set(key, pending);
    try {return await pending} finally {this.inflight.delete(key)}
  }
  async refresh(detail, key, previous) {
    if (detail.type !== 'schedule') {
      const value = await sourceOperation(this.env, detail.type === 'teachers' ? 'search' : 'catalogue', async session => {
        if (detail.type === 'faculties') return {faculties: await faculties(session)};
        if (detail.type === 'courses') return {courses: await courses(session, detail.facultyId)};
        if (detail.type === 'groups') return {groups: await groups(session, detail.facultyId, detail.course)};
        if (detail.type === 'teachers') return {teachers: await teachers(session, detail.query)};
        throw new ApiError(400, 'Некоректний запит.');
      });
      await this.save(key, value, Date.now());
      return value;
    }
    const kind = detail.kind, previousName = kind === 'group' ? detail.name : previous?.teacherName || `Викладач ${detail.id}`;
    let name = previousName, lessons = [];
    try {
      let confirmedTeacher = '';
      for (const range of chunkRanges(detail.start, detail.end)) {
        const item = await sourceOperation(this.env, 'schedule', session => kind === 'group'
          ? groupSchedule(session, detail, range.start, range.end)
          : teacherSchedule(session, detail, range.start, range.end), true);
        if (kind === 'teacher' && (!item.name || (confirmedTeacher && item.name !== confirmedTeacher))) throw new SourceError('Teacher changed across ranges');
        if (kind === 'teacher') confirmedTeacher = item.name;
        name = item.name;
        lessons.push(...item.lessons);
      }
      const seen = new Set();
      for (const item of lessons) {
        if (seen.has(item.sourceId)) throw new SourceError('Duplicate source event');
        seen.add(item.sourceId);
      }
      lessons.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.sourceId.localeCompare(b.sourceId));
      const result = payload(kind, detail, 'success', Date.now(), null, name, lessons);
      await this.save(key, result, Date.now());
      return result;
    } catch (error) {
      if (error instanceof ApiError && error.status === 429) {
        if (!previous?.lastSuccessAt) throw error;
        // A busy upstream is not a failed refresh: let the next request retry
        // while returning the last confirmed timetable to this caller.
        return payload(kind, detail, 'error', Date.now(), previous, previousName, []);
      }
      const result = payload(kind, detail, 'error', Date.now(), previous, previousName, []);
      try {await this.save(key, result, Date.now())} catch { /* retain the last durable copy */ }
      return result;
    }
  }
}

function route(url) {
  const path = url.pathname, query = url.searchParams;
  if (url.search.length > 2048) throw new ApiError(400, 'Забагато параметрів запиту.');
  if (path === '/api/vnau/faculties') return {type: 'faculties'};
  let match = path.match(/^\/api\/vnau\/faculties\/(\d{1,12})\/courses$/);
  if (match) return {type: 'courses', facultyId: match[1]};
  match = path.match(/^\/api\/vnau\/faculties\/(\d{1,12})\/courses\/([1-7])\/groups$/);
  if (match) return {type: 'groups', facultyId: match[1], course: match[2]};
  if (path === '/api/vnau/teachers') {
    const search = only(query, 'query').trim();
    if (search.length < 2 || search.length > 80 || /[\x00-\x1f]/.test(search)) throw new ApiError(400, 'Введіть щонайменше дві літери прізвища або ПІБ.');
    return {type: 'teachers', query: search};
  }
  match = path.match(/^\/api\/vnau\/(groups|teachers)\/(\d{1,12})\/schedule$/);
  if (match) {
    const kind = match[1] === 'groups' ? 'group' : 'teacher', start = only(query, 'start'), end = only(query, 'end');
    validateWindow(start, end);
    const detail = {type: 'schedule', kind, id: match[2], start, end};
    if (kind === 'group') {
      detail.facultyId = only(query, 'facultyId'); detail.course = only(query, 'course'); detail.name = only(query, 'name');
      if (!ID.test(detail.facultyId) || !/^[1-7]$/.test(detail.course) || !detail.name.trim() || detail.name.length > 120 || /[\x00-\x1f]/.test(detail.name)) throw new ApiError(400, 'Некоректні дані групи.');
    }
    return detail;
  }
  throw new ApiError(404, 'Адресу не знайдено.');
}
function objectName(detail) {
  if (detail.type === 'schedule') return `${detail.kind}:${detail.id}`;
  if (detail.type === 'courses') return `courses:${detail.facultyId}`;
  if (detail.type === 'groups') return `groups:${detail.facultyId}:${detail.course}`;
  if (detail.type === 'teachers') return `search:${detail.query.toLocaleLowerCase('uk')}`;
  return 'faculties';
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url), origin = request.headers.get('Origin');
    const allowed = !origin || origin === SITE_ORIGIN || origin === url.origin;
    const headers = new Headers({'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Vary': 'Origin'});
    if (origin && allowed) {headers.set('Access-Control-Allow-Origin', origin); headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS'); headers.set('Access-Control-Expose-Headers', 'Retry-After')}
    try {
      if (!allowed) throw new ApiError(403, 'Джерело запиту не дозволене.');
      if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers});
      if (request.method !== 'GET') throw new ApiError(405, 'Дозволені лише запити на читання.');
      if (url.pathname === '/healthz') return Response.json({status: 'ok'}, {headers});
      const detail = route(url), cache = env.MKR_CACHE.getByName('vnau-shared-cache');
      const result = await cache.get(detail);
      if (!result.ok) throw new ApiError(result.status, result.message, result.retryAfter);
      return Response.json(result.value, {headers});
    } catch (error) {
      // RPC exceptions can cross a Durable Object boundary as ordinary Errors;
      // only fixed public messages are ever returned to the browser.
      const status = error instanceof ApiError ? error.status : 503;
      const message = error instanceof ApiError ? error.message : error instanceof SourceError && error.message.startsWith('Забагато результатів.') ? error.message : 'Джерело ВНАУ тимчасово недоступне.';
      if (error instanceof ApiError && error.retryAfter) headers.set('Retry-After', String(Math.min(120, error.retryAfter)));
      return Response.json({error: message}, {status, headers});
    }
  }
};

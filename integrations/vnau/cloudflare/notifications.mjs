/** Test-bot subscriptions. Never log tokens, Telegram initData, or message bodies. */
const CHECK_INTERVAL = 2 * 60 * 60 * 1000;
const RETRY_INTERVAL = 15 * 60 * 1000;
const OUTBOX_RETENTION = 24 * 60 * 60 * 1000;
const MAX_WATCHES = 80, MAX_SUBSCRIPTIONS = 500, MAX_OUTBOX = 2000;
const MAX_BASELINE_BYTES = 256 * 1024, MAX_BASELINES_BYTES = 5 * 1024 * 1024;
const MAX_WATCHES_PER_TICK = 10, MAX_MESSAGES_PER_TICK = 30;
const encoder = new TextEncoder();
const idPattern = /^\d{1,12}$/;

export class NotificationError extends Error {
  constructor(status, message) {super(message); this.status = status}
}

function tokenFor(env) {
  const token = env.TELEGRAM_TEST_BOT_TOKEN;
  if (typeof token !== 'string' || !/^\d{5,15}:[A-Za-z0-9_-]{20,80}$/.test(token)) throw new NotificationError(503, 'Сповіщення тестового бота ще не налаштовані.');
  return token;
}

/** Verify signed Mini App data; initDataUnsafe is never an authorization source. */
export async function verifyTelegramInitData(raw, token, now = Date.now()) {
  if (typeof raw !== 'string' || !raw || raw.length > 8192) throw new NotificationError(401, 'Відкрийте застосунок через тестового Telegram-бота.');
  const values = new URLSearchParams(raw), seen = new Set();
  for (const [key] of values) {
    if (seen.has(key)) throw new NotificationError(401, 'Не вдалося перевірити Telegram.');
    seen.add(key);
  }
  const supplied = values.get('hash'), authDate = values.get('auth_date');
  if (!supplied || !/^[0-9a-f]{64}$/i.test(supplied) || !authDate || !/^\d{1,12}$/.test(authDate)) throw new NotificationError(401, 'Не вдалося перевірити Telegram.');
  const issued = Number(authDate) * 1000;
  if (issued > now + 60000 || now - issued > 24 * 60 * 60 * 1000) throw new NotificationError(401, 'Відкрийте застосунок у Telegram ще раз.');
  const check = [...values.entries()].filter(([key]) => key !== 'hash').sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, value]) => `${key}=${value}`).join('\n');
  const secret = await crypto.subtle.importKey('raw', encoder.encode('WebAppData'), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  const derived = await crypto.subtle.sign('HMAC', secret, encoder.encode(token));
  const verifier = await crypto.subtle.importKey('raw', derived, {name: 'HMAC', hash: 'SHA-256'}, false, ['verify']);
  const signature = Uint8Array.from(supplied.match(/../g), byte => parseInt(byte, 16));
  if (!await crypto.subtle.verify('HMAC', verifier, signature, encoder.encode(check))) throw new NotificationError(401, 'Не вдалося перевірити Telegram.');
  let user;
  try {user = JSON.parse(values.get('user') || '')} catch {throw new NotificationError(401, 'Не вдалося перевірити Telegram.')}
  if (!user || !Number.isSafeInteger(user.id) || user.id <= 0 || user.is_bot === true) throw new NotificationError(401, 'Не вдалося перевірити Telegram.');
  return String(user.id);
}

async function telegramRequest(env, method, data) {
  const token = tokenFor(env);
  const url = `https://api.telegram.org/bot${token}/${method}`;
  let response;
  try {
    const init = {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data), signal: AbortSignal.timeout(10000)};
    response = env.TEST_TELEGRAM ? await env.TEST_TELEGRAM.fetch(url, init) : await fetch(url, init);
    const text = await response.text();
    if (text.length > 32768) return {ok: false, code: 0};
    const body = JSON.parse(text);
    return {ok: response.ok && body.ok === true, code: response.status, result: body.result, retryAfter: body.parameters?.retry_after};
  } catch {return {ok: false, code: 0}}
}

/** Refuse to use a token for any bot except the explicitly selected test bot. */
export async function verifyTestBot(env) {
  const result = await telegramRequest(env, 'getMe', {});
  if (!result.ok || typeof result.result?.username !== 'string' || result.result.username.toLowerCase() !== 'deparratest_bot') throw new NotificationError(503, 'Тестовий бот тимчасово недоступний.');
}

function checkIdentity(identity) {
  if (!identity || typeof identity !== 'object' || !['group', 'teacher'].includes(identity.kind) || typeof identity.id !== 'string' || !idPattern.test(identity.id)) throw new NotificationError(400, 'Оберіть розклад ВНАУ.');
  if (identity.kind === 'teacher') return {kind: 'teacher', id: identity.id};
  if (typeof identity.facultyId !== 'string' || !idPattern.test(identity.facultyId) || typeof identity.course !== 'string' || !/^[1-7]$/.test(identity.course) || typeof identity.name !== 'string' || !identity.name.trim() || identity.name.length > 120 || /[\x00-\x1f]/.test(identity.name)) throw new NotificationError(400, 'Оберіть розклад ВНАУ.');
  return {kind: 'group', id: identity.id, facultyId: identity.facultyId, course: identity.course, name: identity.name.trim()};
}
const watchKey = identity => `${identity.kind}:${identity.id}`;

export function notificationRange(now = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-GB', {timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(new Date(now));
  const get = type => parts.find(part => part.type === type)?.value;
  const start = `${get('year')}-${get('month')}-${get('day')}`;
  const end = new Date(Date.parse(`${start}T00:00:00Z`) + 13 * 86400000).toISOString().slice(0, 10);
  return {start, end};
}

/** Keep only fields necessary for detecting a real timetable change. */
export function compactSnapshot(result, range, identity) {
  if (!result || result.status !== 'success' || result.sourceKind !== identity.kind || (identity.kind === 'group' ? result.groupId : result.teacherId) !== identity.id || result.coverageStart !== range.start || result.coverageEnd !== range.end || !Array.isArray(result.lessons) || result.lessons.length > 5000) throw new NotificationError(503, 'Підтверджений розклад ВНАУ тимчасово недоступний.');
  const lessons = result.lessons.map(lesson => {
    if (!lesson || typeof lesson.date !== 'string' || lesson.date < range.start || lesson.date > range.end || typeof lesson.startTime !== 'string' || typeof lesson.endTime !== 'string' || typeof lesson.subject !== 'string') throw new NotificationError(503, 'Не вдалося перевірити розклад ВНАУ.');
    return [lesson.date, lesson.startTime, lesson.endTime, lesson.subject, lesson.type || '', lesson.room || '', lesson.group || '', lesson.teacher || '', lesson.lessonNumber || 0];
  }).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const snapshot = {start: range.start, end: range.end, lessons};
  if (encoder.encode(JSON.stringify(snapshot)).byteLength > MAX_BASELINE_BYTES) throw new NotificationError(503, 'Розклад завеликий для сповіщень.');
  return snapshot;
}

/** Compare only dates covered by both confirmed snapshots, never rolling edges. */
export function changedDates(previous, current) {
  if (!previous || !current || !Array.isArray(previous.lessons) || !Array.isArray(current.lessons)) return [];
  const start = previous.start > current.start ? previous.start : current.start;
  const end = previous.end < current.end ? previous.end : current.end;
  if (start > end) return [];
  const dates = new Set([...previous.lessons, ...current.lessons].map(item => item[0]).filter(day => day >= start && day <= end));
  const result = [];
  for (const day of [...dates].sort()) {
    const before = previous.lessons.filter(item => item[0] === day).map(item => JSON.stringify(item)).sort();
    const after = current.lessons.filter(item => item[0] === day).map(item => JSON.stringify(item)).sort();
    if (JSON.stringify(before) !== JSON.stringify(after)) result.push(day);
  }
  return result;
}

function messageFor(label, dates, before, after) {
  const lines = [`ДеПара · зміни для «${label}»`];
  const subtract = (left, right) => {
    const counts = new Map();
    for (const item of right) {const key = JSON.stringify(item); counts.set(key, (counts.get(key) || 0) + 1)}
    return left.filter(item => {
      const key = JSON.stringify(item), count = counts.get(key) || 0;
      if (!count) return true;
      counts.set(key, count - 1); return false;
    });
  };
  const describe = items => {
    const list = items.slice(0, 2).map(item => `${item[1]}–${item[2]} ${item[3]}${item[5] ? ` · ${item[5]}` : ''}${item[6] ? ` · ${item[6]}` : ''}`.slice(0, 160));
    if (items.length > 2) list.push(`та ще ${items.length - 2}`);
    return list.join('; ');
  };
  for (const day of dates.slice(0, 3)) {
    const old = before.lessons.filter(item => item[0] === day), current = after.lessons.filter(item => item[0] === day);
    const removed = subtract(old, current), added = subtract(current, old);
    lines.push(`\n${day.slice(8, 10)}.${day.slice(5, 7)}:`);
    if (removed.length) lines.push(`${added.length ? 'Було' : 'Більше немає в розкладі'}: ${describe(removed)}`);
    if (added.length) lines.push(`${removed.length ? 'Стало' : 'Додано'}: ${describe(added)}`);
  }
  if (dates.length > 3) lines.push(`\nТакож змінено ще ${dates.length - 3} дн.`);
  lines.push('\nВідкрийте застосунок, щоб переглянути актуальний розклад.');
  return lines.join('\n');
}

export class NotificationStore {
  constructor(ctx, env) {
    this.ctx = ctx; this.env = env;
    const sql = ctx.storage.sql;
    sql.exec('CREATE TABLE IF NOT EXISTS notify_watches (key TEXT PRIMARY KEY, identity TEXT NOT NULL, label TEXT NOT NULL, snapshot TEXT NOT NULL, baseline_at INTEGER NOT NULL, next_check INTEGER NOT NULL, generation TEXT NOT NULL, version INTEGER NOT NULL)');
    sql.exec('CREATE TABLE IF NOT EXISTS notify_subscriptions (user_id TEXT PRIMARY KEY, watch_key TEXT NOT NULL, joined_at INTEGER NOT NULL)');
    sql.exec('CREATE TABLE IF NOT EXISTS notify_revisions (user_id TEXT PRIMARY KEY, revision TEXT NOT NULL, updated_at INTEGER NOT NULL, last_test INTEGER NOT NULL DEFAULT 0)');
    sql.exec('CREATE TABLE IF NOT EXISTS notify_outbox (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, watch_key TEXT NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL, next_try INTEGER NOT NULL, state TEXT NOT NULL)');
  }
  revision(userId, now) {
    const sql = this.ctx.storage.sql, revision = crypto.randomUUID();
    sql.exec('INSERT INTO notify_revisions (user_id, revision, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET revision = excluded.revision, updated_at = excluded.updated_at', userId, revision, now);
    return revision;
  }
  status(userId) {
    const row = this.ctx.storage.sql.exec('SELECT w.identity, w.label, w.baseline_at, s.joined_at FROM notify_subscriptions s JOIN notify_watches w ON w.key = s.watch_key WHERE s.user_id = ?', userId).toArray()[0];
    if (!row) return {enabled: false};
    const identity = JSON.parse(row.identity);
    return {enabled: true, pending: row.joined_at > row.baseline_at, identity: {kind: identity.kind, id: identity.id, name: row.label}};
  }
  async fetchSnapshot(identity, now, minimumCheckedAt = 0) {
    const range = notificationRange(now), detail = {type: 'schedule', ...identity, start: range.start, end: range.end};
    const result = await this.env.MKR_CACHE.getByName('vnau-shared-cache').get(detail, minimumCheckedAt);
    if (!result.ok) throw new NotificationError(result.status === 429 ? 429 : 503, 'Не вдалося отримати розклад. Спробуйте трохи пізніше.');
    const snapshot = compactSnapshot(result.value, range, identity);
    return {snapshot, label: identity.kind === 'group' ? result.value.groupName : result.value.teacherName};
  }
  async enable(userId, supplied) {
    const identity = checkIdentity(supplied), key = watchKey(identity), now = Date.now(), sql = this.ctx.storage.sql;
    const rev = this.revision(userId, now);
    try {
      const chat = await telegramRequest(this.env, 'getChat', {chat_id: userId});
      if (!chat.ok || String(chat.result?.id || '') !== userId) throw new NotificationError(409, 'Відкрийте @DeParraTest_bot і натисніть «Start», потім спробуйте знову.');
      let existing = sql.exec('SELECT * FROM notify_watches WHERE key = ?', key).toArray()[0];
      if (existing && existing.identity !== JSON.stringify(identity)) throw new NotificationError(409, 'Дані групи змінилися. Оберіть її ще раз.');
      let fresh = null;
      if (!existing) fresh = await this.fetchSnapshot(identity, now, now);
      if (sql.exec('SELECT revision FROM notify_revisions WHERE user_id = ?', userId).toArray()[0]?.revision !== rev) throw new NotificationError(409, 'Налаштування вже змінено в іншому запиті.');
      this.ctx.storage.transactionSync(() => {
        existing = sql.exec('SELECT * FROM notify_watches WHERE key = ?', key).toArray()[0];
        const old = sql.exec('SELECT watch_key, joined_at FROM notify_subscriptions WHERE user_id = ?', userId).toArray()[0];
        let created = false;
        if (!old && sql.exec('SELECT count(*) AS count FROM notify_subscriptions').one().count >= MAX_SUBSCRIPTIONS) throw new NotificationError(503, 'Досягнуто ліміту тестових підписок.');
        if (!existing) {
          if (!fresh || sql.exec('SELECT count(*) AS count FROM notify_watches').one().count >= MAX_WATCHES) throw new NotificationError(503, 'Досягнуто ліміту тестових розкладів.');
          const raw = JSON.stringify(fresh.snapshot), total = sql.exec('SELECT COALESCE(SUM(length(CAST(snapshot AS BLOB))),0) AS bytes FROM notify_watches').one().bytes;
          if (total + encoder.encode(raw).byteLength > MAX_BASELINES_BYTES) throw new NotificationError(503, 'Тимчасово немає місця для нової підписки.');
          const confirmedAt = Date.now();
          sql.exec('INSERT INTO notify_watches VALUES (?, ?, ?, ?, ?, ?, ?, 1)', key, JSON.stringify(identity), fresh.label, raw, confirmedAt, confirmedAt + CHECK_INTERVAL, crypto.randomUUID());
          existing = {baseline_at: confirmedAt, label: fresh.label};
          created = true;
        } else if (existing.identity !== JSON.stringify(identity)) throw new NotificationError(409, 'Дані групи змінилися. Оберіть її ще раз.');
        if (old?.watch_key !== key) sql.exec('DELETE FROM notify_outbox WHERE user_id = ?', userId);
        const joined = old?.watch_key === key ? old.joined_at : created ? existing.baseline_at : Math.max(Date.now() + 1, existing.baseline_at + 1);
        sql.exec('INSERT INTO notify_subscriptions VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET watch_key = excluded.watch_key, joined_at = excluded.joined_at', userId, key, joined);
        // New subscribers join after the next shared fresh snapshot so they do
        // not receive changes from before they opted in.
        if (!created && old?.watch_key !== key) sql.exec('UPDATE notify_watches SET next_check = MIN(next_check, ?) WHERE key = ?', Date.now() + 1000, key);
        sql.exec('DELETE FROM notify_watches WHERE key NOT IN (SELECT watch_key FROM notify_subscriptions)');
      });
      return this.status(userId);
    } finally {
      // A failed opt-in leaves no user identifier behind, without undoing a
      // newer concurrent request or an existing active subscription.
      sql.exec('DELETE FROM notify_revisions WHERE user_id = ? AND revision = ? AND user_id NOT IN (SELECT user_id FROM notify_subscriptions)', userId, rev);
    }
  }
  disable(userId) {
    const sql = this.ctx.storage.sql, now = Date.now();
    this.ctx.storage.transactionSync(() => {
      this.revision(userId, now);
      sql.exec('DELETE FROM notify_subscriptions WHERE user_id = ?', userId);
      sql.exec('DELETE FROM notify_outbox WHERE user_id = ?', userId);
      sql.exec('DELETE FROM notify_watches WHERE key NOT IN (SELECT watch_key FROM notify_subscriptions)');
      sql.exec('DELETE FROM notify_revisions WHERE user_id = ?', userId);
    });
    return {enabled: false};
  }
  async testMessage(userId) {
    const sql = this.ctx.storage.sql, now = Date.now(), status = this.status(userId);
    if (!status.enabled) throw new NotificationError(409, 'Спочатку увімкніть сповіщення.');
    let allowed = false;
    this.ctx.storage.transactionSync(() => {
      const row = sql.exec('SELECT last_test FROM notify_revisions WHERE user_id = ?', userId).toArray()[0];
      if (row && now - row.last_test >= 30000) {sql.exec('UPDATE notify_revisions SET last_test = ? WHERE user_id = ?', now, userId); allowed = true}
    });
    if (!allowed) throw new NotificationError(429, 'Спробуйте надіслати тестове повідомлення через 30 секунд.');
    const sent = await telegramRequest(this.env, 'sendMessage', {chat_id: userId, text: 'ДеПара: тестове сповіщення працює. Повідомлятимемо про перевірені зміни вашого розкладу.'});
    if (!sent.ok) throw new NotificationError(503, 'Повідомлення не доставлено. Перевірте, чи запущений тестовий бот.');
    return {sent: true};
  }
  async checkWatch(watch, now) {
    const sql = this.ctx.storage.sql;
    try {
      const checkStarted = Date.now();
      const pendingAfter = sql.exec('SELECT MAX(joined_at) AS latest FROM notify_subscriptions WHERE watch_key = ? AND joined_at > ?', watch.key, watch.baseline_at).one().latest || 0;
      const identity = JSON.parse(watch.identity), fresh = await this.fetchSnapshot(identity, now, pendingAfter), previous = JSON.parse(watch.snapshot);
      const changed = changedDates(previous, fresh.snapshot), raw = JSON.stringify(fresh.snapshot);
      this.ctx.storage.transactionSync(() => {
        const current = sql.exec('SELECT * FROM notify_watches WHERE key = ?', watch.key).toArray()[0];
        if (!current || current.generation !== watch.generation || current.version !== watch.version) return;
        const total = sql.exec('SELECT COALESCE(SUM(length(CAST(snapshot AS BLOB))),0) AS bytes FROM notify_watches WHERE key != ?', watch.key).one().bytes;
        if (total + encoder.encode(raw).byteLength > MAX_BASELINES_BYTES) {sql.exec('UPDATE notify_watches SET next_check = ? WHERE key = ?', now + RETRY_INTERVAL, watch.key); return}
        const targets = changed.length ? sql.exec('SELECT user_id FROM notify_subscriptions WHERE watch_key = ? AND joined_at <= ?', watch.key, watch.baseline_at).toArray() : [];
        const pending = sql.exec('SELECT count(*) AS count FROM notify_outbox').one().count;
        if (pending + targets.length > MAX_OUTBOX) {sql.exec('UPDATE notify_watches SET next_check = ? WHERE key = ?', now + RETRY_INTERVAL, watch.key); return}
        const body = messageFor(current.label, changed, previous, fresh.snapshot);
        for (const target of targets) sql.exec('INSERT INTO notify_outbox VALUES (?, ?, ?, ?, ?, ?, ?)', crypto.randomUUID(), target.user_id, watch.key, body, now, now, 'pending');
        // People who subscribe during the fetch wait for the next fresh check.
        const confirmedAt = Math.max(checkStarted, pendingAfter);
        const later = sql.exec('SELECT 1 AS present FROM notify_subscriptions WHERE watch_key = ? AND joined_at > ? LIMIT 1', watch.key, confirmedAt).toArray().length > 0;
        sql.exec('UPDATE notify_watches SET snapshot = ?, label = ?, baseline_at = ?, next_check = ?, version = version + 1 WHERE key = ?', raw, fresh.label, confirmedAt, Date.now() + (later ? 1000 : CHECK_INTERVAL), watch.key);
      });
    } catch {
      // A failed or incomplete source response never changes the baseline.
      sql.exec('UPDATE notify_watches SET next_check = ? WHERE key = ? AND generation = ? AND version = ?', now + RETRY_INTERVAL, watch.key, watch.generation, watch.version);
    }
  }
  async drain(now) {
    const sql = this.ctx.storage.sql;
    // A crash after send has an unknown outcome; do not resend and duplicate it.
    sql.exec("DELETE FROM notify_outbox WHERE (state = 'sending' AND next_try <= ?) OR created_at < ?", now, now - OUTBOX_RETENTION);
    const messages = sql.exec("SELECT * FROM notify_outbox WHERE state = 'pending' AND next_try <= ? ORDER BY created_at LIMIT ?", now, MAX_MESSAGES_PER_TICK).toArray();
    for (const item of messages) {
      const active = sql.exec('SELECT r.revision FROM notify_subscriptions s JOIN notify_revisions r ON r.user_id = s.user_id WHERE s.user_id = ? AND s.watch_key = ?', item.user_id, item.watch_key).toArray()[0];
      if (!active) {sql.exec('DELETE FROM notify_outbox WHERE id = ?', item.id); continue}
      const claimed = sql.exec("UPDATE notify_outbox SET state = 'sending', next_try = ? WHERE id = ? AND state = 'pending' RETURNING id", Date.now() + 60000, item.id).toArray();
      if (!claimed.length) continue;
      const sent = await telegramRequest(this.env, 'sendMessage', {chat_id: item.user_id, text: item.body});
      if (sent.code === 429 && Number.isFinite(sent.retryAfter)) sql.exec("UPDATE notify_outbox SET state = 'pending', next_try = ? WHERE id = ?", Date.now() + Math.min(3600, Math.max(30, sent.retryAfter)) * 1000, item.id);
      else {
        sql.exec('DELETE FROM notify_outbox WHERE id = ?', item.id);
        if (sent.code === 403 && sql.exec('SELECT revision FROM notify_revisions WHERE user_id = ?', item.user_id).toArray()[0]?.revision === active.revision) {
          sql.exec('DELETE FROM notify_subscriptions WHERE user_id = ?', item.user_id);
          sql.exec('DELETE FROM notify_outbox WHERE user_id = ?', item.user_id);
          sql.exec('DELETE FROM notify_revisions WHERE user_id = ?', item.user_id);
        }
      }
    }
    sql.exec('DELETE FROM notify_watches WHERE key NOT IN (SELECT watch_key FROM notify_subscriptions)');
  }
  async tick() {
    const sql = this.ctx.storage.sql, now = Date.now();
    sql.exec('DELETE FROM notify_revisions WHERE updated_at < ? AND user_id NOT IN (SELECT user_id FROM notify_subscriptions)', now - 30 * 86400000);
    if (!sql.exec('SELECT 1 AS present FROM notify_subscriptions LIMIT 1').toArray().length) return;
    await verifyTestBot(this.env);
    const watches = sql.exec('SELECT * FROM notify_watches WHERE next_check <= ? ORDER BY next_check LIMIT ?', now, MAX_WATCHES_PER_TICK).toArray();
    for (const watch of watches) await this.checkWatch(watch, Date.now());
    await this.drain(Date.now());
  }
}

export {tokenFor, telegramRequest};

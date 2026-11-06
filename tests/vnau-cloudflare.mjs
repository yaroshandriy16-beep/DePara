import {parseMatrix} from './matrix.mjs';
import {options, readForm, readTeacherSearch, selected} from './forms.mjs';
import api, {SourceCache} from './worker.mjs';
import {MkrSession, verifyMkrAddress} from './upstream.mjs';
import {changedDates, verifyTelegramInitData} from './notifications.mjs';

const assert = (condition, message) => {if (!condition) throw new Error(message)};
const equal = (actual, expected, message) => assert(JSON.stringify(actual) === JSON.stringify(expected), message);
async function rejects(operation, message) {
  let rejected = false;
  try {await operation()} catch {rejected = true}
  assert(rejected, message);
}

// Expose only test helpers from a local subclass; production exposes no such API.
export class CacheTestHarness extends SourceCache {
  async setSourceMode(mode) {
    this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS test_source (id INTEGER PRIMARY KEY, mode TEXT NOT NULL)');
    this.ctx.storage.sql.exec('INSERT INTO test_source VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET mode = excluded.mode', mode);
  }
  async getSourceMode() {
    return this.ctx.storage.sql.exec('SELECT mode FROM test_source WHERE id = 1').toArray()[0]?.mode || 'normal';
  }
  async get(detail) {
    if (detail.type !== 'schedule') return super.get(detail);
    this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS test_source (id INTEGER PRIMARY KEY, mode TEXT NOT NULL)');
    let mode = this.ctx.storage.sql.exec('SELECT mode FROM test_source WHERE id = 1').toArray()[0]?.mode || 'normal';
    if (mode === 'slow') {
      this.ctx.storage.sql.exec("UPDATE test_source SET mode = 'waiting' WHERE id = 1");
      await new Promise(resolve => setTimeout(resolve, 200));
      mode = 'normal';
      this.ctx.storage.sql.exec("UPDATE test_source SET mode = 'normal' WHERE id = 1");
    }
    if (mode === 'offline') return {ok: true, value: {status: 'error'}};
    const result = {status: 'success', sourceKind: detail.kind, coverageStart: detail.start, coverageEnd: detail.end,
      ...(detail.kind === 'group' ? {groupId: detail.id, groupName: detail.name} : {teacherId: detail.id, teacherName: 'Тестовий викладач'}),
      lessons: [{date: detail.start, startTime: '08:00', endTime: '09:20', subject: 'Тестовий предмет', type: 'Лк', room: mode === 'changed' ? 'ауд. 2' : 'ауд. 1', group: 'Тестова група', teacher: 'Тестовий викладач', lessonNumber: 1}]};
    return {ok: true, value: result};
  }
  async makeNotificationDue() {this.ctx.storage.sql.exec('UPDATE notify_watches SET next_check = 0')}
  async makeDeliveryDue() {this.ctx.storage.sql.exec('UPDATE notify_outbox SET next_try = 0')}
  async notificationCounts() {
    const sql = this.ctx.storage.sql;
    return {watches: sql.exec('SELECT count(*) AS n FROM notify_watches').one().n, subscriptions: sql.exec('SELECT count(*) AS n FROM notify_subscriptions').one().n, outbox: sql.exec('SELECT count(*) AS n FROM notify_outbox').one().n, revisions: sql.exec('SELECT count(*) AS n FROM notify_revisions').one().n, versions: sql.exec('SELECT version FROM notify_watches ORDER BY key').toArray().map(x => x.version)};
  }
  async verifyFreshnessRequirement() {
    const now = Date.now(), detail = {type: 'schedule', kind: 'teacher', id: '999', start: '2026-11-05', end: '2026-11-11'};
    const key = this.cacheKey(detail), old = {sourceKind: 'teacher', status: 'success', lessons: []};
    await this.save(key, old, now - 60000);
    const cached = await this.read(detail, 0);
    let refreshed = false;
    const original = this.refresh;
    this.refresh = async () => {refreshed = true; return {status: 'fresh'}};
    try {
      const fresh = await this.read(detail, now - 30000);
      return {cached: cached.status, refreshed, fresh: fresh.status};
    } finally {this.refresh = original; this.ctx.storage.sql.exec('DELETE FROM cache WHERE key = ?', key)}
  }
  async verifyLimits() {
    const sql = this.ctx.storage.sql, now = Date.now(), day = 86400000;
    sql.exec('DELETE FROM cache');
    sql.exec('INSERT INTO cache VALUES (?, ?, ?, ?)', 'recent', '{}', now, now);
    sql.exec('INSERT INTO cache VALUES (?, ?, ?, ?)', 'margin', '{}', now, now - 30.5 * day);
    sql.exec('INSERT INTO cache VALUES (?, ?, ?, ?)', 'expired', '{}', now, now - 32 * day);
    await this.alarm();
    const afterSweep = sql.exec('SELECT key FROM cache ORDER BY key').toArray().map(row => row.key);
    sql.exec('DELETE FROM cache');
    this.ctx.storage.transactionSync(() => {
      for (let index = 0; index < 512; index++) sql.exec('INSERT INTO cache VALUES (?, ?, ?, ?)', `old-${index}`, '{}', now, now - 512 + index);
    });
    await this.save('new', {ok: true}, now);
    const remaining = sql.exec('SELECT key FROM cache').toArray().map(row => row.key);
    return {afterSweep, count: remaining.length, hasNew: remaining.includes('new'), hasOldest: remaining.includes('old-0')};
  }
}

export default {
  async test(_controller, env) {
    const dates = {start: '2026-11-05', end: '2026-11-18'};
    const examples = [
      [env.GROUP_EI, 'group', '3641', 'ЕІ-23-1', 2, '97d01be6dafe50daeabd'],
      [env.GROUP_KN, 'group', '3878', 'КН-24-1', 4, '9f3d37bce0f4baae330e'],
      [env.TEACHER_BOIKO, 'teacher', '1847', 'Бойко Олексій Романович', 8, '4320898b74fabd70f2de'],
      [env.TEACHER_VOVK, 'teacher', '2264', 'Вовк Валерія Юріївна', 8, 'ce5a4f6814b5d86b2e3d']
    ];
    for (const [html, kind, ownerId, ownerLabel, count, firstId] of examples) {
      const lessons = await parseMatrix(html, {...dates, kind, ownerId, ownerLabel});
      assert(lessons.length === count, `Wrong lesson count for ${ownerId}`);
      assert(lessons[0].sourceId === firstId, `Wrong identity or parsing for ${ownerId}`);
      assert(lessons.every(item => item.date >= dates.start && item.date <= dates.end), 'Incorrect date');
    }
    const group = {kind: 'group', ownerId: '3641', ownerLabel: 'ЕІ-23-1', ...dates};
    const first = await parseMatrix(env.GROUP_EI, group);
    equal([first[0].startTime, first[0].endTime, first[0].subject, first[0].teacher, first[0].room],
      ['13:10', '14:30', 'Перехідні процеси', 'Возняк Олександр Миколайович', 'ауд. 3215'], 'Incorrect group lesson');
    assert((await parseMatrix(env.GROUP_EI, {...group, end: '2026-11-05'})).length === 1, 'Date filtering failed');
    await rejects(() => parseMatrix(env.GROUP_EI, {...group, ownerId: '3878', ownerLabel: 'КН-24-1'}), 'Another group was accepted');
    await rejects(() => parseMatrix(env.GROUP_EI.replaceAll('headcol', 'unknown'), group), 'Broken table was accepted');
    await rejects(() => parseMatrix(env.GROUP_EI, {...group, start: '2026-11-01'}), 'Incomplete date range was accepted');
    await rejects(() => parseMatrix('<html>Server unavailable</html>', group), 'Error page was accepted');

    const formHtml = `<meta name="csrf-param" content="_csrf"><meta name="csrf-token" content="synthetic-token">
      <form id="filter-form" action="/time-table/group?type=0"><select name="TimeTableForm[facultyId]">
      <option value="">Оберіть</option><option value="7" selected>Факультет &amp; інститут</option>
      </select></form>`;
    const form = await readForm(formHtml, 'group');
    equal(options(form, 'facultyId'), [{id: '7', name: 'Факультет & інститут'}], 'Catalogue options were parsed incorrectly');
    assert(selected(form, 'facultyId').id === '7' && form.fields._csrf === 'synthetic-token', 'Form selection failed');
    await rejects(() => readForm(formHtml.replace('/time-table/group?type=0', 'https://example.invalid/'), 'group'), 'Invalid form action was accepted');
    await rejects(() => readForm(formHtml.replace('name="csrf-token"', 'name="missing"'), 'group'), 'Missing CSRF was accepted');
    const goodDns = async () => Response.json({Status: 0, Answer: [{type: 1, data: '81.30.162.30', TTL: 120}]});
    assert(await verifyMkrAddress(goodDns) === 60, 'DNS verification exceeded its cache lifetime');
    await rejects(() => verifyMkrAddress(async () => Response.json({Status: 0, Answer: [{type: 1, data: '192.0.2.1', TTL: 60}]})), 'Changed source address was accepted');
    let target = '';
    const session = new MkrSession(async function(url) {assert(this === undefined, 'Fetch was invoked with a session receiver'); target = url; return new Response(formHtml, {headers: {'content-type': 'text/html'}})});
    await session.request('/time-table/group', {query: {type: '0'}});
    assert(new URL(target).hostname === '81.30.162.30.sslip.io', 'Source transport was not pinned to the university IP');
    await rejects(() => session.request('https://example.invalid/'), 'Unexpected source URL was accepted');

    const search = `<form action="/site/search-teacher"></form><table><tr><th>Викладач</th></tr>
      <tr><td>1</td><td>Іваненко Іван</td><td>Кафедра А</td><td><a href="/time-table/teacher?id=1847">Вибрати</a></td></tr>
      <tr><td>2</td><td>Іваненко Іван</td><td>Кафедра Б</td><td><a href="/time-table/teacher?id=1848">Вибрати</a></td></tr></table>`;
    equal((await readTeacherSearch(search)).map(item => item.id), ['1847', '1848'], 'Namesakes were combined');
    await rejects(() => readTeacherSearch(search.replace('id=1847', 'id=bad')), 'Invalid teacher ID was accepted');
    await rejects(() => readTeacherSearch(search.replace('/site/search-teacher', '/unknown')), 'Invalid search form was accepted');

    const limits = await env.CACHE.getByName('limits').verifyLimits();
    equal(limits.afterSweep, ['margin', 'recent'], 'Cache expiry did not respect usage-sampling margin');
    assert(limits.count === 512 && limits.hasNew && !limits.hasOldest, 'Shared cache entry limit was not enforced');
    const freshness = await env.CACHE.getByName('freshness').verifyFreshnessRequirement();
    equal(freshness, {cached: 'success', refreshed: true, fresh: 'fresh'}, 'A fresh subscription reused an older cached snapshot');
  }
};

async function signedInitData(token, userId, authDate = Math.floor(Date.now() / 1000)) {
  const p = new URLSearchParams({auth_date: String(authDate), user: JSON.stringify({id: userId, first_name: 'Тест'})});
  const check = [...p.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, value]) => `${key}=${value}`).join('\n');
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode('WebAppData'), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  const secret = await crypto.subtle.sign('HMAC', key, enc.encode(token));
  const signer = await crypto.subtle.importKey('raw', secret, {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', signer, enc.encode(check));
  p.set('hash', Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join(''));
  return p.toString();
}

export const notifications = {
  async test(_controller, env) {
    const token = env.TELEGRAM_TEST_BOT_TOKEN, good = await signedInitData(token, 42), second = await signedInitData(token, 43);
    const independent = 'auth_date=1793923200&query_id=TEST_QUERY&user=%7B%22id%22%3A42%2C%22first_name%22%3A%22%D0%9E%D0%BB%D0%B5%D0%BD%D0%B0%22%7D&hash=495dd181e4ee386e0d9e7e1eae28e04ceb90e13442f329616d58b727fb21637c';
    assert(await verifyTelegramInitData(independent, token, 1793923205000) === '42', 'Independent HMAC fixture was rejected');
    assert(await verifyTelegramInitData(good, token) === '42', 'Valid Telegram signature rejected');
    await rejects(() => verifyTelegramInitData(good.replace('42', '43'), token), 'Tampered Telegram identity accepted');
    await rejects(async () => verifyTelegramInitData(await signedInitData(token, 42, Math.floor(Date.now() / 1000) - 90000), token), 'Expired Telegram data accepted');
    await rejects(() => verifyTelegramInitData(`${good}&auth_date=1`, token), 'Duplicate signed field accepted');
    await rejects(() => verifyTelegramInitData(good, '123456:another_synthetic_token_abcdefghijklmnopqrstuvwxyz'), 'Signature from a different bot was accepted');
    const previous = {start: '2026-11-05', end: '2026-11-18', lessons: [['2026-11-05', '08:00', '09:20', 'Предмет', 'Лк', '101', 'Група', 'Викладач', 1]]};
    const rolled = {start: '2026-11-06', end: '2026-11-19', lessons: [['2026-11-19', '08:00', '09:20', 'Новий день', 'Лк', '101', 'Група', 'Викладач', 1]]};
    equal(changedDates(previous, rolled), [], 'Rolling date window generated a fake change');
    const changed = structuredClone(previous); changed.lessons[0][5] = '102';
    equal(changedDates(previous, changed), ['2026-11-05'], 'Room change was not detected');

    await env.TEST_TELEGRAM.fetch('https://mock.test/__reset');
    const cache = env.MKR_CACHE.getByName('vnau-shared-cache'), store = env.MKR_CACHE.getByName('vnau-notifications');
    await cache.setSourceMode('normal');
    const call = async (action, initData = good, identity) => {
      const body = JSON.stringify({initData, ...(identity ? {identity} : {})});
      const response = await api.fetch(new Request(`https://example.test/api/notifications/${action}`, {method: 'POST', headers: {'Content-Type': 'application/json', Origin: 'https://yaroshandriy16-beep.github.io'}, body}), env);
      return {status: response.status, data: await response.json()};
    };
    const preflight = await api.fetch(new Request('https://example.test/api/notifications/status', {method: 'OPTIONS', headers: {Origin: 'https://yaroshandriy16-beep.github.io'}}), env);
    assert(preflight.status === 204 && preflight.headers.get('Access-Control-Allow-Origin') === 'https://yaroshandriy16-beep.github.io' && preflight.headers.get('Access-Control-Allow-Headers') === 'Content-Type', 'Notification CORS preflight failed');
    const blocked = await api.fetch(new Request('https://example.test/api/notifications/status', {method: 'POST', headers: {Origin: 'https://example.invalid', 'Content-Type': 'application/json'}, body: JSON.stringify({initData: good})}), env);
    assert(blocked.status === 403, 'Untrusted origin was accepted');
    const unconfigured = await api.fetch(new Request('https://example.test/api/notifications/status', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({initData: good})}), {MKR_CACHE: env.MKR_CACHE});
    assert(unconfigured.status === 503, 'Missing bot token was presented as configured');
    const runScheduled = async () => {
      let scheduled;
      api.scheduled({cron: '*/15 * * * *'}, env, {waitUntil(promise) {scheduled = promise}});
      assert(scheduled, 'Background check was not attached to the scheduled invocation');
      await scheduled;
    };
    const messages = async () => (await (await env.TEST_TELEGRAM.fetch('https://mock.test/__state')).json()).messages;
    const identity = {kind: 'group', id: '3641', facultyId: '7', course: '4', name: 'ЕІ-23-1'};
    let result = await call('status'); assert(result.status === 200 && !result.data.enabled, 'Unexpected initial subscription');
    result = await call('enable', good, identity); assert(result.status === 200 && result.data.enabled && result.data.identity.id === '3641', 'Subscription failed');
    assert((await messages()).length === 0, 'First snapshot caused a change notification');
    result = await call('test'); assert(result.status === 200 && result.data.sent, 'Explicit test message failed');
    result = await call('test'); assert(result.status === 429 && (await messages()).length === 1, 'Test message rate limit failed');
    await cache.setSourceMode('offline'); await store.makeNotificationDue(); await runScheduled();
    equal((await store.notificationCounts()).versions, [1], 'Unavailable source replaced the confirmed baseline');
    assert((await messages()).length === 1, 'Unavailable source generated a notification');
    await env.TEST_TELEGRAM.fetch('https://mock.test/__next-send?status=429');
    await cache.setSourceMode('changed'); await store.makeNotificationDue(); await runScheduled();
    assert((await messages()).length === 1 && (await store.notificationCounts()).outbox === 1, 'Telegram rate limit did not retain the notification');
    await store.makeDeliveryDue(); await store.checkNotifications();
    assert((await messages()).length === 2, 'A confirmed change was not delivered after rate limiting');
    assert((await messages())[1].text.includes('ауд. 1') && (await messages())[1].text.includes('ауд. 2'), 'Notification did not explain the room change');
    await store.makeNotificationDue(); await store.checkNotifications();
    assert((await messages()).length === 2, 'The same change was notified twice');
    result = await call('status', second); assert(result.status === 200 && !result.data.enabled, 'Another user accessed a subscription');
    result = await call('enable', second, identity); assert(result.status === 200 && result.data.enabled && result.data.pending, 'A new subscriber skipped the first shared baseline');
    await cache.setSourceMode('normal'); await store.makeNotificationDue(); await store.checkNotifications();
    assert((await messages()).length === 3 && String((await messages())[2].chat_id) === '42', 'New subscriber received changes from before the initial check');
    result = await call('status', second); assert(result.data.enabled && !result.data.pending, 'Subscriber did not become active after a shared check');
    await env.TEST_TELEGRAM.fetch('https://mock.test/__send-delay?ms=200');
    await cache.setSourceMode('changed'); await store.makeNotificationDue();
    const firstTick = runScheduled();
    let sending = false;
    for (let i = 0; i < 100 && !sending; i++) {
      sending = (await (await env.TEST_TELEGRAM.fetch('https://mock.test/__state')).json()).activeSends > 0;
      if (!sending) await new Promise(resolve => setTimeout(resolve, 5));
    }
    assert(sending, 'Concurrent delivery test did not reach Telegram');
    const secondTick = runScheduled();
    await Promise.all([firstTick, secondTick]);
    await env.TEST_TELEGRAM.fetch('https://mock.test/__send-delay?ms=0');
    assert((await messages()).length === 5, 'A later confirmed change was not delivered to both subscribers');
    equal((await messages()).slice(-2).map(item => String(item.chat_id)).sort(), ['42', '43'], 'Concurrent checks duplicated a delivery');
    result = await call('disable'); assert(result.status === 200 && !result.data.enabled, 'Unsubscribe failed');
    result = await call('status', second); assert(result.data.enabled, 'One user disabled another user’s subscription');
    result = await call('disable', second); assert(result.status === 200 && !result.data.enabled, 'Second unsubscribe failed');
    equal(await store.notificationCounts(), {watches: 0, subscriptions: 0, outbox: 0, revisions: 0, versions: []}, 'Unsubscribe retained private data');
    await cache.setSourceMode('slow');
    const enabling = call('enable', good, identity);
    let waiting = false;
    for (let i = 0; i < 100 && !waiting; i++) {waiting = await cache.getSourceMode() === 'waiting'; if (!waiting) await new Promise(resolve => setTimeout(resolve, 5))}
    assert(waiting, 'Concurrent subscription test did not reach the source');
    result = await call('disable'); assert(result.status === 200, 'Concurrent opt-out failed');
    result = await enabling; assert(result.status === 409, 'An in-flight opt-in overrode a later opt-out');
    equal(await store.notificationCounts(), {watches: 0, subscriptions: 0, outbox: 0, revisions: 0, versions: []}, 'Concurrent opt-out retained private data');
    await cache.setSourceMode('normal');
    result = await call('enable', good, identity); assert(result.status === 200, 'Repeat subscription failed');
    await env.TEST_TELEGRAM.fetch('https://mock.test/__next-send?status=403');
    await cache.setSourceMode('changed'); await store.makeNotificationDue(); await runScheduled();
    result = await call('status'); assert(!result.data.enabled, 'Blocked bot retained a subscription');
    equal(await store.notificationCounts(), {watches: 0, subscriptions: 0, outbox: 0, revisions: 0, versions: []}, 'Blocked user retained private data');
    await env.TEST_TELEGRAM.fetch('https://mock.test/__bot?name=MainBot');
    result = await call('enable', second, identity); assert(result.status === 503, 'A different bot token was accepted');
    result = await call('status', good.replace('42', '43')); assert(result.status === 401, 'Forged Telegram data was accepted');
  }
};

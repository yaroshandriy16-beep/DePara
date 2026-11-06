import {parseMatrix} from './matrix.mjs';
import {options, readForm, readTeacherSearch, selected} from './forms.mjs';
import {SourceCache} from './worker.mjs';

const assert = (condition, message) => {if (!condition) throw new Error(message)};
const equal = (actual, expected, message) => assert(JSON.stringify(actual) === JSON.stringify(expected), message);
async function rejects(operation, message) {
  let rejected = false;
  try {await operation()} catch {rejected = true}
  assert(rejected, message);
}

// Expose only test helpers from a local subclass; production exposes no such API.
export class CacheTestHarness extends SourceCache {
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

    const search = `<form action="/site/search-teacher"></form><table><tr><th>Викладач</th></tr>
      <tr><td>1</td><td>Іваненко Іван</td><td>Кафедра А</td><td><a href="/time-table/teacher?id=1847">Вибрати</a></td></tr>
      <tr><td>2</td><td>Іваненко Іван</td><td>Кафедра Б</td><td><a href="/time-table/teacher?id=1848">Вибрати</a></td></tr></table>`;
    equal((await readTeacherSearch(search)).map(item => item.id), ['1847', '1848'], 'Namesakes were combined');
    await rejects(() => readTeacherSearch(search.replace('id=1847', 'id=bad')), 'Invalid teacher ID was accepted');
    await rejects(() => readTeacherSearch(search.replace('/site/search-teacher', '/unknown')), 'Invalid search form was accepted');

    const limits = await env.CACHE.getByName('limits').verifyLimits();
    equal(limits.afterSweep, ['margin', 'recent'], 'Cache expiry did not respect usage-sampling margin');
    assert(limits.count === 512 && limits.hasNew && !limits.hasOldest, 'Shared cache entry limit was not enforced');
  }
};

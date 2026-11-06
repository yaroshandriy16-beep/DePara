/** Bounded public MKR client. Cookies and CSRF never leave this module. */
import {parseMatrix, SourceError} from './matrix.mjs';
import {readForm, options, selected, readTeacherSearch} from './forms.mjs';

const BASE = 'http://mkr.vsau.org';
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const ID = /^\d{1,12}$/;
const normalized = value => String(value).replace(/\s+/g, ' ').trim().toLocaleLowerCase('uk');
const uiDate = value => `${value.slice(8, 10)}.${value.slice(5, 7)}.${value.slice(0, 4)}`;

async function readBounded(response) {
  const declared = Number(response.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > MAX_HTML_BYTES) throw new SourceError('Source response too large');
  if (!response.body) throw new SourceError('Empty source response');
  const reader = response.body.getReader(), chunks = [];
  let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_HTML_BYTES) {await reader.cancel(); throw new SourceError('Source response too large')}
      chunks.push(value);
    }
  } finally {reader.releaseLock()}
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {bytes.set(chunk, offset); offset += chunk.byteLength}
  try {return new TextDecoder('utf-8', {fatal: true}).decode(bytes)} catch {throw new SourceError('Invalid source encoding')}
}

export class MkrSession {
  constructor(fetcher = fetch) {this.fetcher = fetcher; this.cookies = new Map()}
  async request(path, {query = {}, data = null, xhr = false} = {}) {
    const url = new URL(path, BASE);
    if (url.origin !== BASE || !['/time-table/group', '/time-table/teacher', '/site/search-teacher'].includes(url.pathname)) throw new SourceError('Invalid source address');
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    const headers = new Headers({'Accept': 'text/html', 'User-Agent': 'DeParaVNAU/1.0 (public schedule; low-volume)'});
    if (this.cookies.size) headers.set('Cookie', [...this.cookies].map(([key, value]) => `${key}=${value}`).join('; '));
    if (xhr) headers.set('X-Requested-With', 'XMLHttpRequest');
    let body;
    if (data !== null) {
      headers.set('Content-Type', 'application/x-www-form-urlencoded');
      headers.set('Referer', `${BASE}${url.pathname}?type=0`);
      body = new URLSearchParams(data).toString();
    }
    let response;
    try {response = await this.fetcher(url.href, {method: data === null ? 'GET' : 'POST', headers, body, redirect: 'manual', signal: AbortSignal.timeout(25000)})}
    catch {throw new SourceError('Source request failed')}
    if (!response.ok || response.status >= 300 || !String(response.headers.get('Content-Type') || '').toLowerCase().includes('text/html')) throw new SourceError('Unexpected source response');
    for (const raw of response.headers.getSetCookie()) {
      const [pair, ...attributes] = raw.split(';'), divider = pair.indexOf('=');
      if (divider < 1) continue;
      const key = pair.slice(0, divider).trim(), value = pair.slice(divider + 1).trim();
      if (!/^[!#$%&'*+.^_`|~\w-]{1,128}$/.test(key) || /[\r\n;]/.test(value) || value.length > 4096) throw new SourceError('Invalid source session');
      if (attributes.some(x => /^\s*max-age\s*=\s*0\s*$/i.test(x)) || !value) this.cookies.delete(key);
      else this.cookies.set(key, value);
    }
    return readBounded(response);
  }
}

async function groupStart(session) {
  const form = await readForm(await session.request('/time-table/group', {query: {type: '0'}}), 'group');
  if (selected(form, 'structureId')?.id !== '0') throw new SourceError('Unconfirmed university structure');
  return form;
}
async function selectFaculty(session, form, facultyId) {
  if (!ID.test(facultyId) || !options(form, 'facultyId').some(x => x.id === facultyId)) throw new SourceError('Unconfirmed faculty');
  const data = {...form.fields, 'TimeTableForm[structureId]': '0', 'TimeTableForm[facultyId]': facultyId, 'TimeTableForm[course]': '', 'TimeTableForm[groupId]': ''};
  const next = await readForm(await session.request('/time-table/group', {query: {type: '0'}, data, xhr: true}), 'group');
  if (selected(next, 'facultyId')?.id !== facultyId) throw new SourceError('Mismatched faculty');
  return next;
}

export async function faculties(session) {
  const values = options(await groupStart(session), 'facultyId');
  if (!values.length) throw new SourceError('Empty faculty catalogue');
  return values;
}
export async function courses(session, facultyId) {
  return options(await selectFaculty(session, await groupStart(session), facultyId), 'course');
}
export async function groups(session, facultyId, course) {
  if (!/^[1-7]$/.test(course)) throw new SourceError('Invalid course');
  const form = await selectFaculty(session, await groupStart(session), facultyId);
  if (!options(form, 'course').some(x => x.id === course)) throw new SourceError('Unconfirmed course');
  const data = {...form.fields, 'TimeTableForm[structureId]': '0', 'TimeTableForm[facultyId]': facultyId, 'TimeTableForm[course]': course, 'TimeTableForm[groupId]': ''};
  const next = await readForm(await session.request('/time-table/group', {query: {type: '0'}, data, xhr: true}), 'group');
  if (selected(next, 'facultyId')?.id !== facultyId || selected(next, 'course')?.id !== course) throw new SourceError('Mismatched course');
  return options(next, 'groupId');
}
export async function teachers(session, query) {
  if (typeof query !== 'string' || query.trim().length < 2 || query.trim().length > 80 || /[\x00-\x1f]/.test(query)) throw new SourceError('Invalid teacher query');
  return readTeacherSearch(await session.request('/site/search-teacher', {query: {type: 'time-table', 'SearchTeachersForm[search]': query.trim()}}));
}

function dates(form, start, end) {
  return {...form.fields, 'TimeTableForm[dateStart]': uiDate(start), 'TimeTableForm[dateEnd]': uiDate(end),
    'TimeTableForm[indicationDays]': form.fields['TimeTableForm[indicationDays]'] || '5', 'date-picker': `${uiDate(start)} - ${uiDate(end)}`};
}
export async function groupSchedule(session, identity, start, end) {
  const {id, facultyId, course, name} = identity;
  if (!ID.test(id) || !ID.test(facultyId) || !/^[1-7]$/.test(course) || !name.trim() || name.length > 120 || /[\x00-\x1f]/.test(name)) throw new SourceError('Invalid group');
  const form = await groupStart(session);
  const data = {...dates(form, start, end), 'TimeTableForm[structureId]': '0', 'TimeTableForm[facultyId]': facultyId, 'TimeTableForm[course]': course, 'TimeTableForm[groupId]': id};
  const html = await session.request('/time-table/group', {query: {type: '0'}, data});
  const returned = selected(await readForm(html, 'group'), 'groupId');
  if (returned?.id !== id || normalized(returned.name) !== normalized(name)) throw new SourceError('Mismatched group identity');
  return {name, lessons: await parseMatrix(html, {kind: 'group', ownerId: id, ownerLabel: name, start, end})};
}
export async function teacherSchedule(session, identity, start, end) {
  const {id} = identity;
  if (!ID.test(id)) throw new SourceError('Invalid teacher');
  const initial = await readForm(await session.request('/time-table/teacher', {query: {id}}), 'teacher');
  const chosen = selected(initial, 'teacherId');
  if (chosen?.id !== id || !chosen.name) throw new SourceError('Unconfirmed teacher');
  const data = {...dates(initial, start, end), 'TimeTableForm[teacherId]': id};
  // The source form posts to ?type=0; posting to ?id resets the dates.
  const html = await session.request('/time-table/teacher', {query: {type: '0'}, data});
  const returned = selected(await readForm(html, 'teacher'), 'teacherId');
  if (returned?.id !== id || returned.name !== chosen.name) throw new SourceError('Mismatched teacher identity');
  return {name: chosen.name, lessons: await parseMatrix(html, {kind: 'teacher', ownerId: id, ownerLabel: chosen.name, start, end})};
}

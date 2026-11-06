class SourceError extends Error {}

const ENTITIES = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', deg: '°', copy: '©', reg: '®'};
function decodeEntities(text) {
  return String(text).replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);?/gi, (matched, token) => {
    if (token[0] === '#') {
      const value = token[1].toLowerCase() === 'x' ? parseInt(token.slice(2), 16) : parseInt(token.slice(1), 10);
      if (!Number.isInteger(value) || value <= 0 || value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) throw new SourceError('Invalid HTML entity');
      return String.fromCodePoint(value);
    }
    if (!Object.hasOwn(ENTITIES, token)) {
      if (!matched.endsWith(';')) return matched;
      throw new SourceError('Unrecognized HTML entity');
    }
    return ENTITIES[token];
  });
}

function calendarDate(value) {
  const match = String(value).match(/\b(\d{4}-\d{2}-\d{2}|\d{1,2}\.\d{1,2}\.\d{4})\b/);
  if (!match) return null;
  const raw = match[1];
  const parts = raw.includes('.') ? raw.split('.').reverse() : raw.split('-');
  const [year, month, day] = parts.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function time(value) {
  const match = String(value).match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : null;
}

async function popupParts(events) {
  // Parse all known popup fragments in one streaming pass. Unexpected markup
  // is rejected so that a changed source cannot look like an empty schedule.
  const fragments = events.map(({event}, index) => {
    const fragment = decodeEntities(event.fragment);
    if (/<\s*\/?\s*(?!br\b)[a-z][^>]*>/i.test(fragment)) throw new SourceError('Unexpected popup markup');
    return `<section data-vnau-popup="${index}">${fragment}</section>`;
  });
  if (!fragments.length) return [];
  const pieces = events.map(() => []);
  let current = null;
  const parser = new HTMLRewriter()
    .on('section[data-vnau-popup]', {
      element(element) {
        current = Number(element.getAttribute('data-vnau-popup'));
        if (!Number.isInteger(current) || current < 0 || current >= pieces.length) throw new SourceError('Invalid popup index');
        element.onEndTag(() => {current = null});
      },
      text(chunk) {if (current !== null) pieces[current].push(chunk.text)}
    })
    .on('section[data-vnau-popup] br', {element() {if (current !== null) pieces[current].push('\n')}});
  await parser.transform(new Response(fragments.join(''))).text();
  return pieces.map(p => decodeEntities(p.join('')).split('\n').map(x => x.trim()).filter(Boolean));
}

async function hash(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 20);
}

export async function parseMatrix(html, {kind, ownerId, ownerLabel, start, end}) {
  if (!['group', 'teacher'].includes(kind) || !/^\d+$/.test(ownerId) || !ownerLabel.trim() || calendarDate(start) !== start || calendarDate(end) !== end || start > end) throw new SourceError('Invalid identity or interval');
  const startMs = Date.parse(`${start}T00:00:00Z`), endMs = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || (endMs - startMs) / 86400000 > 31) throw new SourceError('Invalid interval');
  let insideTable = false, tableCount = 0, row = null, cell = null, activeHeader = null, item = null, updated = false;
  const rows = [];
  const rewriter = new HTMLRewriter()
    .on('table', {element(element) {
      if (insideTable) throw new SourceError('Unexpected nested table');
      const classes = (element.getAttribute('class') || '').split(/\s+/);
      if (element.getAttribute('id') !== 'timeTable' && !classes.includes('lesson-color-block')) return;
      tableCount++;
      insideTable = true;
      element.onEndTag(() => {insideTable = false});
    }})
    .on('tr', {element(element) {
      if (!insideTable) return;
      if (row) throw new SourceError('Unexpected nested row');
      row = {dayHeader: false, headers: [], isLesson: false, number: '', start: '', end: '', cells: []};
      const current = row;
      element.onEndTag(() => {rows.push(current); row = null});
    }})
    .on('th.headday', {element() {if (insideTable && row) row.dayHeader = true}})
    .on('th.headdate', {
      element(element) {
        if (!insideTable || !row) return;
        activeHeader = {text: ''}; row.headers.push(activeHeader);
        element.onEndTag(() => {activeHeader = null});
      },
      text(chunk) {if (insideTable && activeHeader) activeHeader.text += chunk.text}
    })
    .on('th.headcol', {element() {if (insideTable && row) row.isLesson = true}})
    .on('th.headcol .lesson', {text(chunk) {if (insideTable && row) row.number += chunk.text}})
    .on('th.headcol .start', {text(chunk) {if (insideTable && row) row.start += chunk.text}})
    .on('th.headcol .end', {text(chunk) {if (insideTable && row) row.end += chunk.text}})
    .on('td', {element(element) {
      if (!insideTable || !row) return;
      if (cell) throw new SourceError('Unexpected nested cell');
      cell = {closed: (element.getAttribute('class') || '').split(/\s+/).includes('closed'), hasCell: false, text: '', items: []};
      row.cells.push(cell);
      element.onEndTag(() => {cell = null});
    }})
    .on('td .cell', {
      element() {if (insideTable && cell) cell.hasCell = true},
      text(chunk) {if (insideTable && cell) cell.text += chunk.text}
    })
    .on('td .lesson-updated', {element(element) {
      if (!insideTable || !cell) return;
      updated = true;
      element.onEndTag(() => {updated = false});
    }})
    .on('td [data-content]', {
      element(element) {
        if (!insideTable || !cell) return;
        item = {fragment: element.getAttribute('data-content') || '', title: element.getAttribute('title') || '', short: '', seenChild: false, updated};
        cell.items.push(item);
        element.onEndTag(() => {item = null});
      },
      text(chunk) {if (insideTable && item && !item.seenChild) item.short += chunk.text}
    })
    .on('td [data-content] > *', {element() {if (insideTable && item) item.seenChild = true}});
  await rewriter.transform(new Response(html)).text();
  if (tableCount !== 1) throw new SourceError('Unrecognized matrix');
  let headers = [], headerCount = 0, lessonRows = 0;
  const covered = new Set(), eventRows = [];
  for (const r of rows) {
    if (r.dayHeader) {
      headers = r.headers.map(x => calendarDate(x.text));
      if (!headers.length || headers.some(x => !x) || new Set(headers).size !== headers.length) throw new SourceError('Invalid header dates');
      headerCount++;
      continue;
    }
    if (!r.isLesson) continue;
    lessonRows++;
    const number = r.number.match(/\b\d{1,2}\b/);
    const starts = time(r.start), ends = time(r.end);
    if (!headers.length || !number || Number(number[0]) < 1 || Number(number[0]) > 100 || !starts || !ends || starts >= ends || r.cells.length !== headers.length) throw new SourceError('Invalid lesson row');
    for (let i = 0; i < headers.length; i++) {
      const day = headers[i], c = r.cells[i];
      if (day < start || day > end) continue;
      if (c.closed || !c.hasCell) throw new SourceError('Unconfirmed day');
      covered.add(day);
      if (!c.items.length && decodeEntities(c.text).replace(/\u00a0/g, ' ').trim()) throw new SourceError('Unknown cell content');
      for (const event of c.items) {
        if (eventRows.length >= 5000) throw new SourceError('Too many lessons');
        eventRows.push({event, day, number: Number(number[0]), starts, ends});
      }
    }
  }
  if (!headerCount || !lessonRows) throw new SourceError('No timetable rows');
  const wanted = [];
  for (let d = startMs; d <= endMs; d += 86400000) wanted.push(new Date(d).toISOString().slice(0, 10));
  if (covered.size !== wanted.length || wanted.some(day => !covered.has(day))) throw new SourceError('Incomplete calendar');
  const result = [], duplicates = new Map();
  const allParts = await popupParts(eventRows);
  const pending = [];
  for (let eventIndex = 0; eventIndex < eventRows.length; eventIndex++) {
    const {event, day, number, starts, ends} = eventRows[eventIndex];
    const parts = allParts[eventIndex];
    if (parts.length < (kind === 'teacher' ? 4 : 5)) throw new SourceError('Incomplete event');
    const typeMatch = parts[0].match(/\s*\[([^\[\]]+)\]\s*$/);
    const subject = typeMatch ? parts[0].slice(0, typeMatch.index).trim() : '';
    const room = parts[1], group = parts[2], teacher = kind === 'teacher' ? ownerLabel : parts[3];
    const added = parts[kind === 'teacher' ? 3 : 4];
    const addedDate = added && added.toLowerCase().includes('додано') ? calendarDate(added) : null;
    if (!subject || !typeMatch || !room || !group || !teacher || !addedDate || [subject, typeMatch[1], room, group, teacher, event.short].some(value => value.length > 1024)) throw new SourceError('Invalid event data');
    if (kind === 'group') {
      const escaped = ownerLabel.replace(/\s+/g, ' ').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (!(new RegExp(`(?:^|[,;]\\s*)${escaped}(?=$|[/\\s(,;])`, 'iu')).test(group.replace(/\s+/g, ' ').trim())) throw new SourceError('Mismatched group');
    }
    const titleDate = calendarDate(event.title);
    if (titleDate && titleDate !== day) throw new SourceError('Mismatched event date');
    const type = typeMatch[1].trim();
    const resultItem = {date: day, lessonNumber: number, startTime: starts, endTime: ends, subject, shortSubject: decodeEntities(event.short).trim() || null, type, room, group, teacher, addedDate, updatedIndicator: event.updated};
    resultItem[kind === 'group' ? 'academicGroupId' : 'teacherId'] = ownerId;
    if (kind === 'group' && group !== ownerLabel) resultItem.subgroup = group;
    const fingerprint = [kind, ownerId, day, String(number), starts, ends, subject, type, room, group, teacher].join('|');
    pending.push({resultItem, digest: hash(fingerprint)});
  }
  const digests = await Promise.all(pending.map(x => x.digest));
  for (let index = 0; index < pending.length; index++) {
    const base = digests[index], duplicate = duplicates.get(base) || 0;
    duplicates.set(base, duplicate + 1);
    pending[index].resultItem.sourceId = duplicate ? `${base}-${duplicate}` : base;
    result.push(pending[index].resultItem);
  }
  return result.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.sourceId.localeCompare(b.sourceId));
}

export {SourceError, decodeEntities};

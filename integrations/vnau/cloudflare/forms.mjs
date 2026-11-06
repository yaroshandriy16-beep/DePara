/** Parse the public MKR forms in the Workers runtime without exposing sessions. */
import {SourceError, decodeEntities} from './matrix.mjs';

const BASE = 'http://mkr.vsau.org';
const ID = /^\d{1,12}$/;
const normalize = value => decodeEntities(value).replace(/\s+/g, ' ').trim();
const attr = (element, name) => {
  const value = element.getAttribute(name);
  return value === null ? null : decodeEntities(value);
};

function addText(target, chunk) {
  target.pending += chunk.text;
  if (chunk.lastInTextNode) {
    if (target.pending.trim()) target.textNodes.push(target.pending.trim());
    target.pending = '';
  }
}
const content = item => normalize([...item.textNodes, item.pending].filter(Boolean).join(' '));

/** Extract fields from the same response that supplied the session cookies. */
export async function readForm(html, kind) {
  if (!['group', 'teacher'].includes(kind)) throw new SourceError('Invalid form type');
  const result = {fields: Object.create(null), selects: Object.create(null), csrfParam: null, csrfToken: null, action: null};
  let inForm = false, formCount = 0, currentSelect = null, currentOption = null;
  const parser = new HTMLRewriter()
    .on('meta[name="csrf-param"]', {element(e) {result.csrfParam = attr(e, 'content')}})
    .on('meta[name="csrf-token"]', {element(e) {result.csrfToken = attr(e, 'content')}})
    .on('form#filter-form', {element(e) {
      if (inForm) throw new SourceError('Nested filter forms');
      inForm = true; formCount++;
      result.action = attr(e, 'action');
      e.onEndTag(() => {inForm = false});
    }})
    .on('form#filter-form input[name]', {element(e) {
      if (!inForm) return;
      const name = attr(e, 'name'), type = (attr(e, 'type') || 'text').toLowerCase();
      if (!name || name.length > 200 || ['submit', 'button', 'file', 'reset', 'password'].includes(type)) return;
      if (['checkbox', 'radio'].includes(type) && e.getAttribute('checked') === null) return;
      const value = attr(e, 'value') || '';
      if (value.length > 4096) throw new SourceError('Form field too large');
      result.fields[name] = value;
    }})
    .on('form#filter-form select[name]', {element(e) {
      if (!inForm) return;
      const name = attr(e, 'name');
      if (!name || name.length > 200 || currentSelect || result.selects[name]) throw new SourceError('Unexpected select');
      currentSelect = {name, options: []};
      const select = currentSelect;
      result.selects[name] = select;
      e.onEndTag(() => {
        const selected = select.options.find(x => x.selected) || select.options[0];
        result.fields[name] = selected?.id || '';
        currentSelect = null;
      });
    }})
    .on('form#filter-form select[name] option', {
      element(e) {
        if (!inForm || !currentSelect) return;
        if (currentOption || currentSelect.options.length >= 2000) throw new SourceError('Unexpected option');
        currentOption = {id: attr(e, 'value') || '', selected: e.getAttribute('selected') !== null, textNodes: [], pending: ''};
        const option = currentOption, select = currentSelect;
        e.onEndTag(() => {option.name = content(option); select.options.push(option); currentOption = null});
      },
      text(chunk) {if (currentOption) addText(currentOption, chunk)}
    });
  await parser.transform(new Response(html)).text();
  if (formCount !== 1 || inForm || !result.action) throw new SourceError('Unrecognized form');
  const action = new URL(result.action, BASE);
  if (action.origin !== BASE || action.pathname !== `/time-table/${kind}` || action.searchParams.get('type') !== '0') throw new SourceError('Unexpected form action');
  if (result.csrfParam && result.csrfToken) result.fields[result.csrfParam] = result.csrfToken;
  else {
    const name = Object.keys(result.fields).find(key => /csrf/i.test(key));
    if (!name || !result.fields[name]) throw new SourceError('Missing CSRF field');
  }
  return result;
}

/** Validate the catalogue entries instead of accepting invented or duplicate IDs. */
export function options(form, field) {
  const name = `TimeTableForm[${field}]`, select = form.selects[name];
  if (!select) throw new SourceError('Missing public catalogue');
  const seen = new Set(), values = [];
  for (const option of select.options) {
    if (!option.id) continue;
    if (!ID.test(option.id) || !option.name || option.name.length > 200 || seen.has(option.id)) throw new SourceError('Invalid public catalogue');
    seen.add(option.id);
    values.push({id: option.id, name: option.name});
  }
  return values;
}

export function selected(form, field) {
  const select = form.selects[`TimeTableForm[${field}]`];
  return select?.options.find(x => x.selected) || null;
}

/** Match teacher search rows by stable ID, keeping identical names separate. */
export async function readTeacherSearch(html) {
  let formCount = 0, tableDepth = 0, row = null, cell = null;
  const rows = [];
  const parser = new HTMLRewriter()
    .on('form[action="/site/search-teacher"]', {element() {formCount++}})
    .on('table', {element(e) {
      tableDepth++;
      e.onEndTag(() => {tableDepth--});
    }})
    .on('table tr', {element(e) {
      if (tableDepth !== 1 || row) throw new SourceError('Unexpected search table');
      row = {cells: [], links: []};
      const current = row;
      e.onEndTag(() => {rows.push(current); row = null});
    }})
    .on('table tr td', {
      element(e) {
        if (!row || cell) throw new SourceError('Unexpected search cell');
        cell = {textNodes: [], pending: ''};
        row.cells.push(cell);
        e.onEndTag(() => {cell = null});
      },
      text(chunk) {if (cell) addText(cell, chunk)}
    })
    .on('table tr td a[href]', {element(e) {
      if (!row) return;
      const href = attr(e, 'href') || '';
      let url;
      try {url = new URL(href, BASE)} catch {throw new SourceError('Invalid search link')}
      if (url.pathname === '/time-table/teacher') {
        if (url.origin !== BASE) throw new SourceError('Unexpected search origin');
        row.links.push(url.searchParams.get('id') || '');
      }
    }});
  await parser.transform(new Response(html)).text();
  if (formCount !== 1 || tableDepth !== 0) throw new SourceError('Unrecognized teacher search');
  const results = [], seen = new Set();
  for (const item of rows) {
    if (!item.cells.length) continue;
    const id = item.links[0], name = item.cells[1] && content(item.cells[1]), chair = item.cells[2] && content(item.cells[2]);
    if (item.cells.length < 3 || item.links.length !== 1 || !ID.test(id || '') || !name || name.length > 200 || typeof chair !== 'string' || chair.length > 200) throw new SourceError('Invalid teacher search result');
    if (!seen.has(id)) {seen.add(id); results.push({id, name, chair})}
  }
  if (results.length >= 200) throw new SourceError('Забагато результатів. Уточніть прізвище або введіть повне ПІБ.');
  return results;
}

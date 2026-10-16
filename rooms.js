
(()=>{
'use strict';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;',
  '"':'&quot;', "'":'&#39;'
}[c]));

let snapshot = null;
let index = null;
let loadError = '';
let requestId = 0;

const valid = j =>
  j &&
  /^\d{4}-\d{2}-\d{2}$/.test(j.date || '') &&
  Number.isInteger(Number(j.startPair)) &&
  Array.isArray(j.rooms) &&
  j.rooms.every(r =>
    r &&
    typeof r.name === 'string' &&
    typeof r.available === 'boolean'
  );

function formatTime(t) {
  if (!t) return 'невідомо';
  const d = new Date(t);
  return Number.isNaN(d.getTime())
    ? 'невідомо'
    : d.toLocaleString('uk-UA', {
        timeZone:'Europe/Kyiv',
        day:'2-digit',
        month:'2-digit',
        year:'numeric',
        hour:'2-digit',
        minute:'2-digit'
      }) + ' (Київ)';
}

function controls() {
  const date = $('roomsDate');
  const pair = $('roomsPair');

  return {
    date: date ? date.value : '',
    pair: pair ? Number(pair.value) : 0
  };
}

function render() {
  const info = $('roomsSnapshot');
  const count = $('roomsCount');
  const list = $('roomsList');

  if (!info || !count || !list) return;

  if (!snapshot) {
    info.textContent = loadError || 'Завантаження даних…';
    count.textContent = '';
    list.innerHTML = '';
    return;
  }

  const j = snapshot;
  const rooms = j.rooms;

  const q = ($('roomsSearch')?.value || '')
    .trim().toLocaleLowerCase('uk-UA');

  const min = Number($('roomsCapacity')?.value || 0);
  const free = $('roomsFreeOnly')?.checked || false;

  const filtered = rooms.filter(r =>
    (!free || r.available) &&
    (!min || Number(r.capacity) >= min) &&
    (!q || [r.name, r.note].some(x =>
      String(x || '').toLocaleLowerCase('uk-UA').includes(q)
    ))
  );

  const available = rooms.filter(r => r.available).length;

  info.innerHTML = `
    <strong>📅 ${esc(j.date)} · ${esc(j.startPair)}-а пара</strong>
    <small>Оновлено: ${esc(formatTime(j.fetchedAt))}</small>
    <small>Дані зі знімка, не перевірка в реальному часі.</small>
  `;

  count.textContent =
    `${available} вільних · ${rooms.length - available} зайнятих · показано ${filtered.length}`;

  list.innerHTML = filtered.length
    ? filtered.map(r => `
      <div class="glass room-item">
        <div class="room-main">
          <strong>⌑ ${esc(r.name)}</strong>
          <small>
            ${r.capacity == null
              ? 'Місткість не вказана'
              : esc(r.capacity) + ' місць'}
            ${r.note ? ' · ' + esc(r.note) : ''}
          </small>
        </div>
        <span class="room-status ${r.available ? 'room-free' : 'room-busy'}">
          ${r.available ? 'Вільна' : 'Зайнята'}
        </span>
      </div>
    `).join('')
    : '<div class="empty">За вибраними фільтрами аудиторій немає.</div>';
}

async function getJSON(path) {
  const separator = path.includes('?') ? '&' : '?';
  const response = await fetch(
    path + separator + 't=' + Date.now(),
    { cache:'no-store' }
  );

  if (!response.ok) throw Error('HTTP ' + response.status);
  return response.json();
}

async function load() {
  const id = ++requestId;
  const {date, pair} = controls();

  snapshot = null;
  loadError = '';
  render();

  if (!date || !pair) {
    loadError = 'Оберіть дату та номер пари.';
    render();
    return;
  }

  try {
    index = await getJSON('./data/campus/index.json');

    if (id !== requestId) return;

    if (!Array.isArray(index.snapshots)) {
      throw Error('Некоректний індекс аудиторій');
    }

    const exists = index.snapshots.some(item =>
      item.date === date && Number(item.pair) === pair
    );

    if (!exists) {
      loadError = `Для ${date}, ${pair}-ї пари даних поки немає.`;
      render();
      return;
    }

    const filename = `${date}_pair-${pair}.json`;
    const path = './data/campus/snapshots/' + filename;

    const data = await getJSON(path);

    if (id !== requestId) return;

    if (!valid(data)) {
      throw Error('Некоректний формат знімка');
    }

    if (data.date !== date || Number(data.startPair) !== pair) {
      throw Error('Знімок не відповідає вибраній даті або парі');
    }

    snapshot = data;
  } catch (e) {
    if (id !== requestId) return;
    loadError = 'Не вдалося завантажити аудиторії: ' + e.message;
  }

  render();
}

function init() {
  if (!$('roomsView')) return;

  ['roomsSearch','roomsCapacity','roomsFreeOnly']
    .forEach(id => {
      const el = $(id);
      if (el) el.addEventListener(
        id === 'roomsSearch' ? 'input' : 'change',
        render
      );
    });

  ['roomsDate','roomsPair'].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('change', load);
  });

  $('roomsRefresh')?.addEventListener('click', load);

  load();

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && $('roomsView')?.classList.contains('active')) {
      load();
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
})();

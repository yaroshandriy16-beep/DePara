
/* ДеПара? Social — друзі та чати */
(() => {
  'use strict';

  const API = 'https://depara-api-preview.yaroshandriy16.workers.dev';
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));

  let tab = 'friends';
  let friends = [];
  let incoming = [];
  let outgoing = [];
  let results = [];
  let messages = [];
  let peer = null;
  let error = '';
  let busy = false;
  let loading = false;
  let refreshTimer = null;
  let fullscreen = false;
  let previousSignature = '';
  let friendFilter = '';
  let messageFilter = '';
  let searchOpen = false;

  const active = () =>
    !!$('nav button[data-page="social"].active');

  const groupId = () => {
    try {
      return String(
        JSON.parse(localStorage.getItem('dp_reborn2_group')) || '3641'
      );
    } catch {
      return '3641';
    }
  };

  const groupName = () => {
    try {
      return JSON.parse(localStorage.getItem('dp_reborn2_groupName')) ||
        'Моя група';
    } catch {
      return 'Моя група';
    }
  };

  const label = u =>
    [u?.first_name, u?.last_name].filter(Boolean).join(' ') ||
    u?.username ||
    'Студент';

  async function api(path, method = 'GET', data) {
    const initData = window.Telegram?.WebApp?.initData;

    if (!initData) {
      throw Error('Відкрий ДеПара? через Telegram-бота');
    }

    const response = await fetch(API + '/api/social/' + path, {
      method,
      headers: {
        Authorization: 'tma ' + initData,
        ...(data !== undefined
          ? { 'Content-Type': 'application/json' }
          : {})
      },
      ...(data !== undefined
        ? { body: JSON.stringify(data) }
        : {})
    });

    const result = await response.json();

    if (!response.ok || !result.ok) {
      throw Error(result.error || 'HTTP ' + response.status);
    }

    return result;
  }

  async function loadFriends() {
    const [f, r] = await Promise.all([
      api('friends'),
      api('requests')
    ]);

    friends = f.friends || [];
    incoming = r.incoming || [];
    outgoing = r.outgoing || [];
  }

  async function loadMessages() {
    if (tab === 'group') {
      const result = await api(
        'group?groupId=' + encodeURIComponent(groupId())
      );
      messages = result.messages || [];
    } else if (tab === 'direct' && peer) {
      const result = await api(
        'dm?userId=' + encodeURIComponent(peer.id)
      );
      messages = result.messages || [];
    }
  }

  async function reload() {
    if (!active() || loading) return;

    loading = true;
    error = '';

    try {
      await loadFriends();

      if (tab !== 'friends') {
        await loadMessages();
      }
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
      const thread = $('#social-messages');
      if (thread && fullscreen && tab !== 'friends') {
        const signature = JSON.stringify(messages.map(m => [m.id,m.body,m.created_at]));
        if (signature !== previousSignature || error) {
          const nearBottom = thread.scrollHeight-thread.scrollTop-thread.clientHeight < 100;
          const draft = $('#social-send textarea')?.value || '';
          render();
          const input = $('#social-send textarea');
          if (input) input.value = draft;
          if (nearBottom) $('#social-messages').scrollTop = $('#social-messages').scrollHeight;
          previousSignature = signature;
        }
      } else render();
    }
  }

  async function action(fn) {
    if (busy) return;

    busy = true;
    error = '';

    try {
      await fn();
    } catch (e) {
      error = e.message;
    } finally {
      busy = false;
      const draft = error ? ($('#social-send textarea')?.value || '') : '';
      render();
      if (draft) { const input = $('#social-send textarea'); if (input) input.value = draft; }
    }
  }

  function userCard(u, buttons = '') {
    return `
      <div class="card" style="margin:10px 0">
        <b>${esc(label(u))}</b>
        <p class="sub">
          ${u.username ? '@' + esc(u.username) : 'Без username'}
        </p>
        ${buttons}
      </div>
    `;
  }

  function friendsView() {
    const visibleFriends = friends.filter(u => (label(u)+' '+(u.username||'')).toLocaleLowerCase('uk-UA').includes(friendFilter.toLocaleLowerCase('uk-UA')));
    return `
      <div class="card">
        <h2>Знайти студента</h2>
        <form id="social-search">
          <input
            class="field"
            name="q"
            required
            minlength="2"
            maxlength="64"
            placeholder="Telegram username"
          >
          <button class="action primary">
            Знайти
          </button>
        </form>
      </div>

      ${results.map(u => userCard(
        u,
        `<button class="action" data-add="${u.id}">
          Додати в друзі
        </button>`
      )).join('')}

      <div class="section">
        <h2>Заявки в друзі (${incoming.length})</h2>
      </div>

      ${incoming.map(u => userCard(
        u,
        `<button
          class="action primary"
          data-respond="accept"
          data-request="${u.id}">
          Прийняти
        </button>
        <button
          class="action"
          data-respond="reject"
          data-request="${u.id}">
          Відхилити
        </button>`
      )).join('') || '<p class="sub">Нових заявок немає.</p>'}

      <div class="section">
        <h2>Мої друзі (${friends.length})</h2>
      </div>
      <input class="field social-filter" id="social-friend-filter" maxlength="70" value="${esc(friendFilter)}" placeholder="Пошук серед друзів..." aria-label="Фільтр друзів">

      ${visibleFriends.map(u => userCard(
        u,
        `<button class="action" data-chat="${u.id}">
          Написати повідомлення →
        </button>`
      )).join('') || '<p class="sub">Друзів за цим запитом не знайдено.</p>'}

      ${outgoing.length ? `
        <div class="section">
          <h2>Очікують відповіді</h2>
        </div>
        ${outgoing.map(u => userCard(u)).join('')}
      ` : ''}
    `;
  }

  const myId = () => String(window.Telegram?.WebApp?.initDataUnsafe?.user?.id ?? '');
  const stamp = v => {
    if (!v) return '';
    const raw = String(v);
    const d = /^\d{10,13}$/.test(raw) ? new Date(Number(raw) * (raw.length === 10 ? 1000 : 1)) : new Date(raw.replace(' ', 'T') + (/Z$|[+-]\d\d:?\d\d$/.test(raw) ? '' : 'Z'));
    return Number.isNaN(d.getTime()) ? raw.slice(11,16) : d.toLocaleTimeString('uk-UA',{hour:'2-digit',minute:'2-digit'});
  };
  const initials = name => String(name || '?').trim().split(/\s+/).slice(0,2).map(s => s[0] || '').join('').toUpperCase();
  function chatView() {
    const isGroup = tab === 'group';
    const title = isGroup ? 'Чат групи ' + groupName() : label(peer);
    const self = myId();
    return `
      <section class="messenger" aria-label="${esc(title)}">
        <div class="messenger-head">
          <button class="messenger-back" id="social-back" aria-label="Назад">‹</button>
          <div class="messenger-avatar">${esc(isGroup ? '✦' : initials(title))}</div>
          <div class="messenger-head-text"><strong>${esc(title)}</strong><span>${isGroup ? 'Групове спілкування' : 'Особисті повідомлення'}</span></div>
          <button class="messenger-search-toggle" id="social-message-search-toggle" type="button" aria-label="Пошук повідомлень">⌕</button><span class="messenger-live" title="Хмарний чат">●</span>
        </div>
        ${searchOpen ? `<div class="messenger-search-row"><input id="social-message-filter" class="field" value="${esc(messageFilter)}" placeholder="Знайти повідомлення..." aria-label="Пошук у чаті"><button id="social-message-search-close" class="action" type="button">×</button></div>` : ''}
        <div class="messenger-thread" id="social-messages" role="log" aria-live="polite" aria-relevant="additions text">
          ${messages.filter(m => !messageFilter || String(m.body||'').toLocaleLowerCase('uk-UA').includes(messageFilter.toLocaleLowerCase('uk-UA'))).map(m => {
            const own = self && String(m.sender_id ?? m.user_id ?? '') === self;
            const name = own ? 'Ти' : isGroup ? label(m) : label(peer);
            return `<div class="message-row ${own ? 'mine' : 'theirs'}">
              ${own ? '' : `<span class="message-avatar" aria-hidden="true">${esc(initials(name))}</span>`}
              <div class="message-bubble">
                ${isGroup && !own ? `<span class="message-name">${esc(name)}</span>` : ''}
                <div class="message-body">${esc(m.body)}</div><button class="message-copy" type="button" data-copy-message="${esc(m.id)}" aria-label="Скопіювати повідомлення">Копіювати</button>
                <time class="message-time">${esc(stamp(m.created_at))}</time>
              </div>
            </div>`;
          }).join('') || '<div class="messenger-empty">Повідомлень не знайдено<small>Зміни пошуковий запит або напиши повідомлення</small></div>'}
        </div>
        <form id="social-send" class="messenger-compose">
          <textarea class="messenger-input" name="message" required maxlength="2000" rows="1" placeholder="Повідомлення..." aria-label="Текст повідомлення"></textarea>
          <button class="messenger-send" type="submit" aria-label="Надіслати повідомлення">➤</button>
        </form>
      </section>
    `;
  }

  function render() {
    if (!active()) return;

    const screen = $('#screen');
    if (!screen) return;

    document.body.classList.toggle('chat-fullscreen', fullscreen && tab !== 'friends');
    screen.innerHTML = `
      <div class="eyebrow">ВНАУ · ДеПара?</div>
      <h1>Спільнота</h1>
      <p class="sub">Друзі та чати на Cloudflare D1</p>

      <div class="actions">
        <button
          class="action ${tab === 'friends' ? 'primary' : ''}"
          id="social-friends">
          Друзі
        </button>

        <button
          class="action ${tab === 'group' ? 'primary' : ''}"
          id="social-group">
          Чат групи
        </button>

        <button class="action" id="social-refresh">
          ↻ Оновити
        </button>
      </div>

      ${error ? `
        <div class="card">
          <p class="sub">${esc(error)}</p>
        </div>
      ` : ''}

      ${tab === 'friends' ? friendsView() : chatView()}
    `;

    bind();
    if (tab !== 'friends') {
      const thread = $('#social-messages');
      if (thread) {
        thread.scrollTop = thread.scrollHeight;
      }
    }
  }

  function bind() {
    $('#social-back')?.addEventListener('click', () => { fullscreen=false;tab='friends';peer=null;render(); });
    $('#social-friends')?.addEventListener('click', () => {
      tab = 'friends';
      fullscreen = false;
      peer = null;
      error = '';
      render();
    });

    $('#social-group')?.addEventListener('click', () => {
      tab = 'group';
      messageFilter='';searchOpen=false;
      fullscreen = true;
      peer = null;
      messages = [];
      reload();
    });

    $('#social-refresh')?.addEventListener('click', reload);
    $('#social-friend-filter')?.addEventListener('input', e => {friendFilter=e.target.value;const pos=e.target.selectionStart;render();const input=$('#social-friend-filter');input?.focus();input?.setSelectionRange(pos,pos)});
    $('#social-message-search-toggle')?.addEventListener('click',()=>{searchOpen=!searchOpen;if(!searchOpen)messageFilter='';render();$('#social-message-filter')?.focus()});
    $('#social-message-search-close')?.addEventListener('click',()=>{searchOpen=false;messageFilter='';render()});
    $('#social-message-filter')?.addEventListener('input',e=>{messageFilter=e.target.value;const pos=e.target.selectionStart;render();const input=$('#social-message-filter');input?.focus();input?.setSelectionRange(pos,pos)});
    document.querySelectorAll('[data-copy-message]').forEach(b=>b.onclick=async()=>{const m=messages.find(x=>String(x.id)===b.dataset.copyMessage);if(!m)return;try{await navigator.clipboard.writeText(String(m.body||''));b.textContent='Скопійовано ✓'}catch{const el=document.createElement('textarea');el.value=String(m.body||'');document.body.appendChild(el);el.select();document.execCommand('copy');el.remove();b.textContent='Скопійовано ✓'}});

    $('#social-search')?.addEventListener('submit', e => {
      e.preventDefault();

      const q = e.target.elements.q.value.trim();

      action(async () => {
        const result = await api(
          'search?q=' + encodeURIComponent(q)
        );
        results = result.users || [];
      });
    });

    document.querySelectorAll('[data-add]').forEach(b => {
      b.onclick = () => action(async () => {
        await api('requests', 'POST', {
          userId: Number(b.dataset.add)
        });

        results = [];
        await loadFriends();
      });
    });

    document.querySelectorAll('[data-respond]').forEach(b => {
      b.onclick = () => action(async () => {
        await api('requests/respond', 'POST', {
          requestId: Number(b.dataset.request),
          action: b.dataset.respond
        });

        await loadFriends();
      });
    });

    document.querySelectorAll('[data-chat]').forEach(b => {
      b.onclick = () => {
        peer = friends.find(
          u => u.id === Number(b.dataset.chat)
        );

        if (!peer) return;

        tab = 'direct';
        messageFilter='';searchOpen=false;
        fullscreen = true;
        messages = [];
        reload();
      };
    });

    const compose = $('#social-send');
    const composeInput = compose?.elements.message;
    composeInput?.addEventListener('input', () => {
      composeInput.style.height = 'auto';
      composeInput.style.height = Math.min(composeInput.scrollHeight, 112) + 'px';
    });
    composeInput?.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        compose?.requestSubmit();
      }
    });
    compose?.addEventListener('submit', e => {
      e.preventDefault();

      const input = e.target.elements.message;
      const msg = input.value.trim();

      if (!msg) return;

      action(async () => {
        if (tab === 'group') {
          await api('group', 'POST', {
            groupId: groupId(),
            body: msg
          });
        } else if (tab === 'direct' && peer) {
          await api('dm', 'POST', {
            userId: peer.id,
            body: msg
          });
        }

        await loadMessages();
      });
    });
  }

  function watch() {
    if (!active()) {
      document.body.classList.remove('chat-fullscreen');
      if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
      }
      return;
    }

    if (!$('#social-friends')) {
      render();
      reload();
    }

    if (!refreshTimer) {
      refreshTimer = setInterval(() => {
        if (!active()) {
          watch();
          return;
        }

        if (tab !== 'friends') {
          reload();
        }
      }, 5000);
    }
  }

  function init() {
    const screen = $('#screen');
    if (!screen) return;

    const observer = new MutationObserver(() => {
      if (active() && !$('#social-friends')) {
        watch();
      }
    });

    observer.observe(screen, { childList: true });

    document.querySelectorAll('nav button').forEach(b => {
      b.addEventListener('click', () => {
        setTimeout(watch, 0);
      });
    });

    watch();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

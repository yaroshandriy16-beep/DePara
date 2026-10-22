(()=>{'use strict';
const nav=document.querySelector('#nav'),screen=document.querySelector('#screen');
if(!nav||!screen)return;
const study=nav.querySelector('[data-page="study"]');
if(!study)return;
study.dataset.page='notebook';study.innerHTML='<span>▤</span>Зошит';
const social=nav.querySelector('[data-page="social"]');if(social)social.remove();
const css=document.createElement('style');css.textContent=`
#nav{grid-template-columns:repeat(4,minmax(0,1fr))}
#dp-clean-notebook{padding:18px 16px 110px;max-width:700px;margin:auto;color:var(--text,#edf5ef)}
#dp-clean-notebook *{box-sizing:border-box}
#dp-clean-notebook h1{font-size:27px;margin:0 0 5px}
#dp-clean-notebook .dp-sub{opacity:.72;font-size:13px;margin:0 0 20px}
#dp-clean-notebook .dp-card{padding:15px;border-radius:17px;background:rgba(127,157,139,.09);border:1px solid rgba(142,175,151,.24);margin:12px 0}
#dp-clean-notebook label{display:block;font-size:13px;margin:10px 0 6px;opacity:.85}
#dp-clean-notebook input,#dp-clean-notebook textarea{display:block;width:100%;border-radius:11px;padding:12px;color:inherit;background:rgba(90,115,100,.15);border:1px solid rgba(142,175,151,.32);font:inherit}
#dp-clean-notebook textarea{min-height:130px;resize:vertical}
#dp-clean-notebook button{border:1px solid rgba(142,175,151,.4);border-radius:11px;padding:10px 13px;color:inherit;background:rgba(94,145,112,.18);font:inherit;cursor:pointer}
#dp-clean-notebook button.dp-primary{background:#237e53;color:white;border-color:#237e53}
#dp-clean-notebook .dp-row{display:flex;gap:8px;align-items:center;justify-content:space-between}
#dp-clean-notebook .dp-note-title{font-size:16px;font-weight:700;overflow-wrap:anywhere}
#dp-clean-notebook .dp-note-body{white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px;opacity:.85;margin:10px 0}
#dp-clean-notebook .dp-note-meta{font-size:12px;opacity:.65}
#dp-clean-notebook .dp-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
`;document.head.appendChild(css);
const KEY='depara-test-clean-notes-v1';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let active=false,editing=null;
function read(){try{const a=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(a)?a:[]}catch{return []}}
function save(a){try{localStorage.setItem(KEY,JSON.stringify(a));return true}catch{alert('Не вдалося зберегти нотатку на пристрої');return false}}
function render(){if(!active)return;const notes=read();screen.innerHTML=`<section id="dp-clean-notebook"><h1>Зошит</h1><p class="dp-sub">Особисті конспекти · тестова версія · зберігаються на цьому пристрої</p><div class="dp-card"><form id="dp-note-form"><strong id="dp-form-title">${editing?'Редагувати конспект':'Новий конспект'}</strong><label for="dp-subject">Предмет</label><input id="dp-subject" name="subject" maxlength="100" required placeholder="Назва предмета"><label for="dp-title">Назва конспекту</label><input id="dp-title" name="title" maxlength="140" required placeholder="Тема заняття"><label for="dp-body">Текст</label><textarea id="dp-body" name="body" placeholder="Запиши головне..."></textarea><div class="dp-actions"><button type="submit" class="dp-primary">Зберегти</button><button type="button" id="dp-cancel" ${editing?'':'hidden'}>Скасувати</button></div></form></div><div class="dp-row"><strong>Мої конспекти (${notes.length})</strong></div><div id="dp-note-list">${notes.length?notes.map(n=>`<article class="dp-card" data-id="${esc(n.id)}"><div class="dp-note-meta">${esc(n.subject)}</div><div class="dp-note-title">${esc(n.title)}</div><div class="dp-note-body">${esc(n.body)}</div><div class="dp-note-meta">${esc(n.updated||'')}</div><div class="dp-actions"><button data-action="edit" data-id="${esc(n.id)}">Редагувати</button><button data-action="delete" data-id="${esc(n.id)}">Видалити</button></div></article>`).join(''):'<p class="dp-sub">Поки немає конспектів. Створи перший вище.</p>'}</div></section>`;
if(editing){const n=notes.find(x=>x.id===editing);if(n){screen.querySelector('#dp-subject').value=n.subject;screen.querySelector('#dp-title').value=n.title;screen.querySelector('#dp-body').value=n.body}}
}
screen.addEventListener('submit',e=>{if(!active||e.target.id!=='dp-note-form')return;e.preventDefault();const form=e.target;const subject=form.subject.value.trim(),title=form.title.value.trim(),body=form.body.value.trim();if(!subject||!title)return;const a=read(),id=editing||String(Date.now())+'-'+Math.random().toString(36).slice(2,8),entry={id,subject,title,body,updated:new Date().toLocaleDateString('uk-UA')};const idx=a.findIndex(n=>n.id===id);if(idx<0)a.unshift(entry);else a[idx]=entry;if(save(a)){editing=null;render()}},true);
screen.addEventListener('click',e=>{if(!active)return;const b=e.target.closest('button');if(!b)return;if(b.id==='dp-cancel'){editing=null;render();return}const id=b.dataset.id,action=b.dataset.action;if(!id||!action)return;const a=read();if(action==='edit'){editing=id;render();screen.querySelector('#dp-note-form')?.scrollIntoView({behavior:'smooth',block:'start'})}if(action==='delete'&&confirm('Видалити цей конспект?')){if(save(a.filter(n=>n.id!==id))){if(editing===id)editing=null;render()}}},true);
nav.addEventListener('click',e=>{const b=e.target.closest('button[data-page]');if(!b)return;if(b.dataset.page==='notebook'){active=true;queueMicrotask(()=>{if(active){render();nav.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b))}})}else active=false},true);
})();
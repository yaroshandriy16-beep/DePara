/* REBORN 4.5: coherent page navigation. Preview only. */
(()=>{'use strict';
const $=q=>document.querySelector(q);
const tabs={study:[['tasks','Завдання'],['session','Сесія'],['notes','Нотатки'],['grades','Оцінки'],['attendance','Відвідування'],['focus','Фокус']],schedule:[['lessons','Пари'],['calendar','Календар'],['insights','Аналітика'],['changes','Зміни']]};
const get=(page,valid)=>{try{const x=sessionStorage.getItem('rb45_'+page);return valid.includes(x)?x:valid[0]}catch{return valid[0]}};
const put=(page,tab)=>{try{sessionStorage.setItem('rb45_'+page,tab)}catch{}};
function switchTo(page,tab){const root=$('#screen'),nav=$('#rb45-'+page);if(!root||!nav)return;nav.querySelectorAll('button').forEach(b=>{const yes=b.dataset.tab===tab;b.classList.toggle('active',yes);b.setAttribute('aria-selected',String(yes))});root.querySelectorAll('[data-rb45-'+page+']').forEach(el=>{el.hidden=el.getAttribute('data-rb45-'+page)!==tab});put(page,tab);if(page==='schedule'&&tab==='calendar'&&!$('#month-prev'))$('#calendar-toggle')?.click()}
function nav(page,anchor){const bar=document.createElement('div');bar.className='rb45-tabs';bar.id='rb45-'+page;bar.setAttribute('role','tablist');bar.innerHTML=tabs[page].map(([id,label])=>'<button type="button" role="tab" data-tab="'+id+'">'+label+'</button>').join('');anchor.before(bar);bar.addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(b)switchTo(page,b.dataset.tab)});return bar}
function study(){const root=$('#screen');if(!root||$('#rb45-study'))return;const hero=root.querySelector('.study-hero'),stats=root.querySelector('.study-top-stats');if(!hero||!stats)return;nav('study',stats.nextElementSibling||stats);let mode='tasks';const children=[...root.children];for(const el of children){if(el.hasAttribute('data-rb45-study')||el.id==='rb45-study'||el===hero||el===stats||el.classList.contains('eyebrow')||el.tagName==='H1'||(el.classList.contains('sub')&&el.previousElementSibling?.tagName==='H1'))continue;
const title=(el.querySelector('h2')?.textContent||'').toLowerCase();
if(el.classList.contains('session-card'))mode='session';
else if(el.querySelector('#task-form'))mode='tasks';
else if(el.classList.contains('two')){const cards=[...el.children];for(const card of cards){card.setAttribute('data-rb45-study',/оцінки/i.test(card.querySelector('h2')?.textContent||'')?'grades':'notes');root.insertBefore(card,el)}el.remove();continue}
else if(/відвідування/.test(title))mode='attendance';
else if(el.classList.contains('study-filters')||el.querySelector('[data-task]')||el.querySelector('[data-delete-task]'))mode='tasks';
if(el.compareDocumentPosition($('#rb45-study'))&Node.DOCUMENT_POSITION_PRECEDING)el.setAttribute('data-rb45-study',mode)}
switchTo('study',get('study',tabs.study.map(x=>x[0])))}
function schedule(){const root=$('#screen');if(!root)return;let bar=$('#rb45-schedule');const tools=root.querySelector('.schedule-tools');if(!tools)return;if(!bar)bar=nav('schedule',tools);
 const after=[...root.children];let calendar=false;
 for(const el of after){
  if(el===bar||el===tools||el.classList.contains('schedule-hero')||el.classList.contains('eyebrow')||el.tagName==='H1'||(el.classList.contains('sub')&&el.previousElementSibling?.tagName==='H1'))continue;
  let type='lessons';
  if(el.id==='rb33-schedule')type='insights';
  else if(el.querySelector?.('#month-prev,#month-next')||el.id==='calendar-view'||el.classList.contains('calendar-view'))type='calendar';
  else if(el.querySelector?.('#change-history-clear')||/Історія змін/.test(el.querySelector?.('h2')?.textContent||''))type='changes';
  if(el.compareDocumentPosition(bar)&Node.DOCUMENT_POSITION_PRECEDING)el.dataset.rb45Schedule=type;
 }
 switchTo('schedule',get('schedule',tabs.schedule.map(x=>x[0])));
}
function home(){const root=$('#screen');if(!root||$('#rb45-more'))return;const container=root.querySelector('.reborn-home');if(!container)return;const heads=[...container.querySelectorAll('.home-section-head')];if(!heads.length)return;const first=heads[0];const toggle=document.createElement('button');toggle.type='button';toggle.className='rb45-more';toggle.id='rb45-more';toggle.textContent='Показати деталі дня ↓';first.before(toggle);const content=[];for(const el of [...container.children]){if(el===toggle||el.id==='ui23-day-panel'||el.classList.contains('ui23-day-panel'))continue;if(el.compareDocumentPosition(toggle)&Node.DOCUMENT_POSITION_PRECEDING){el.classList.add('rb45-home-extra');content.push(el)}}let open=(()=>{try{return sessionStorage.getItem('rb49_home_details')==='1'}catch{return false}})();function paint(){for(const el of content)el.hidden=!open;const daily=container.querySelector('#ui23-day-panel');if(daily){daily.hidden=false;daily.classList.remove('rb45-home-extra');daily.querySelectorAll('.lesson,.empty').forEach(el=>{el.hidden=false;el.removeAttribute('hidden');el.classList.remove('rb45-home-extra')})}toggle.textContent=open?'Згорнути деталі ↑':'Показати деталі дня ↓';toggle.setAttribute('aria-expanded',String(open))}toggle.addEventListener('click',()=>{open=!open;try{sessionStorage.setItem('rb49_home_details',open?'1':'0')}catch{}paint()});paint()}
function profile(){const root=$('#screen'),bar=$('#rb43-profile-tabs');if(!root||!bar)return;for(const el of [...root.children]){if(el.classList?.contains('rb40-card')&&!el.hasAttribute('data-rb43-section')){const title=(el.querySelector('h2')?.textContent||'').toLowerCase();el.setAttribute('data-rb43-section',/стиль|налаштування/.test(title)?'settings':'study')}}root.querySelector('#dp-reset-settings')?.remove();const active=bar.querySelector('button.active')?.dataset.rb43Tab||'identity';root.querySelectorAll('[data-rb43-section]').forEach(el=>el.hidden=el.getAttribute('data-rb43-section')!==active);const style=root.querySelector('#rb40-slot');if(style){style.dataset.rb43Section='settings';style.hidden=active!=='settings'}}
function update(){const page=$('nav button.active')?.dataset.page;if(page==='today')home();if(page==='study')study();if(page==='schedule'){schedule();const insight=$('#rb33-schedule');if(insight&&!insight.hasAttribute('data-rb45-schedule')){insight.setAttribute('data-rb45-schedule','insights');const active=$('#rb45-schedule button.active')?.dataset.tab;insight.hidden=active!=='insights'}}if(page==='profile')profile()}
let queued=false;function scheduleUpdate(){if(queued)return;queued=true;queueMicrotask(()=>{queued=false;update()})}
function init(){const screen=$('#screen');if(!screen)return;new MutationObserver(scheduleUpdate).observe(screen,{childList:true});scheduleUpdate()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
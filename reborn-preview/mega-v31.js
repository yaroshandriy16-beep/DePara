/* DePara REBORN 3.1 MEGA — preview-only study planner and responsive tools */
(()=>{'use strict';
const screen=document.querySelector('#screen');if(!screen)return;
const key='dp_reborn2_mega31_tasks';
const read=()=>{try{const v=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(v)?v.filter(x=>x&&typeof x.title==='string').slice(0,100):[]}catch{return []}};
let tasks=read(),queued=false;
const $=s=>document.querySelector(s);
const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function persist(){try{localStorage.setItem(key,JSON.stringify(tasks));return true}catch{return false}}
function mount(){
 if(document.body.classList.contains('dp-teacher-active'))return;
 const page=$('#nav button.active')?.dataset.page;
 if(page==='today'){mountHome();return}
 if(page!=='study'||screen.querySelector('#dp31-planner'))return;
 const box=document.createElement('section');box.id='dp31-planner';box.className='dp31-planner card';
 box.innerHTML='<div class="dp31-head"><div><small>НАВЧАННЯ 3.1</small><h2>Мої завдання</h2><p>Дедлайни й справи зберігаються на цьому пристрої.</p></div><span id="dp31-progress"></span></div><form id="dp31-form"><label for="dp31-title">Нове завдання</label><input id="dp31-title" maxlength="120" placeholder="Наприклад, підготувати лабораторну" required><label for="dp31-date">Дедлайн (необов’язково)</label><input id="dp31-date" type="date"><button type="submit">+ Додати завдання</button></form><label for="dp31-filter">Показати</label><select id="dp31-filter"><option value="all">Усі завдання</option><option value="open">Невиконані</option><option value="done">Виконані</option></select><div id="dp31-list" aria-live="polite"></div><p id="dp31-message" role="status"></p>';
 screen.prepend(box);
 box.querySelector('#dp31-form').addEventListener('submit',e=>{e.preventDefault();const input=box.querySelector('#dp31-title'),title=input.value.trim();if(!title)return;tasks.unshift({id:Date.now().toString(36)+Math.random().toString(36).slice(2,7),title,date:box.querySelector('#dp31-date').value,done:false});if(tasks.length>100)tasks=tasks.slice(0,100);const saved=persist();input.value='';box.querySelector('#dp31-date').value='';draw(box);if(!saved)box.querySelector('#dp31-message').textContent='Не вдалося зберегти: пам’ять пристрою переповнена.'});
 box.querySelector('#dp31-filter')?.addEventListener('change',()=>draw(box));
 box.querySelector('#dp31-list').addEventListener('click',e=>{const b=e.target.closest('button[data-action]');if(!b)return;const i=tasks.findIndex(t=>t.id===b.dataset.id);if(i<0)return;if(b.dataset.action==='done')tasks[i].done=!tasks[i].done;else if(b.dataset.action==='remove')tasks.splice(i,1);persist();draw(box)});
 draw(box);
}
function draw(box){
 const filter=box.querySelector('#dp31-filter')?.value||'all';
 const sorted=tasks.filter(t=>filter==='all'||(filter==='done'?t.done:!t.done)).sort((a,b)=>Number(a.done)-Number(b.done)||(a.date||'9999').localeCompare(b.date||'9999'));
 const today=new Date();const todayKey=[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-');
 box.querySelector('#dp31-progress').textContent=tasks.filter(t=>t.done).length+'/'+tasks.length+' виконано';
 box.querySelector('#dp31-list').innerHTML=sorted.length?sorted.map(t=>'<div class="dp31-task '+(t.done?'is-done':'')+'"><button type="button" data-action="done" data-id="'+esc(t.id)+'" aria-label="'+(t.done?'Повернути завдання':'Позначити виконаним')+'">'+(t.done?'✓':'○')+'</button><div><strong>'+esc(t.title)+'</strong>'+(t.date?'<small>'+(t.date<todayKey&&!t.done?'Прострочено · ':t.date===todayKey?'Сьогодні · ':'До ')+esc(t.date)+'</small>':'')+'</div><button type="button" data-action="remove" data-id="'+esc(t.id)+'" aria-label="Видалити завдання">×</button></div>').join(''):'<p class="dp31-empty">Поки завдань немає. Додай перше вище.</p>';
}
function mountHome(){
 const home=screen.querySelector('.reborn-home');if(!home||home.querySelector('#dp31-home'))return;
 const open=tasks.filter(t=>!t.done);const today=new Date();const day=[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-');
 const due=open.filter(t=>t.date&&t.date<=day).length;
 const card=document.createElement('button');card.type='button';card.id='dp31-home';card.className='dp31-home';card.innerHTML='<span>МОЇ ЗАВДАННЯ</span><strong>'+open.length+' невиконаних'+(due?' · '+due+' потребують уваги':'')+'</strong><small>Відкрити навчання →</small>';
 card.onclick=()=>document.querySelector('#nav button[data-page="study"]')?.click();
 const target=home.querySelector('#ui23-day-panel');(target||home).after(card);
}
window.addEventListener('storage',e=>{if(e.key===key){tasks=read();const box=screen.querySelector('#dp31-planner');if(box)draw(box);const home=screen.querySelector('#dp31-home');if(home){home.remove();mountHome()}}});
function queue(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;mount()})}
new MutationObserver(queue).observe(screen,{childList:true,subtree:false});
document.addEventListener('click',e=>{if(e.target.closest('#nav button'))setTimeout(queue,0)});
queue();
})();
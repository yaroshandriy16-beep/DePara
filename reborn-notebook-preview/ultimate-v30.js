/* DePara REBORN 3.0 — accessible progressive enhancements, preview only */
(()=>{'use strict';
const screen=document.querySelector('#screen');if(!screen)return;
const $=s=>document.querySelector(s);
let pending=false;
function update(){
 if(document.body.classList.contains('dp-teacher-active'))return;
 const page=$('#nav button.active')?.dataset.page;
 const home=screen.querySelector('.reborn-home');
 if(home){
  const panel=home.querySelector('#ui23-day-panel');
  if(panel){const count=panel.querySelector('.ui23-day-count');const n=panel.querySelectorAll('.lesson').length;if(count)count.textContent=n+' '+(n===1?'пара':n>=2&&n<=4?'пари':'пар')}
 }
 if(page==='schedule'){
  const strip=screen.querySelector('.daystrip');
  const date=strip?.querySelector('button.active')?.dataset.day;
  const heading=screen.querySelector('#ui23-schedule-date');
  if(date&&heading){
   const d=new Date(date+'T12:00:00');
   const label=heading.querySelector('.ui23-date');
   if(label)label.textContent=d.toLocaleDateString('uk-UA',{weekday:'short',day:'numeric',month:'long'});
   const days=[...strip.querySelectorAll('button[data-day]')].map(b=>b.dataset.day);
   const arrows=heading.querySelectorAll('button');
   if(arrows[0])arrows[0].disabled=date===days[0];
   if(arrows[1])arrows[1].disabled=date===days[days.length-1];
  }
  strip?.querySelectorAll('button[data-day]').forEach(b=>{b.setAttribute('aria-pressed',String(b.classList.contains('active')));b.setAttribute('aria-label',b.dataset.day||b.textContent.trim())});
 }
 if(page==='profile'){
  const tabs=$('#rb43-profile-tabs');
  tabs?.querySelectorAll('button').forEach(b=>{b.setAttribute('aria-selected',String(b.classList.contains('active')));b.setAttribute('role','tab')});
 }
 const status=screen.querySelector('#dp3-status');
 if(page==='today'&&home&&!status){
  const el=document.createElement('p');el.id='dp3-status';el.setAttribute('role','status');
  const dot=document.createElement('span');dot.className='dp3-dot';dot.setAttribute('aria-hidden','true');
  const text=document.createElement('span');text.className='dp3-status-text';
  el.append(dot,text);
  const heading=home.querySelector('.home-heading');(heading||home).after(el);
 }
 const live=screen.querySelector('#dp3-status');
 if(live){const offline=navigator.onLine===false;live.dataset.offline=String(offline);const label=live.querySelector('.dp3-status-text');if(label)label.textContent=offline?'Офлайн · показано збережені дані':'Розклад та інструменти під рукою'}
}
function queue(){if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;update()})}
new MutationObserver(queue).observe(screen,{childList:true,subtree:false});
document.addEventListener('click',e=>{if(e.target.closest('#nav button,.daystrip button,#rb43-profile-tabs button,#ui23-schedule-date button'))setTimeout(queue,0)});
window.addEventListener('online',queue);window.addEventListener('offline',queue);
queue();
})();
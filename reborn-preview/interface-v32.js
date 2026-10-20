/* REBORN 3.2 — navigation and visibility integrity, preview only */
(()=>{'use strict';
const screen=document.querySelector('#screen'),nav=document.querySelector('#nav');if(!screen||!nav)return;
const $=s=>document.querySelector(s);
let pending=false,lastPage='';
function activePage(){return nav.querySelector('button.active')?.dataset.page||'today'}
function reconcile(){
 if(document.body.classList.contains('dp-teacher-active'))return;
 const page=activePage();
 nav.querySelectorAll('button[data-page]').forEach(b=>{const active=b.dataset.page===page;b.setAttribute('aria-current',active?'page':'false');b.setAttribute('aria-label',b.textContent.trim())});
 const style=screen.querySelector('#rb40-slot');
 if(style){
  if(page==='profile'){
   style.dataset.rb43Section='settings';
   const selected=screen.querySelector('#rb43-profile-tabs button.active')?.dataset.rb43Tab||'identity';
   style.hidden=selected!=='settings';
  }else if(style.dataset.ownerPage==='profile'||style.querySelector('.rb40-themes'))style.remove();
 }
 if(page==='study'){
  screen.querySelectorAll('.rb40-card,.card').forEach(c=>{
   const heading=c.querySelector('h2')?.textContent.trim();
   if(['Мій стиль','Мій профіль','Твій профіль'].includes(heading))c.remove();
  });
  const original=screen.querySelector('#task-form');
  const duplicate=screen.querySelector('#dp31-planner');
  if(original&&duplicate)duplicate.remove();
 }
 if(page==='today'&&!screen.querySelector('#dp32-quickbar')){
  const home=screen.querySelector('.reborn-home');
  if(home){
   const bar=document.createElement('div');bar.id='dp32-quickbar';bar.className='dp32-quickbar';
   bar.innerHTML='<button type="button" data-dp32-page="schedule"><span aria-hidden="true">▦</span>Розклад</button><button type="button" data-dp32-page="study"><span aria-hidden="true">✎</span>Мої завдання</button>';
   const next=home.querySelector('#ui23-day-panel');
   if(next)next.after(bar);else home.append(bar);
  }
 }
 if(lastPage!==page){lastPage=page;screen.setAttribute('data-dp32-page',page)}
}
function queue(){if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;reconcile()})}
screen.addEventListener('click',e=>{const b=e.target.closest('[data-dp32-page]');if(b)nav.querySelector('button[data-page="'+b.dataset.dp32Page+'"]')?.click();if(e.target.closest('#rb43-profile-tabs button,#rb45-study button,#rb45-schedule button'))queue()});
nav.addEventListener('click',queue);
new MutationObserver(queue).observe(screen,{childList:true,subtree:false});
queue();
})();
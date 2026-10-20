/* DePara REBORN UI Revolution 2.2 — preview-only progressive enhancements. */
(()=>{'use strict';
const $=q=>document.querySelector(q);
const page=()=>$('#nav button.active')?.dataset.page;
const screen=$('#screen');
if(!screen)return;
let queued=false;
function improve(){
  if(document.body.classList.contains('dp-teacher-active'))return;
  const current=page();
  document.body.dataset.ui22Page=current||'';
  const nav=$('#nav');
  nav?.querySelectorAll('button[data-page]').forEach(b=>{
    const selected=b.dataset.page===current;
    b.setAttribute('aria-current',selected?'page':'false');
    b.setAttribute('aria-label',b.textContent.trim());
  });
  if(current==='today'){
    const head=screen.querySelector('.home-section-head');
    if(head&&head.textContent.includes('Пари на день')){
      const title=head.querySelector('h2');
      if(title){
        const n=screen.querySelectorAll('.reborn-home > .lesson').length;
        title.textContent='Пари на день · '+n;
      }
    }
    const feature=screen.querySelector('.home-feature');
    if(feature)feature.setAttribute('aria-label','Найближча пара');
  }
  if(current==='schedule'){
    const tools=screen.querySelector('.schedule-tools');
    if(tools&&!$('#ui22-today-shortcut')){
      const b=document.createElement('button');
      b.type='button';b.className='pill';b.id='ui22-today-shortcut';
      b.textContent='◉ Сьогодні';b.setAttribute('aria-label','Показати розклад на сьогодні');
      b.addEventListener('click',()=>$('#today-date')?.click());
      tools.prepend(b);
    }
    screen.querySelectorAll('.daystrip button').forEach(b=>b.setAttribute('aria-pressed',String(b.classList.contains('active'))));
  }
  if(current==='profile'){
    const tabs=$('#rb43-profile-tabs');
    if(tabs){
      tabs.setAttribute('role','tablist');
      tabs.querySelectorAll('button').forEach(b=>{
        b.setAttribute('role','tab');
        b.setAttribute('aria-selected',String(b.classList.contains('active')));
      });
    }
    const settings=$('#dp-v50-settings');
    if(settings){
      const heading=settings.querySelector('h2');
      if(heading)heading.textContent='Налаштування';
      const descriptions=settings.querySelectorAll('p.sub');
      if(descriptions[0])descriptions[0].textContent='Профіль, резервні копії та керування застосунком — в одному місці.';
      settings.querySelectorAll('[data-dp-setting]').forEach(b=>b.setAttribute('aria-label',b.querySelector('strong')?.textContent||'Налаштування'));
    }
  }
}
function schedule(){if(queued)return;queued=true;queueMicrotask(()=>{queued=false;improve()})}
new MutationObserver(schedule).observe(screen,{childList:true,subtree:false});
document.addEventListener('click',e=>{if(e.target.closest('#rb43-profile-tabs button,#nav button'))setTimeout(improve,0)});
improve();
})();

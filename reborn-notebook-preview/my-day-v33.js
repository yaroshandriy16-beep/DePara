/* ДеПара? — My Day 3.3: a single, fixed composition. Preview only. */
(()=>{'use strict';
const screen=document.querySelector('#screen'),nav=document.querySelector('#nav');if(!screen||!nav)return;
let queued=false;
function update(){
 const today=nav.querySelector('button.active')?.dataset.page==='today';
 if(!today)return;
 const home=screen.querySelector('.reborn-home');if(!home)return;
 // Disable the old collapsible day-details interface entirely.
 home.querySelector('#rb45-more')?.remove();
 home.querySelector('#dp32-quickbar')?.remove();
 home.querySelectorAll('.rb45-home-extra').forEach(el=>{el.classList.remove('rb45-home-extra');el.hidden=false});
 const panel=home.querySelector('#ui23-day-panel');
 if(panel){
  panel.hidden=false;panel.removeAttribute('hidden');
  panel.querySelectorAll('.lesson,.empty').forEach(el=>{el.hidden=false;el.removeAttribute('hidden')});
 }
 // Keep exactly: greeting, next lesson, today's lessons, schedule changes.
 const kept=new Set();
 const add=(el)=>{if(el)kept.add(el)};
 add(home.querySelector('.home-kicker'));
 add(home.querySelector('.home-heading'));
 add(home.querySelector('.home-feature'));
 add(panel);
 add(home.querySelector('.change-banner'));
 // If the legacy day-panel transformer has not run, preserve the original day section.
 if(!panel){
  const heads=[...home.children].filter(el=>el.classList.contains('home-section-head'));
  const h=heads.find(el=>/Пари на день/.test(el.textContent||''));
  if(h){add(h);let el=h.nextElementSibling;while(el&&(el.classList.contains('lesson')||el.classList.contains('empty'))){add(el);el=el.nextElementSibling}}
 }
 for(const el of [...home.children]){
  const show=kept.has(el);
  if(el.dataset.dp33Visible!==(show?'1':'0'))el.dataset.dp33Visible=show?'1':'0';
  el.hidden=!show;
 }
 // Notification centre is mounted by its own feature module, outside .reborn-home.
 const slot=screen.querySelector('#rb40-slot');
 if(slot&&slot.dataset.ownerPage==='today')slot.hidden=false;
}
function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;update()})}
nav.addEventListener('click',schedule);
new MutationObserver(schedule).observe(screen,{childList:true,subtree:true});
schedule();
})();
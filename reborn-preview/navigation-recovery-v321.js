/* REBORN 3.2.1: authoritative navigation recovery. Preview only. */
(()=>{'use strict';
const root=document.querySelector('#screen'),main=document.querySelector('#nav');if(!root||!main)return;
let profile='identity',schedule='lessons',study='tasks',busy=false;
const valid={profile:['identity','study','settings'],schedule:['lessons','calendar','insights','changes'],study:['tasks','session','notes','grades','attendance','focus']};
const active=()=>main.querySelector('button.active')?.dataset.page;
function setTabs(page,tab){
 const id=page==='profile'?'rb43-profile-tabs':'rb45-'+page,bar=document.getElementById(id);
 if(!bar)return;
 const attr=page==='profile'?'data-rb43-tab':'data-tab',section=page==='profile'?'data-rb43-section':'data-rb45-'+page;
 bar.querySelectorAll('button['+attr+']').forEach(b=>{const yes=b.getAttribute(attr)===tab;b.classList.toggle('active',yes);b.setAttribute('aria-selected',String(yes))});
 root.querySelectorAll('['+section+']').forEach(el=>{el.hidden=el.getAttribute(section)!==tab});
 if(page==='profile'){
  const style=root.querySelector('#rb40-slot');
  if(style){style.dataset.rb43Section='settings';style.hidden=tab!=='settings'}
 }
 if(page==='schedule'){
  // The calendar is a nested mode of the schedule page, not a replacement for lessons.
  const tools=root.querySelector('.schedule-tools');
  if(tools){tools.hidden=false;tools.removeAttribute('data-rb45-schedule')}
  if(tab==='lessons'){
   root.querySelectorAll('[data-rb45-schedule="lessons"]').forEach(el=>el.hidden=false);
   const daystrip=root.querySelector('.daystrip');daystrip?.closest('.card')?.removeAttribute('hidden');
  }
 }
}
function sync(){
 if(busy)return;busy=true;
 try{
  const page=active();
  if(page==='profile')setTabs('profile',profile);
  if(page==='schedule')setTabs('schedule',schedule);
  if(page==='study')setTabs('study',study);
 }finally{busy=false}
}
root.addEventListener('click',e=>{
 const p=e.target.closest('#rb43-profile-tabs button[data-rb43-tab]');
 const s=e.target.closest('#rb45-schedule button[data-tab]');
 const t=e.target.closest('#rb45-study button[data-tab]');
 if(p&&valid.profile.includes(p.dataset.rb43Tab)){profile=p.dataset.rb43Tab;setTabs('profile',profile)}
 if(s&&valid.schedule.includes(s.dataset.tab)){schedule=s.dataset.tab;setTabs('schedule',schedule)}
 if(t&&valid.study.includes(t.dataset.tab)){study=t.dataset.tab;setTabs('study',study)}
},true);
main.addEventListener('click',()=>requestAnimationFrame(sync));
new MutationObserver(()=>requestAnimationFrame(sync)).observe(root,{childList:true});
requestAnimationFrame(sync);
})();
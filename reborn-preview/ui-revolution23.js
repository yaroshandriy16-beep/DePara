/* DePara UI Revolution 2.3 — preview-only functional enhancements */
(()=>{'use strict';
const $=s=>document.querySelector(s),screen=$('#screen');if(!screen)return;
const current=()=>$('#nav button.active')?.dataset.page;
function home(){
 const root=screen.querySelector('.reborn-home');if(!root||root.dataset.ui23==='1')return;
 root.dataset.ui23='1';
 const headings=[...root.querySelectorAll('.home-section-head')];
 const day=headings.find(h=>h.querySelector('h2')?.textContent.includes('Пари на день'));
 const feature=root.querySelector('.home-feature');
 if(day&&feature){
  const panel=document.createElement('section');panel.className='ui23-day-panel';panel.id='ui23-day-panel';panel.setAttribute('aria-label','Пари на сьогодні');
  const header=document.createElement('div');header.className='ui23-day-panel-head';
  const name=document.createElement('strong');name.textContent='Пари на сьогодні';
  const count=document.createElement('span');count.className='ui23-day-count';
  const open=document.createElement('button');open.type='button';open.textContent='Весь розклад ↗';open.addEventListener('click',()=>$('#nav button[data-page="schedule"]')?.click());
  header.append(name,count,open);panel.append(header);
  let node=day.nextElementSibling,n=0;
  while(node&&!node.classList.contains('home-section-head')&&!node.classList.contains('home-shortcuts')&&!node.classList.contains('home-metrics')){
    const next=node.nextElementSibling;
    if(node.classList.contains('lesson')||node.classList.contains('empty')){if(node.classList.contains('lesson'))n++;panel.append(node)}
    else break;
    node=next;
  }
  count.textContent=n+' '+(n===1?'пара':n>=2&&n<=4?'пари':'пар');
  feature.after(panel);
  day.remove();
 }
 const overview=headings.find(h=>h.querySelector('h2')?.textContent.includes('Твій прогрес'));
 if(overview){
  const details=document.createElement('details');details.className='ui23-secondary';details.id='ui23-overview';
  const summary=document.createElement('summary');summary.textContent='Мій прогрес та додаткова інформація';
  details.append(summary);overview.before(details);
  let node=overview;
  while(node){
    const next=node.nextElementSibling;
    details.append(node);
    node=next;
  }
 }
}
function schedule(){
 if(current()!=='schedule'||$('#ui23-schedule-date'))return;
 const strip=screen.querySelector('.daystrip');
 if(!strip)return;
 const selected=strip.querySelector('button.active');
 const buttons=[...strip.querySelectorAll('button[data-day]')];
 const date=selected?.dataset.day||buttons[3]?.dataset.day;
 if(!date)return;
 const dateRow=document.createElement('div');dateRow.id='ui23-schedule-date';dateRow.className='ui23-schedule-header';
 const prev=document.createElement('button'),next=document.createElement('button'),label=document.createElement('span');
 prev.type=next.type='button';prev.textContent='← День';next.textContent='День →';label.className='ui23-date';
 const d=new Date(date+'T12:00:00');label.textContent=d.toLocaleDateString('uk-UA',{weekday:'short',day:'numeric',month:'long'});
 const move=offset=>{const d=new Date(date+'T12:00:00');d.setDate(d.getDate()+offset);const target=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');const button=strip.querySelector('[data-day="'+target+'"]');if(button)button.click();else{const week=screen.querySelector('#schedule-week');if(week){week.click();setTimeout(()=>screen.querySelector('[data-day="'+target+'"]')?.click(),0)}}};
 prev.addEventListener('click',()=>move(-1));next.addEventListener('click',()=>move(1));
 dateRow.append(prev,label,next);strip.before(dateRow);
}
function profile(){
 if(current()!=='profile')return;
 const tabs=$('#rb43-profile-tabs');if(!tabs)return;
 if(!$('#ui23-profile-label')){const label=document.createElement('div');label.id='ui23-profile-label';label.className='ui23-profile-label';label.textContent='Мій простір';tabs.before(label)}
 tabs.querySelectorAll('button').forEach(b=>b.setAttribute('aria-selected',String(b.classList.contains('active'))));
 const settings=$('#dp-v50-settings');if(settings)settings.querySelectorAll('[data-dp-setting]').forEach(b=>{b.style.touchAction='manipulation'});
}
let scheduled=false;
function run(){if(document.body.classList.contains('dp-teacher-active'))return;home();schedule();profile()}
function queue(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;run()})}
new MutationObserver(queue).observe(screen,{childList:true,subtree:false});
document.addEventListener('click',e=>{if(e.target.closest('#nav button,#rb43-profile-tabs button'))setTimeout(queue,0)});
run();
})();

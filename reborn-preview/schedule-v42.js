(()=>{'use strict';
const screen=document.querySelector('#screen');if(!screen)return;
const state={mode:'day',month:null,date:null,group:null,lessons:[],loading:false};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const key=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
const parse=s=>new Date(s+'T12:00:00'),fmt=(d,opt)=>d.toLocaleDateString('uk-UA',opt),shift=(d,n)=>new Date(d.getFullYear(),d.getMonth(),d.getDate()+n);
const group=()=>{try{return JSON.parse(localStorage.getItem('dp_reborn2_group'))||'3641'}catch{return '3641'}};
function syncDate(){const active=screen.querySelector('.daystrip [data-day].active');if(active?.dataset.day&&(!state.date||state.lastCore!==active.dataset.day)){state.date=parse(active.dataset.day);state.lastCore=active.dataset.day;if(!state.month)state.month=new Date(state.date.getFullYear(),state.date.getMonth(),1)}}
async function load(){const g=group();if(g===state.group)return;state.group=g;state.lessons=[];try{const res=await fetch('../data/groups/'+encodeURIComponent(g)+'.json');if(!res.ok)throw Error('HTTP '+res.status);const data=await res.json();if(g!==state.group)return;state.lessons=Array.isArray(data.lessons)?data.lessons:[]}catch(e){console.warn('Schedule 2.1:',e)}draw()}
function cards(list){if(!list.length)return '<div class="dp35-empty"><span>☀</span><b>Занять немає</b><p>На цю дату пар у розкладі немає.</p></div>';return list.map(l=>'<article class="dp35-lesson" tabindex="0" role="button" data-lesson-detail="'+esc([l.date||'',l.start||'',l.subject||''].join('|'))+'"><div class="dp35-time">'+esc(l.start||'—')+'<small>'+esc(l.end||'')+'</small></div><div class="dp35-class"><strong>'+esc(l.subject||'Заняття')+'</strong><p>'+esc([l.teacher||l.teachers||'',l.room?'ауд. '+l.room:''].filter(Boolean).join(' · '))+'</p><span>'+esc(l.type||'Пара')+'</span></div></article>').join('')}
function draw(){const panel=screen.querySelector('#dp35-schedule');if(!panel)return;const d=state.date||new Date(),m=state.month||new Date(d.getFullYear(),d.getMonth(),1),today=key(new Date()),selected=key(d);const groupName=screen.querySelector('.eyebrow')?.textContent||'ВНАУ';
panel.innerHTML='<div class="dp35-top"><div><small>'+esc(groupName)+'</small><h1>Розклад<span>.</span></h1><p>Твій навчальний тиждень</p></div><div class="dp35-symbol">▦</div></div><div class="dp35-modes">'+['day','week','month'].map((v,i)=>'<button data-dp35-mode="'+v+'" class="'+(state.mode===v?'active':'')+'">'+['День','Тиждень','Місяць'][i]+'</button>').join('')+'</div><section class="dp35-calendar"><div class="dp35-monthbar"><button data-dp35-prev aria-label="Попередній місяць">‹</button><b>'+esc(fmt(m,{month:'long',year:'numeric'}))+'</b><button data-dp35-today>Сьогодні</button><button data-dp35-next aria-label="Наступний місяць">›</button></div><div class="dp35-days">'+['Пн','Вт','Ср','Чт','Пт','Сб','Нд'].map(x=>'<span>'+x+'</span>').join('')+calendarDays(m,selected,today)+'</div></section><div class="dp35-daytitle"><div><h2>'+esc(state.mode==='month'?fmt(m,{month:'long',year:'numeric'}):state.mode==='week'?'Тиждень від '+fmt(shift(d,-((d.getDay()+6)%7)),{day:'numeric',month:'long'}):fmt(d,{weekday:'long',day:'numeric',month:'long'}))+'</h2><p>'+esc(subtitle(d,m))+'</p></div></div><div class="dp35-results">'+results(d,m)+'</div><button id="dp40-share" type="button">↗ Поділитися тижневим розкладом</button>';
}
function calendarDays(m,selected,today){const first=(m.getDay()+6)%7,last=new Date(m.getFullYear(),m.getMonth()+1,0).getDate(),dates=new Set(state.lessons.map(l=>l.date));let html='<i></i>'.repeat(first);for(let n=1;n<=last;n++){const v=key(new Date(m.getFullYear(),m.getMonth(),n));html+='<button data-dp35-date="'+v+'" class="'+(v===selected?'selected ':'')+(v===today?'today':'')+'"><b>'+n+'</b>'+(dates.has(v)?'<em></em>':'<em class="no-lesson"></em>')+'</button>'}return html}
function onDate(d){return state.lessons.filter(l=>l.date===key(d)).sort((a,b)=>(a.start||'').localeCompare(b.start||''))}
function subtitle(d,m){if(state.mode==='month')return state.lessons.filter(l=>l.date?.slice(0,7)===key(m).slice(0,7)).length+' занять цього місяця';if(state.mode==='week'){const start=shift(d,-((d.getDay()+6)%7));let n=0;for(let i=0;i<7;i++)n+=onDate(shift(start,i)).length;return n+' занять цього тижня'}const n=onDate(d).length;return n+' '+(n===1?'пара':n>=2&&n<=4?'пари':'пар')}
function results(d,m){
 if(state.mode==='month'){
  const year=m.getFullYear(),month=m.getMonth();
  const last=new Date(year,month+1,0).getDate();
  const days=[];
  for(let n=1;n<=last;n++){
   const day=new Date(year,month,n),list=onDate(day);
   if(!list.length)continue;
   days.push('<section class="dp35-weekday dp35-month-day"><h3>'+esc(fmt(day,{weekday:'long',day:'numeric',month:'short'}))+' <small>'+list.length+' '+(list.length===1?'пара':list.length>=2&&list.length<=4?'пари':'пар')+'</small></h3>'+cards(list)+'</section>');
  }
  return days.length?days.join(''):'<div class="dp35-empty"><b>У цьому місяці занять немає</b></div>';
 }
 if(state.mode==='week'){
  const start=shift(d,-((d.getDay()+6)%7));
  return Array.from({length:7},(_,i)=>{
   const day=shift(start,i),list=onDate(day);
   return '<section class="dp35-weekday"><h3>'+esc(fmt(day,{weekday:'long',day:'numeric',month:'short'}))+' <small>'+list.length+' '+(list.length===1?'пара':list.length>=2&&list.length<=4?'пари':'пар')+'</small></h3>'+(list.length?cards(list):'<p class="dp35-week-empty">Вільний день</p>')+'</section>'
  }).join('');
 }
 return cards(onDate(d));
}
function mount(){if(document.querySelector('#nav button.active')?.dataset.page!=='schedule'){screen.classList.remove('dp35-active');return}screen.classList.add('dp35-active');syncDate();if(!screen.querySelector('#dp35-schedule')){const panel=document.createElement('div');panel.id='dp35-schedule';screen.prepend(panel);draw();load()}}
screen.addEventListener('click',e=>{const b=e.target.closest('[data-dp35-mode],[data-dp35-date],[data-dp35-prev],[data-dp35-next],[data-dp35-today]');if(!b)return;
if(b.dataset.dp35Mode){state.mode=b.dataset.dp35Mode}
else if(b.dataset.dp35Date){state.date=parse(b.dataset.dp35Date);state.month=new Date(state.date.getFullYear(),state.date.getMonth(),1);state.mode='day';state.lastCore=key(state.date);window.dispatchEvent(new CustomEvent('dp34-select-date',{detail:{date:key(state.date)}}))}
else if(b.hasAttribute('data-dp35-prev'))state.month=new Date(state.month.getFullYear(),state.month.getMonth()-1,1);
else if(b.hasAttribute('data-dp35-next'))state.month=new Date(state.month.getFullYear(),state.month.getMonth()+1,1);
else if(b.hasAttribute('data-dp35-today')){state.date=new Date();state.month=new Date(state.date.getFullYear(),state.date.getMonth(),1);state.mode='day';state.lastCore=key(state.date);window.dispatchEvent(new CustomEvent('dp34-select-date',{detail:{date:key(state.date)}}))}
draw()});
let pending=false;new MutationObserver(()=>{if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;mount()})}).observe(screen,{childList:true,subtree:false});mount();
})();
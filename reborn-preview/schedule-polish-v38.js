(()=>{'use strict';
const screen=document.querySelector('#screen');if(!screen)return;
const pad=n=>String(n).padStart(2,'0'),iso=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()),parse=s=>new Date(s+'T12:00:00');
const minutes=s=>{const m=/^(\d{1,2}):(\d{2})$/.exec((s||'').trim());return m?Number(m[1])*60+Number(m[2]):null};
let lastPage='',start=null,queued=false;
function refresh(){
 const page=document.querySelector('#nav button.active')?.dataset.page;
 if(page!=='schedule')return;
 const panel=screen.querySelector('#dp35-schedule');if(!panel)return;
 const today=iso(new Date()),now=new Date(),currentMin=now.getHours()*60+now.getMinutes();
 const activeDay=panel.querySelector('.dp35-days button.selected')?.dataset.dp35Date||today;
 const mode=panel.querySelector('.dp35-modes button.active')?.dataset.dp35Mode||'day';
 panel.querySelectorAll('.dp35-weekday').forEach(section=>{
  const heading=section.querySelector('h3');
  const raw=heading?.textContent||'';
  section.classList.toggle('dp38-today',raw.toLowerCase().includes('сьогодні'));
 });
 panel.querySelectorAll('.dp35-lesson').forEach(card=>{
  card.classList.remove('dp38-current','dp38-past');
  let day=activeDay;
  const group=card.closest('.dp35-weekday');
  if(group){
   const heading=group.querySelector('h3')?.textContent||'';
   const match=heading.match(/(\d{1,2})\s+(січ|лют|бер|квіт|трав|черв|лип|серп|верес|жовт|листоп|груд)/i);
   if(match){
    const months=['січ','лют','бер','квіт','трав','черв','лип','серп','верес','жовт','листоп','груд'];
    const idx=months.findIndex(x=>match[2].toLowerCase().startsWith(x));
    const monthHeader=panel.querySelector('.dp35-monthbar b')?.textContent||'';
    const year=Number(monthHeader.match(/\d{4}/)?.[0])||now.getFullYear();
    if(idx>=0)day=iso(new Date(year,idx,Number(match[1])));
   }
  }
  if(day!==today)return;
  const time=card.querySelector('.dp35-time');
  const spans=time?.textContent?.match(/\d{1,2}:\d{2}/g)||[];
  const begin=minutes(spans[0]),end=minutes(spans[1]);
  if(begin===null||end===null)return;
  if(currentMin>=begin&&currentMin<end){card.classList.add('dp38-current');card.querySelector('.dp35-class')?.setAttribute('aria-label','Зараз триває заняття')}
  else if(currentMin>=end)card.classList.add('dp38-past');
 });
 if(lastPage!==page){lastPage=page}
}
function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;refresh()})}
new MutationObserver(schedule).observe(screen,{childList:true,subtree:true});
screen.addEventListener('touchstart',e=>{if(document.querySelector('#nav button.active')?.dataset.page!=='schedule'||!e.target.closest('#dp35-schedule'))return;const t=e.touches[0];start={x:t.clientX,y:t.clientY,target:e.target}}, {passive:true});
screen.addEventListener('touchend',e=>{
 if(!start)return;const a=start;start=null;const t=e.changedTouches[0];if(!t)return;
 const dx=t.clientX-a.x,dy=t.clientY-a.y;
 if(Math.abs(dx)<90||Math.abs(dx)<Math.abs(dy)*1.6)return;
 if(a.target.closest('button,.dp35-lesson'))return;
 const panel=screen.querySelector('#dp35-schedule');if(!panel)return;
 const mode=panel.querySelector('.dp35-modes button.active')?.dataset.dp35Mode;
 const direction=dx<0?1:-1;
 if(mode==='month'){panel.querySelector(direction===1?'[data-dp35-next]':'[data-dp35-prev]')?.click();return}
 const selected=panel.querySelector('.dp35-days button.selected')?.dataset.dp35Date||iso(new Date());
 const date=parse(selected);date.setDate(date.getDate()+direction*(mode==='week'?7:1));
 const next=iso(date);
 window.dispatchEvent(new CustomEvent('dp34-select-date',{detail:{date:next}}));
 // Keep the current mode by choosing the date through the core event, then update calendar selection on the new screen.
 const oldMode=mode;
 requestAnimationFrame(()=>{
  const p=screen.querySelector('#dp35-schedule');if(!p)return;
  const target=p.querySelector('[data-dp35-date="'+next+'"]');
  if(target&&oldMode==='day')target.click();
  else if(oldMode==='week'){const m=p.querySelector('[data-dp35-mode="week"]');if(m&&!m.classList.contains('active'))m.click()}
 });
},{passive:true});
document.querySelector('#nav')?.addEventListener('click',schedule);
schedule();
})();
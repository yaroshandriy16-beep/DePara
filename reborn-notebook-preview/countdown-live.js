/* Live lesson countdown for DePara Test 4.9. Display-only; no changes to schedule data. */
(()=>{'use strict';
const parse=(date,time)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!/^\d{1,2}:\d{2}$/.test(time||''))return null;const d=new Date(date+'T'+time.padStart(5,'0')+':00');return Number.isNaN(d.getTime())?null:d.getTime()};
const fmt=ms=>{const s=Math.max(0,Math.ceil(ms/1000));return String(Math.floor(s/3600)).padStart(2,'0')+':'+String(Math.floor(s%3600/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')};
let lastNode=null,lastPhase='';
function tick(){const box=document.querySelector('.reborn-home .home-feature'),target=document.getElementById('dp-live-lesson-clock');if(!box||!target)return;const date=box.dataset.lessonDate,start=parse(date,box.dataset.lessonStart),end=parse(date,box.dataset.lessonEnd),today=new Date(),todayKey=today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0');if(start===null||end===null||end<=start){if(target.textContent==='Відлік завантажується…')target.textContent='Час заняття не вказано';return}if(date!==todayKey&&start>Date.now()){target.textContent='До наступної пари: '+fmt(start-Date.now());return}if(date!==todayKey){target.textContent='Пара: '+box.dataset.lessonStart+'–'+box.dataset.lessonEnd+' · обраний день';return}
const now=Date.now(),phase=now<start?'before':now<end?'during':'after';const left=phase==='before'?start-now:phase==='during'?end-now:0;
if(lastNode!==target||lastPhase!==phase){lastNode=target;lastPhase=phase;target.innerHTML='<span class="dp-clock-label"></span><strong class="dp-clock-value"></strong><span class="dp-clock-secondary"></span>'}
const label=target.querySelector('.dp-clock-label'),value=target.querySelector('.dp-clock-value'),secondary=target.querySelector('.dp-clock-secondary');if(!label||!value||!secondary)return;
label.textContent=phase==='before'?'До початку пари':phase==='during'?'До завершення пари':'Пара завершилась';value.textContent=phase==='after'?'00:00:00':fmt(left);secondary.textContent=phase==='before'?'Початок о '+box.dataset.lessonStart:phase==='during'?'Закінчення о '+box.dataset.lessonEnd:'Перейди до наступної пари в розкладі';
const eyebrow=box.querySelector('.feature-eyebrow');if(eyebrow&&date===todayKey)eyebrow.textContent=phase==='before'?'ПОЧАТОК ЧЕРЕЗ':phase==='during'?'ЗАНЯТТЯ ТРИВАЄ':'ЗАНЯТТЯ ЗАВЕРШИЛОСЬ';
}
tick();setInterval(tick,1000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick()});
})();
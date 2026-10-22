(()=>{'use strict';
const screen=document.querySelector('#screen');if(!screen)return;
let lessons=[],lastGroup='';
const group=()=>{try{return JSON.parse(localStorage.getItem('dp_reborn2_group'))||'3641'}catch{return '3641'}};
async function load(){const g=String(group());if(g===lastGroup)return;lastGroup=g;try{const r=await fetch('../data/groups/'+encodeURIComponent(g)+'.json');if(!r.ok)throw Error(r.status);const j=await r.json();if(lastGroup===g)lessons=Array.isArray(j.lessons)?j.lessons:[]}catch(e){console.warn('Lesson detail data unavailable',e);lessons=[]}}
function open(card){const id=card.getAttribute('data-lesson-detail');if(!id)return;const [date,start,...rest]=id.split('|'),subject=rest.join('|');const matches=lessons.filter(l=>l.date===date&&l.start===start&&l.subject===subject);
const found=matches[0]||{date,start,subject,teacher:card.querySelector('.dp35-class p')?.textContent||'',type:card.querySelector('.dp35-class span')?.textContent||'',end:card.querySelector('.dp35-time small')?.textContent||''};
if(typeof window.DeParaShowLesson==='function')window.DeParaShowLesson(found);
}
screen.addEventListener('click',e=>{const card=e.target.closest('#dp35-schedule .dp35-lesson');if(card){e.stopPropagation();open(card)}},true);
screen.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('#dp35-schedule .dp35-lesson')){e.preventDefault();open(e.target)}},true);
document.querySelector('#nav')?.addEventListener('click',()=>{if(document.querySelector('#nav button.active')?.dataset.page==='schedule')load()});
load();
})();
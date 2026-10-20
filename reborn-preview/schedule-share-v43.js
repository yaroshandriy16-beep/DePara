(()=>{'use strict';
const screen=document.querySelector('#screen');if(!screen)return;
const pad=n=>String(n).padStart(2,'0'),iso=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()),add=(d,n)=>new Date(d.getFullYear(),d.getMonth(),d.getDate()+n);
const fmt=(d,o)=>d.toLocaleDateString('uk-UA',o),group=()=>{try{return JSON.parse(localStorage.getItem('dp_reborn2_group'))||'3641'}catch{return '3641'}};
const css=document.createElement('style');css.textContent=`#dp40-share{margin-top:12px;width:100%;border:1px solid rgba(233,198,124,.5);border-radius:14px;padding:13px;background:rgba(233,198,124,.12);color:#f4d895;font:700 14px system-ui}#dp40-modal{border:1px solid rgba(233,198,124,.22);background:#13231d;color:white;border-radius:24px;width:min(92vw,420px);max-height:88dvh;padding:18px;box-sizing:border-box;box-shadow:0 24px 70px #0008}#dp40-modal::backdrop{background:rgba(0,0,0,.75);backdrop-filter:blur(5px)}#dp40-modal .dp40-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px}#dp40-modal h3{margin:0;font-size:19px}#dp40-modal .dp40-sub{opacity:.7;font-size:12px;margin:0 0 12px}#dp40-modal img{display:block;width:100%;height:auto;max-height:43dvh;object-fit:contain;border-radius:14px;background:#091a12}#dp40-modal .dp40-actions{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:14px}#dp40-modal button,#dp40-modal a{min-width:0;display:flex;align-items:center;justify-content:center;border:1px solid rgba(233,198,124,.2);border-radius:13px;background:#253f32;color:#f6ead1;padding:12px 9px;font:700 13px system-ui;text-align:center;text-decoration:none;cursor:pointer}#dp40-modal #dp40-bot{grid-column:1/-1;background:#e9c67c;color:#14251c;font-size:15px;padding:15px 12px}#dp40-modal .dp40-close{flex:0 0 34px;width:34px;height:34px;padding:0;background:#31473c;color:#fff;font-size:18px;border-radius:50%}#dp40-modal button:disabled{opacity:.5;cursor:wait}@media(max-width:350px){#dp40-modal{padding:13px}#dp40-modal .dp40-actions{gap:6px}#dp40-modal button,#dp40-modal a{font-size:12px;padding:10px 6px}}`;document.head.append(css);
const dialog=document.createElement('dialog');dialog.id='dp40-modal';dialog.innerHTML='<div class="dp40-head"><h3>Поділитися розкладом</h3><button class="dp40-close" aria-label="Закрити">×</button></div><p class="dp40-sub">Тижневий розклад у форматі картинки</p><img alt="Попередній перегляд розкладу"><div class="dp40-actions"><button id="dp40-bot">↗ Надіслати в Telegram</button><button id="dp40-native">Поділитися картинкою</button><a id="dp40-save" download="depara-week.png">Зберегти картинку</a></div>';document.body.append(dialog);dialog.querySelector('.dp40-close').onclick=()=>dialog.close();dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});
let currentBlob=null;
function rounded(ctx,x,y,w,h,r,color){ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill()}
function wrap(ctx,text,max){const words=String(text||'').split(/\s+/),out=[];let line='';for(const w of words){const next=line?line+' '+w:w;if(ctx.measureText(next).width>max&&line){out.push(line);line=w}else line=next}if(line)out.push(line);return out}
async function make(){const p=screen.querySelector('#dp35-schedule'),chosen=p?.querySelector('.dp35-days button.selected')?.dataset.dp35Date;const selected=chosen?new Date(chosen+'T12:00:00'):new Date();const monday=add(selected,-((selected.getDay()+6)%7));const sunday=add(monday,6);
const r=await fetch('../data/groups/'+encodeURIComponent(String(group()))+'.json');if(!r.ok)throw Error('Не вдалося завантажити розклад');const data=await r.json(),all=Array.isArray(data.lessons)?data.lessons:[],days=Array.from({length:7},(_,i)=>{const d=add(monday,i);return{date:d,lessons:all.filter(l=>l.date===iso(d)).sort((a,b)=>(a.start||'').localeCompare(b.start||''))}}).filter(x=>x.lessons.length);
const W=960,scale=2,canvas=document.createElement('canvas');canvas.width=W*scale;const height=Math.max(850,300+days.reduce((n,d)=>n+96+d.lessons.reduce((s,l)=>{return s+Math.max(90,Math.ceil(String(l.subject||'').length/44)*33+53)},0),0)+90);canvas.height=height*scale;const ctx=canvas.getContext('2d');ctx.scale(scale,scale);
ctx.fillStyle='#071a12';ctx.fillRect(0,0,W,height);ctx.fillStyle='#163c2b';ctx.beginPath();ctx.arc(890,35,235,0,Math.PI*2);ctx.fill();ctx.fillStyle='#e9c67c';ctx.font='bold 36px system-ui';ctx.fillText('ДеПара?',48,72);ctx.fillStyle='#fff';ctx.font='bold 66px system-ui';ctx.fillText('Розклад на тиждень',48,155);ctx.fillStyle='#c4d5ca';ctx.font='28px system-ui';ctx.fillText(fmt(monday,{day:'numeric',month:'long'})+' — '+fmt(sunday,{day:'numeric',month:'long',year:'numeric'}),48,205);ctx.fillStyle='#e9c67c';ctx.font='bold 24px system-ui';ctx.fillText('Група '+String(data.meta?.group||data.group_name||data.group||group()),48,248);
let y=288;for(const day of days){rounded(ctx,38,y,W-76,64,14,'#244734');ctx.fillStyle='#f5e4b7';ctx.font='bold 27px system-ui';ctx.fillText(fmt(day.date,{weekday:'long',day:'numeric',month:'long'}),60,y+42);y+=77;for(const l of day.lessons){ctx.font='bold 26px system-ui';const lines=wrap(ctx,l.subject||'Заняття',680),h=Math.max(90,lines.length*33+53);rounded(ctx,38,y,W-76,h,13,'#173827');rounded(ctx,38,y,7,h,3,'#e9c67c');ctx.fillStyle='#e9c67c';ctx.font='bold 24px system-ui';ctx.fillText(String(l.start||'—'),60,y+38);ctx.fillStyle='#f6f7ef';ctx.font='bold 26px system-ui';lines.forEach((t,i)=>ctx.fillText(t,210,y+37+i*33));ctx.fillStyle='#b2c9bb';ctx.font='20px system-ui';const meta=[l.type,l.teacher||l.teachers,l.room?'ауд. '+l.room:''].filter(Boolean).join(' · ');const ml=wrap(ctx,meta,690);ctx.fillText((ml[0]||'').slice(0,100),210,y+h-17);y+=h+10}y+=16}
ctx.fillStyle='#8caf9a';ctx.font='21px system-ui';ctx.fillText('ДеПара? • ВНАУ',48,height-42);
return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Не вдалося створити зображення')),'image/png'))}
let url=null;async function show(){try{const btn=screen.querySelector('#dp40-share');if(btn)btn.disabled=true;currentBlob=await make();if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(currentBlob);dialog.querySelector('img').src=url;dialog.querySelector('#dp40-save').href=url;dialog.showModal()}catch(e){alert(e.message||'Помилка створення розкладу')}finally{const btn=screen.querySelector('#dp40-share');if(btn)btn.disabled=false}}
const SHARE_API=location.pathname.includes('/reborn-preview/')?'https://depara-api-preview.yaroshandriy16.workers.dev':'https://depara-api.yaroshandriy16.workers.dev';
dialog.querySelector('#dp40-bot').onclick=async()=>{
 const button=dialog.querySelector('#dp40-bot'),tg=window.Telegram?.WebApp;
 if(!tg?.initData||typeof tg.shareMessage!=='function'){alert('Відкрий ДеПара? у тестовому Telegram-боті, щоб надіслати розклад від імені бота. Картинкою можна поділитися тут.');return}
 button.disabled=true;
 try{
  const p=screen.querySelector('#dp35-schedule'),chosen=p?.querySelector('.dp35-days button.selected')?.dataset.dp35Date;
  const selected=chosen?new Date(chosen+'T12:00:00'):new Date(),monday=add(selected,-((selected.getDay()+6)%7));
  const response=await fetch('../data/groups/'+encodeURIComponent(String(group()))+'.json');
  if(!response.ok)throw Error('Не вдалося отримати розклад');
  const data=await response.json(),all=Array.isArray(data.lessons)?data.lessons:[];
  const lines=Array.from({length:7},(_,i)=>{const d=add(monday,i),ls=all.filter(l=>l.date===iso(d)).sort((a,b)=>(a.start||'').localeCompare(b.start||''));return fmt(d,{weekday:'long',day:'numeric',month:'short'})+'\n'+(ls.length?ls.map(l=>(l.start||'—')+' '+(l.subject||'Заняття')).join('\n'):'Пар немає')}).join('\n\n');
  const title='Розклад '+String(data.meta?.group||data.group_name||data.group||group())+' · '+iso(monday);
  if(lines.length>3200)throw Error('Розклад завеликий для текстового повідомлення. Скористайся кнопкою «Картинкою».');
  let imageBase64=null;
  if(currentBlob){
    try{
      const bitmap=await createImageBitmap(currentBlob);
      const canvas=document.createElement('canvas');
      canvas.width=bitmap.width;canvas.height=bitmap.height;
      canvas.getContext('2d').drawImage(bitmap,0,0);
      bitmap.close?.();
      const jpeg=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.86));
      if(jpeg&&jpeg.size<=2800000){
        const encoded=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('image read failed'));reader.readAsDataURL(jpeg)});
        imageBase64=String(encoded).split(',')[1]||null;
      }
    }catch(e){console.warn('JPEG share encoding failed',e)}
  }
  const prepared=await fetch(SHARE_API+'/api/share/prepare',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'tma '+tg.initData},body:JSON.stringify({title,schedule:lines,imageBase64})});
  const result=await prepared.json();if(!prepared.ok||!result.ok||!result.id)throw Error('Не вдалося підготувати повідомлення Telegram');
  if(result.mode!=='photo')alert('Telegram надіслав текст замість картинки: '+(result.photoError||'зображення недоступне')+'. Перевіримо причину.');
  tg.shareMessage(result.id,()=>{});
 }catch(e){alert(e.message||'Помилка надсилання через бота')}finally{button.disabled=false}
};
dialog.querySelector('#dp40-native').onclick=async()=>{if(!currentBlob)return;const file=new File([currentBlob],'depara-week.png',{type:'image/png'});if(navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file],title:'Розклад ДеПара?'})}catch(e){if(e.name!=='AbortError')alert('Не вдалося поділитися. Спробуй «Зберегти».')}}else{alert('На цьому пристрої обмін файлами недоступний. Натисни «Зберегти».')}};
let pending=false;function mount(){pending=false;if(document.querySelector('#nav button.active')?.dataset.page!=='schedule')return;const panel=screen.querySelector('#dp35-schedule');if(!panel)return;let b=panel.querySelector('#dp40-share');if(!b){b=document.createElement('button');b.id='dp40-share';b.textContent='↗ Поділитися тижневим розкладом';b.onclick=show}if(panel.lastElementChild!==b)panel.append(b);b.onclick=show}
new MutationObserver(()=>{if(!pending){pending=true;requestAnimationFrame(mount)}}).observe(screen,{childList:true,subtree:true});mount();
})();
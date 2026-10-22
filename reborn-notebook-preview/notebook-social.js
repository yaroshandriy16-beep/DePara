/* Isolated test notebook. Shared actions require signed Telegram authentication. */
(()=>{'use strict';
const API=window.DeParaNotebookApiBase||'https://depara-api-preview.yaroshandriy16.workers.dev/api/notebook/';
const LEGACY='depara_notebook_fresh_v1';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uuid=()=>crypto.randomUUID?.()||'n'+Date.now()+Math.random().toString(36).slice(2);
const get=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}};
const load=k=>get('dp_reborn2_'+k,null);
const $=s=>document.querySelector(s);
const active=()=>!!$('#nav [data-page="notebook"].active');
const gid=()=>String(load('group')||'3641');
const auth=()=>window.Telegram?.WebApp?.initData||'';
const owner=()=>String(window.Telegram?.WebApp?.initDataUnsafe?.user?.id||'local');
const draftKey=()=>owner()==='local'?LEGACY:'dp_reborn2_nb_drafts_'+owner();
const vis={private:'Лише я',friends:'Вибрані друзі',group:'Моя група',course:'Мій курс',faculty:'Мій факультет'};
const privacy={none:'Приховати',busy:'Зайнятий / вільний',subject:'Назва пари й час',room:'Пара, час та аудиторія',inherit:'Як у загальних налаштуваннях'};
const errors={AUTH_REQUIRED:'Для спільних функцій відкрий застосунок із Telegram-бота.',SESSION_EXPIRED:'Сесія Telegram закінчилася. Закрий і відкрий мініапп заново.',INVALID_AUTH:'Не вдалося перевірити вхід Telegram. Відкрий бота заново.',SERVICE_UNAVAILABLE:'Сервер тимчасово недоступний. Чернетки залишаються на пристрої.',FORBIDDEN:'Ця дія недоступна для твого облікового запису.',WAIT_48_HOURS:'Голосувати й висуватися можна після 48 годин у групі.',NEED_TWO_MEMBERS:'Для виборів потрібні щонайменше двоє учасників із правом голосу.',ELECTION_ACTIVE:'У групі вже триває голосування.',ELECTION_COOLDOWN:'Нове голосування можна почати через добу після попереднього.',FRIEND_NOT_FOUND:'Друга з таким кодом не знайдено. Він має відкрити вкладку «Зошит» у своєму боті.',REQUEST_EXISTS:'Запит уже існує. Перевір вхідні або вихідні запити.',NOTE_NOT_SHARED:'Адресати цього чату не мають доступу до конспекту. Спочатку зміни його видимість.',TOO_FAST:'Зачекай кілька секунд перед наступною дією.',MUTED:'Модератор тимчасово обмежив надсилання повідомлень.',TOO_LARGE:'Вкладення завеликі. Обери менший файл.',REVISION_CONFLICT:'Цей запис змінився на іншому пристрої. Твоя чернетка збережена; онови список і порівняй версії.',NOT_FRIEND:'Спочатку підтвердіть дружбу.',INVALID_DATE:'Перевір дату й час зустрічі.',NOTE_LIMIT:'Досягнуто ліміту 500 записів.',SCHEDULE_UNAVAILABLE:'Розклад друга зараз не вдалося завантажити.'};
let S={tab:'notes',subject:null,note:null,notes:[],drafts:get(draftKey(),[]),me:null,friends:[],channels:[],ready:false,loading:false,error:'',search:'',filter:'all',section:'note',thread:null,messages:[],reply:0,chatDraft:'',chatFiles:[],chatSearch:'',canModerate:false,election:null,electionData:null,invitations:[],friendDetail:null,availability:null,customSubjects:get('dp_reborn2_nb_subjects',[]),saving:false};
S.messageMenu=null;S.attachMenu=false;S.chatSearchOpen=false;S.direct=[];S.windows={};S.notePicker=null;S.editMessage=null;S.pins=[];S.topic='';
let booting=null,lastGroup=null,attemptedGroup=null,saveTimer,saveChain=Promise.resolve(),requestEpoch=0;
const edits=new Map(),deleting=new Set();
let pendingSaves=0;
Object.assign(errors,{INVALID_FIELD:'Вкажи назву запису перед збереженням.',LOCAL_STORAGE:'Не вдалося оновити локальне сховище. Перевір вільне місце й повтори дію.'});
function localNotes(){const d=get(draftKey(),[]);return Array.isArray(d)?d:[]}
function localStore(){try{localStorage.setItem(draftKey(),JSON.stringify(S.drafts));return true}catch{S.error='Не вистачає місця на пристрої. Збережи копію тексту.';return false}}
function persist(n){const at=S.drafts.findIndex(x=>x.id===n.id),copy=JSON.parse(JSON.stringify(n));if(at<0)S.drafts.unshift(copy);else S.drafts[at]=copy;return localStore()}
const noteMetaKey=()=> 'dp_reborn2_nb_meta_'+owner();
function noteMeta(id,patch){const data=get(noteMetaKey(),{});if(patch){data[id]={...data[id],...patch};localStorage.setItem(noteMetaKey(),JSON.stringify(data));}return data[id]||{};}
function listNotes(){const m=new Map(S.notes.map(n=>[n.id,n]));for(const d of S.drafts)if(!m.has(d.id)||d.dirty)m.set(d.id,d);return [...m.values()].map(n=>({...n,...noteMeta(n.id)})).sort((a,b)=>Number(!!b.pinned)-Number(!!a.pinned)||(b.updated_at||b.updated||0)-(a.updated_at||a.updated||0))}
const date=n=>new Date(n.updated_at||n.updated||n.created_at||n.created||Date.now()).toLocaleDateString('uk-UA',{day:'numeric',month:'short'});
const btn=(label,action,extra='',cls='')=>'<button type="button" class="nb-btn '+cls+'" data-action="'+action+'" '+extra+'>'+label+'</button>';
const icons={book:'M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-3H4z M20 4h-4a3 3 0 0 0-3 3 M13 18a4 4 0 0 1 4-1h3V4',chat:'M21 11a8 8 0 0 1-8 8H5l-4 3 2-7a8 8 0 1 1 18-4Z M7 10h10 M7 14h6',friends:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M20 21v-2a4 4 0 0 0-3-4 M16 3a4 4 0 0 1 0 8',arrow:'M5 12h14 M13 6l6 6-6 6',search:'M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',plus:'M12 5v14 M5 12h14',lock:'M5 10h14v11H5z M8 10V6a4 4 0 0 1 8 0v4',file:'M14 2H5v20h14V7z M14 2v6h5 M8 13h8 M8 17h5',school:'M3 10l9-7 9 7 M5 10v11h14V10 M9 21v-7h6v7',refresh:'M20 7v5h-5 M20 12a8 8 0 1 0-2 6',clock:'M12 8v5l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',shield:'M12 2l9 4v6c0 5-9 10-9 10S3 17 3 12V6z M8 12l3 3 5-6'};
Object.assign(icons,{back:'M19 12H5 M11 6l-6 6 6 6',more:'M5 12h.01 M12 12h.01 M19 12h.01',send:'M22 2L9 15 M22 2l-7 20-6-7-7-6z',clip:'M21 11l-8 8a6 6 0 0 1-9-9l9-9a4 4 0 0 1 6 6l-9 9a2 2 0 0 1-3-3l8-8',close:'M6 6l12 12 M6 18L18 6',reply:'M9 10L4 6l5-4 M4 6h9a7 7 0 0 1 7 7v7'});
const icon=(name,cls='')=>'<svg class="nb-icon '+cls+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+(icons[name]||icons.book)+'"/></svg>';
const empty=(text,name='book')=>'<div class="nb-empty"><span class="nb-empty-icon">'+icon(name)+'</span><p>'+esc(text)+'</p></div>';
const plural=(n,one,few,many)=>n+' '+(n%100>=11&&n%100<=14?many:n%10===1?one:n%10>=2&&n%10<=4?few:many);
const noteCount=n=>plural(n,'запис','записи','записів');
const initials=name=>String(name||'').trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('');
function noteCard(n){const preview=(n.body||'').replace(/\[\[image:\d+\]\]/g,'Фото').replace(/[*#=]/g,'');return '<button type="button" class="nb-card nb-full nb-note-card" data-action="note-open" data-id="'+esc(n.id)+'"><span class="nb-note-symbol">'+icon(n.kind==='task'?'clock':'file')+'</span><span class="nb-grow"><span class="nb-note-top"><span class="nb-eyebrow">'+esc(n.subject||'Особистий запис')+'</span><small>'+date(n)+'</small></span><strong class="nb-note-title">'+(n.pinned?'★ ':'')+esc(n.title||'Без назви')+'</strong><span class="nb-note-preview">'+esc((preview||'Додай головне з цієї пари…').slice(0,100))+'</span><span class="nb-row nb-note-meta"><span class="nb-badge">'+esc(n.kind==='task'?(n.done?'✓ Виконано':n.due&&n.due<kyivDate()?'Прострочено · '+n.due:'Д/з'+(n.due?' · '+n.due:'')):vis[n.visibility]||'Лише я')+'</span>'+(n.topic?'<small>'+esc(n.topic)+'</small>':'')+(n.author?'<small>'+esc(n.author)+'</small>':'')+(n.dirty?'<span class="nb-draft-dot" aria-label="Чернетка"></span>':'')+'</span></span></button>'}
function intro(kind){const meta={notes:['Твій простір для знань','Від першої думки до готового конспекту.'],chats:['Свої завжди поруч','Група, курс і факультет — в одному місці.'],friends:['Навчання краще разом','Знаходьте спільні вікна й діліться важливим.']}[kind];return '<div class="nb-intro"><div><span class="nb-eyebrow">'+(kind==='notes'?'ОСОБИСТА БІБЛІОТЕКА':kind==='chats'?'УНІВЕРСИТЕТ НА ЗВʼЯЗКУ':'ТВОЄ КОЛО')+'</span><h2>'+meta[0]+'</h2><p>'+meta[1]+'</p></div>'+icon(kind==='notes'?'book':kind==='chats'?'chat':'friends','nb-intro-icon')+'</div>'}
function markdown(s){return esc(s).replace(/^### (.+)$/gm,'<h3>$1</h3>').replace(/^## (.+)$/gm,'<h2>$1</h2>').replace(/^# (.+)$/gm,'<h2>$1</h2>').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/==([^=]+)==/g,'<mark>$1</mark>').replace(/\*([^*]+)\*/g,'<em>$1</em>')}
function toast(text){const t=$('#toast');if(!t)return;t.textContent=text;t.style.display='block';clearTimeout(window.nbToast);window.nbToast=setTimeout(()=>t.style.display='none',3500)}
async function api(route,method='GET',data){
 if(!auth())throw Error('AUTH_REQUIRED');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
 try{const response=await fetch(API+route,{method,headers:{Authorization:'tma '+auth(),...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{}),signal:controller.signal});const result=await response.json();if(!response.ok||!result.ok){const e=Error(result.error||'SERVICE_UNAVAILABLE');e.server=result.note;throw e}return result}finally{clearTimeout(timer)}
}
function messageError(e){return errors[e.message]||(e.name==='AbortError'?'Сервер відповідає довше звичайного. Спробуй ще раз.':'Не вдалося виконати дію. Перевір інтернет і повтори.')}
async function act(fn){if(S.loading)return;S.loading=true;S.error='';try{await fn()}catch(e){S.error=messageError(e)}finally{S.loading=false;draw()}}
async function bootstrap(){
 if(!auth()){S.drafts=localNotes();return}if(booting)return booting;
 const generation=++requestEpoch,group=gid();attemptedGroup=group;S.loading=true;
 booting=(async()=>{try{
  await api('profile','POST',{groupId:group});const data=await api('bootstrap');if(generation!==requestEpoch)return;
  S.me=data.me;S.friends=data.friends;S.channels=data.channels;S.direct=data.direct||[];S.ready=true;lastGroup=group;S.drafts=localNotes();
  await refreshNotes();const inv=await api('invitations');S.invitations=inv.invitations;S.error='';
 }catch(e){S.error=messageError(e)}finally{S.loading=false;booting=null;draw()}})();return booting;
}
async function refreshNotes(){const r=await api('notes');S.notes=r.notes;}
async function refreshFriends(){const d=await api('bootstrap');for(const f of d.friends)if(f.privacy!==S.friends.find(x=>x.id===f.id)?.privacy)delete S.windows[f.id];S.me=d.me;S.friends=d.friends;S.channels=d.channels;S.direct=d.direct||[];const inv=await api('invitations');S.invitations=inv.invitations;}
const kyivDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function kyivInstant(value){const [date,time]=value.split('T'),[y,m,d]=date.split('-').map(Number),[h,min]=time.split(':').map(Number),target=Date.UTC(y,m-1,d,h,min);let guess=target;for(let i=0;i<3;i++){const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(guess)).map(p=>[p.type,p.value]));guess+=target-Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute);}return new Date(guess);}
const lastPreview=(c,fallback)=>c?.last?(c.last.mine?'Ти: ':c.key.startsWith('dm:')?'':c.last.author+': ')+c.last.text:fallback;
const lastTime=c=>c?.last?new Date(c.last.at).toLocaleTimeString('uk-UA',{hour:'2-digit',minute:'2-digit'}):'';
function conversationRow(c,kind,subtitle,action='thread',extra=''){return btn('<span class="nb-channel-avatar nb-channel-'+kind+'">'+(kind==='dm'?esc(initials(c.title)):icon(kind==='faculty'?'school':kind==='course'?'book':'friends'))+'</span><span class="nb-grow"><span class="nb-chat-title"><strong>'+esc(c.title)+'</strong><time>'+lastTime(c)+'</time></span><span class="nb-chat-preview"><small>'+esc(lastPreview(c,subtitle))+'</small>'+(c.unread?'<span class="nb-unread" aria-label="Непрочитані">'+c.unread+'</span>':'')+'</span></span>',action,extra||'data-channel="'+esc(c.key)+'" data-title="'+esc(c.title)+'"','nb-full nb-chat-row');}
function ensure(){if(auth()&&!booting&&((!S.ready&&attemptedGroup!==gid())||(S.ready&&lastGroup!==gid())))void bootstrap()}
function subjects(){const cached=load('cachedSchedule_'+gid());return [...new Set([...(cached?.lessons||[]).map(l=>l.subject),...S.customSubjects,...listNotes().map(n=>n.subject)].filter(Boolean))].sort((a,b)=>a.localeCompare(b,'uk'))}
function filesHtml(files,context){return '<div class="nb-files">'+(files||[]).map((f,i)=>{const image=/^data:image\/(jpeg|png|webp);base64,/.test(f.data||'');if(context==='note'&&image&&S.note?.body.includes('[[image:'+i+']]'))return '';return '<div>'+(image?'<img alt="'+esc(f.name)+'" src="'+esc(f.data)+'" loading="lazy">':'')+btn('↓ '+esc(f.name),'download','data-context="'+context+'" data-index="'+i+'"')+'</div>'}).join('')+'</div>'}
function notesView(){
 if(S.note)return editorView();
 const all=listNotes().filter(n=>!n.deleted_at),allSubjects=subjects();
 let notes=all.filter(n=>S.subject===null||n.subject===S.subject);
 const search=S.search.trim().normalize('NFC').toLocaleLowerCase('uk');
 if(search)notes=notes.filter(n=>[n.title,n.subject,n.body].join(' ').normalize('NFC').toLocaleLowerCase('uk').includes(search));
 if(S.filter==='mine')notes=notes.filter(n=>!n.owner_id||n.owner_id===S.me?.id);if(S.filter==='shared')notes=notes.filter(n=>n.owner_id&&n.owner_id!==S.me?.id);
 if(S.filter==='pinned')notes=notes.filter(n=>n.pinned);if(S.filter==='recent')notes=notes.filter(n=>n.openedAt).sort((a,b)=>b.openedAt-a.openedAt);
 if(S.subject!==null&&S.topic)notes=notes.filter(n=>n.topic===S.topic);
 if(S.subject!==null)notes=notes.filter(n=>(n.kind||'note')===S.section);
 let out='';
 if(S.subject===null&&!S.search){out+='<div class="nb-library-hero"><div class="nb-hero-copy"><span class="nb-eyebrow">ДЛЯ ТВОЇХ ІДЕЙ</span><h2>Усе з пар.<br>Під рукою.</h2><p>Конспекти, завдання й матеріали до пар.</p>'+btn(icon('plus')+' Новий запис','note-new','data-nb="new"','nb-primary')+'</div><div class="nb-book-art" aria-hidden="true"><div class="nb-art-book nb-art-back"></div><div class="nb-art-book nb-art-front"><span>ДеПара?</span>'+icon('book')+'<small>МОЇ КОНСПЕКТИ</small></div><span class="nb-art-spark">✦</span></div></div><div class="nb-metrics"><span><strong>'+allSubjects.length+'</strong> предметів</span><span><strong>'+all.length+'</strong> записів</span><span>'+icon('lock')+' Твій простір</span></div>';}
 if(S.subject!==null)out+='<div class="nb-row nb-between nb-section-head">'+btn('← Предмети','subjects')+btn(icon('plus')+' Новий запис','note-new','','nb-primary')+'</div><div class="nb-subject-heading"><span class="nb-subject-icon">'+icon('book')+'</span><div><span class="nb-eyebrow">МІЙ ЗОШИТ</span><h2>'+esc(S.subject||'Без предмета')+'</h2><p class="nb-sub">'+noteCount(all.filter(n=>n.subject===S.subject).length)+'</p></div></div>';
 out+='<div class="nb-search-wrap">'+icon('search')+'<input id="nb-search" class="nb-search" type="search" aria-label="Пошук конспектів" placeholder="Знайти конспект або тему…" value="'+esc(S.search)+'"></div>';
 out+='<div class="nb-row nb-filters">'+[['all','Усе'],['mine','Мої'],['shared','Спільні'],['pinned','Закріплені'],['recent','Відкриті']].map(([k,v])=>btn(v,'filter','data-value="'+k+'" aria-pressed="'+(S.filter===k)+'"',S.filter===k?'nb-filter-active':'')).join('')+'</div>';
 if(S.subject!==null)out+='<div class="nb-tabs nb-kind-tabs">'+[['note','Записи'],['task','Д/з'],['material','Матеріали']].map(([k,v])=>'<button type="button" data-action="section" data-value="'+k+'" aria-selected="'+(S.section===k)+'">'+v+'</button>').join('')+'</div>';
 if(S.subject!==null){const topics=[...new Set(all.filter(n=>n.subject===S.subject).map(n=>n.topic).filter(Boolean))];if(topics.length)out+='<div class="nb-row nb-topics">'+btn('Усі теми','topic','data-value=""',!S.topic?'nb-filter-active':'')+topics.map(t=>btn(esc(t),'topic','data-value="'+esc(t)+'"',S.topic===t?'nb-filter-active':'')).join('')+'</div>';}
 if(S.subject===null&&!S.search&&['all','mine'].includes(S.filter)){
  out+='<div class="nb-row nb-between nb-section-head"><h2>Мої предмети <span>'+allSubjects.length+'</span></h2>'+btn(icon('plus'),'subject-new','aria-label="Додати свій предмет"','nb-icon-btn')+'</div><div class="nb-grid">'+allSubjects.map((s,i)=>'<button type="button" class="nb-card nb-subject-card nb-tone-'+(i%4)+'" data-action="subject" data-value="'+esc(s)+'"><span class="nb-subject-top"><span class="nb-subject-icon">'+icon('book')+'</span><span class="nb-subject-number">'+String(i+1).padStart(2,'0')+'</span></span><strong>'+esc(s)+'</strong><span class="nb-subject-bottom"><small>'+noteCount(all.filter(n=>n.subject===s).length)+'</small>'+icon('arrow')+'</span></button>').join('')+'</div>';
  if(!allSubjects.length)out+=empty('Предмети з розкладу з’являться тут автоматично. Або додай свій.');
  if(notes.length)out+='<div class="nb-row nb-between nb-section-head"><h2>Останні записи</h2>'+icon('clock')+'</div>';
 }
 out+='<div class="nb-stack">'+notes.map(noteCard).join('')+'</div>';
 if(!notes.length&&(S.subject!==null||S.search||S.filter==='shared'))out+=empty(S.search?'Нічого не знайшлося. Спробуй іншу назву або тему.':S.filter==='shared'?'Тут будуть конспекти, якими поділилися з тобою.':'Чиста сторінка для нової теми. Створи свій перший запис.');
 if(S.subject===null&&S.ready&&get(LEGACY,[]).length)out+='<div style="margin-top:16px">'+btn('Імпортувати попередні записи','legacy-import')+'</div>';
 return out;
}
function editorView(){
 const n=S.note,readOnly=!!(n.owner_id&&n.owner_id!==S.me?.id);
 let out='<div class="nb-editor-nav">'+btn('← До зошитів','note-back','data-nb="back"')+'<span class="nb-eyebrow">'+(readOnly?'СПІЛЬНИЙ КОНСПЕКТ':'МОЯ СТОРІНКА')+'</span></div>';
 if(readOnly)return out+'<div class="nb-card"><h2>'+esc(n.title)+'</h2><p class="nb-sub">'+esc(n.author||'Автор')+' · '+esc(n.subject)+' · '+esc(vis[n.visibility])+'</p><div class="nb-note nb-rich-read">'+window.DeParaNoteEditor.render(n.body,n.attachments)+'</div>'+filesHtml(n.attachments,'note')+btn('Зберегти власну копію','note-copy','','nb-primary')+'</div>';
 out+='<div class="nb-editor"><label for="nb-subject">Предмет</label><input id="nb-subject" list="nb-subject-options" value="'+esc(n.subject||'')+'" maxlength="180"><datalist id="nb-subject-options">'+subjects().map(s=>'<option value="'+esc(s)+'">').join('')+'</datalist>';
 out+='<label for="dp-nb-title">Назва</label><input id="dp-nb-title" value="'+esc(n.title)+'" maxlength="120" placeholder="Тема заняття">';
 out+='<div class="nb-row nb-note-tools">'+btn(noteMeta(n.id).pinned?'★ Закріплено':'☆ Закріпити','note-pin')+'<span class="nb-sub">'+(n.body||'').replace(/\[\[image:\d+\]\]/g,'').trim().split(/\s+/).filter(Boolean).length+' слів</span></div><div class="nb-toolbar" role="toolbar" aria-label="Форматування тексту">'+[['Ж','**'],['К','*'],['Маркер','=='],['Заголовок','# '],['• Список','- '],['1. Список','1. ']].map(([label,v])=>btn(label,'format','data-value="'+esc(v)+'" aria-label="'+esc(label==='Ж'?'Жирний':label==='К'?'Курсив':label)+'"')).join('')+'</div><label for="dp-nb-body">Записи</label><div id="dp-nb-body" class="nb-rich-editor" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Записи" data-placeholder="Почни писати тут…">'+window.DeParaNoteEditor.render(n.body,n.attachments)+'</div>';
 out+='<label for="nb-topic">Тема або модуль</label><input id="nb-topic" maxlength="100" placeholder="Наприклад, Модуль 1" value="'+esc(noteMeta(n.id).topic||'')+'"><small class="nb-sub">Теми й закріплення впорядковують твої записи на цьому пристрої.</small>';
 out+='<label class="nb-check" '+(n.kind==='task'?'':'hidden')+'><input id="nb-done" type="checkbox" '+(n.done?'checked':'')+'> Завдання виконано</label>'+filesHtml(n.attachments,'note')+btn('＋ Фото або файл','note-file')+'<input id="nb-file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.doc,.docx,.ppt,.pptx,.txt" hidden><p class="nb-sub">До 3 вкладень, разом до 500 КБ. Фото стискаються автоматично.</p>';
 out+='<div class="nb-row"><div class="nb-grow"><label for="nb-kind">Тип запису</label><select id="nb-kind">'+[['note','Конспект'],['task','Домашнє завдання'],['material','Матеріал']].map(([k,v])=>'<option value="'+k+'" '+(n.kind===k?'selected':'')+'>'+v+'</option>').join('')+'</select></div><div class="nb-grow"><label for="nb-due">Дата здачі, якщо потрібна</label><input id="nb-due" type="date" value="'+esc(n.due||'')+'"></div></div>';
 out+='<label for="nb-visibility">Хто бачить</label><select id="nb-visibility">'+Object.entries(vis).map(([k,v])=>'<option value="'+k+'" '+(n.visibility===k?'selected':'')+'>'+v+'</option>').join('')+'</select>';
 if(n.visibility==='friends')out+='<div>'+S.friends.filter(f=>f.state==='accepted').map(f=>'<label class="nb-check"><input type="checkbox" data-audience="'+f.id+'" '+((n.audience||[]).includes(f.id)?'checked':'')+'>'+esc(f.name)+'</label>').join('')+'</div>';
 out+='<p class="nb-sub">'+scopeLabel(n.visibility)+'</p><span id="dp-nb-status" class="nb-status" role="status">'+(S.saving?'Збереження…':n.dirty?'Чернетку збережено на пристрої':'Збережено')+'</span><div class="nb-row">'+btn(n.visibility==='private'?'Зберегти':'Зберегти й опублікувати','note-save','','nb-primary')+btn('Видалити запис','note-delete','','nb-danger')+'</div>';
 if(n.attachments?.length)out+='<details><summary>Видалення вкладень</summary>'+n.attachments.map((f,i)=>btn('× '+esc(f.name),'file-remove','data-index="'+i+'"')).join('')+'</details>';
 if(S.error?.includes('іншому пристрої'))out+=btn('Завантажити актуальну версію','note-reload');
 return out+'</div>';
}
function scopeLabel(level){const g=S.me?.group;return level==='private'?'Запис доступний лише тобі.':level==='friends'?'Доступ отримають лише вибрані підтверджені друзі.':level==='group'?'Побачать учасники '+(g?.name||load('groupName')||'твоєї групи')+'.':level==='course'?'Побачить '+(g?.course||'твій')+' курс · '+(g?.faculty||'твій факультет')+'.':'Побачать усі курси · '+(g?.faculty||'твій факультет')+'.'}
function chatsView(){
 if(S.thread)return threadView();
 if(!S.ready)return intro('chats')+empty('Увійди через Telegram, щоб бути на зв’язку зі своїми.','chat');
 const g=S.me.group,sort=(a,b)=>(b.last?.at||0)-(a.last?.at||0),communities=S.channels.filter(c=>!c.key.startsWith('subject:')).sort(sort);
 const subjectChannels=[...new Map([...subjects().map(s=>({key:'subject:'+g.id+':'+encodeURIComponent(s),title:s})),...S.channels.filter(c=>c.key.startsWith('subject:'))].map(c=>[c.key,c])).values()].sort(sort);
 let out=intro('chats')+'<div class="nb-row nb-between nb-section-head"><h2>Твої спільноти</h2><span class="nb-eyebrow">'+communities.length+' ЧАТИ</span></div><div class="nb-chat-list">'+communities.map(c=>conversationRow(c,c.key.split(':')[0],'Почни розмову зі своїми')).join('')+'</div>';
 out+='<details class="nb-disclosure"><summary>'+icon('book')+'<span>Предмети · '+subjectChannels.length+'</span></summary><div class="nb-chat-list">'+subjectChannels.map(c=>conversationRow(c,'subject','Обговорення предмета')).join('')+'</div></details><div class="nb-section-head"><h2>Особисті розмови</h2></div><div class="nb-chat-list">'+S.friends.filter(f=>f.state==='accepted').map(f=>S.direct.find(c=>c.friendId===f.id)||{key:'dm:'+ [S.me.id,f.id].sort().join(':'),title:f.name,friendId:f.id}).sort(sort).map(c=>conversationRow(c,'dm','Напиши першим','dm','data-id="'+c.friendId+'"')).join('')+(S.friends.some(f=>f.state==='accepted')?'':empty('Додай друзів — і починай особисті розмови.','chat'))+'</div>';
 out+='<details class="nb-disclosure"><summary>'+icon('shield')+'<span>Староста й модерація</span></summary>'+electionView()+'</details>';return out;
}
function electionView(){const d=S.electionData,e=d?.election;let out='<p class="nb-sub">Староста модерує чат своєї групи та її предметів, а також чати свого курсу й факультету. Приватні записи й особисті чати йому недоступні.</p>';
 if(!d)return out+btn('Переглянути вибори','elections-load');
 out+='<p>Староста: <strong>'+esc(d.leader?.name||'Ще не обраний')+'</strong></p>';
 if(e)out+='<div class="nb-card"><h3>'+(e.action==='remove'?'Зняття з ролі: ':'Кандидат: ')+esc(e.candidate||'Студент')+'</h3><p class="nb-sub">'+(e.state==='open'?'До '+new Date(e.ends_at).toLocaleString('uk-UA'):e.state==='cancelled'?'Скасовано: кандидат змінив групу.':e.winner?'Рішення прийнято.':'Голосування завершено без прийняття рішення.')+'</p><div class="nb-row"><span>За: '+(e.tally.yes||0)+'</span><span>Проти: '+(e.tally.no||0)+'</span><span>Учасників: '+e.tally.total+'</span></div>'+(e.state==='open'&&e.eligible?'<div class="nb-row">'+btn('За','vote','data-yes="true" aria-pressed="'+(e.vote===1)+'"')+btn('Проти','vote','data-yes="false" aria-pressed="'+(e.vote===0)+'"')+'</div>':'')+'</div>';
 if(!e||e.state!=='open')out+='<div class="nb-row">'+btn('Висунути себе','election-start','data-value="elect"')+(d.leader?btn('Голосування про зняття','election-start','data-value="remove"'):'')+'</div>';
 return out+'<details><summary>Правила тестових виборів</summary><p class="nb-rules">Право голосу — через 48 годин у вибраній групі. Голосування триває 48 годин; склад виборців фіксується на початку. Потрібні щонайменше 2 виборці, участь половини та більше «За», ніж «Проти». Голос можна змінити до завершення. Нічия — рішення не прийнято. Нові вибори — не раніше ніж через добу. Зміна групи скидає очікування та права. Це роль у застосунку, не офіційне призначення університету.</p></details>';}
function threadView(){
 let ms=S.messages;
 const kind=S.thread.key.split(':')[0],scope={group:'Чат твоєї групи',subject:'Предмет · '+S.me.group.name,course:'Чат твого курсу',faculty:'Чат факультету',dm:'Особиста розмова'}[kind]||'Спільнота';
 let out='<div class="nb-thread"><header class="nb-thread-header">'+btn(icon('back'),'thread-back','aria-label="Назад до чатів"','nb-chat-icon')+'<span class="nb-thread-avatar">'+(kind==='dm'?esc(initials(S.thread.title)):icon(kind==='faculty'?'school':'friends'))+'</span><div class="nb-grow"><h2>'+esc(S.thread.title)+'</h2><span>'+esc(scope)+'</span></div><details class="nb-thread-options"><summary aria-label="Меню чату">'+icon('more')+'</summary><div>'+btn(icon('search')+' Пошук','thread-search')+btn(icon('refresh')+' Оновити','thread-refresh')+(kind==='group'?btn(icon('shield')+' Староста й вибори','thread-election'):'')+'</div></details></header>';
 if(S.chatSearchOpen)out+='<div class="nb-thread-search"><input id="nb-chat-search" type="search" placeholder="Пошук у повідомленнях" aria-label="Пошук повідомлень" value="'+esc(S.chatSearch)+'">'+btn(icon('close'),'thread-search-close','aria-label="Закрити пошук"','nb-chat-icon')+'</div>';
 if(S.threadElection)out+='<div class="nb-thread-election">'+btn('Закрити','thread-election')+electionView()+'</div>';
 const pins=S.pins.length?S.pins:S.messages.filter(m=>m.pinned&&!m.deleted);if(pins.length)out+='<details class="nb-thread-pins"><summary><strong>Закріплені повідомлення · '+pins.length+'</strong><span>'+esc(pins[0].body.slice(0,90))+'</span></summary>'+pins.map(m=>btn(esc(m.body.slice(0,150)),'message-jump','data-id="'+m.id+'"')).join('')+'</details>';
 if(S.chatSearch)out+='<div class="nb-search-result-label">Знайдено '+ms.length+(ms.length===60?'+':'')+' · '+btn('Повернутися до переписки','thread-search-close')+'</div>';
 out+='<div id="nb-message-list" class="nb-thread-scroll" aria-label="Повідомлення">';
 if(S.messages.length>=60)out+='<div class="nb-history">'+btn('Попередні повідомлення','messages-older')+'</div>';
 let previousDay='';
 out+=ms.map(m=>{
  const mine=m.author_id===S.me.id,quoted=S.messages.find(x=>x.id===m.reply_id),day=new Date(m.created_at).toLocaleDateString('uk-UA',{day:'numeric',month:'long',year:new Date(m.created_at).getFullYear()===new Date().getFullYear()?undefined:'numeric'}),separator=day!==previousDay?'<div class="nb-date-separator"><span>'+esc(day)+'</span></div>':'';previousDay=day;
  return separator+'<div class="nb-bubble-row '+(mine?'nb-own-row':'')+'">'+(!mine&&kind!=='dm'?'<span class="nb-sender-avatar" aria-hidden="true">'+esc(initials(m.name))+'</span>':'')+'<article class="nb-message '+(mine?'nb-mine ':'')+(m.pinned?'nb-pinned':'')+'" data-message-id="'+m.id+'">'+(!mine&&kind!=='dm'?'<div class="nb-message-name">'+esc(m.name)+(kind==='course'||kind==='faculty'?' · '+esc(m.group):'')+(m.isLeader?' · Староста':'')+'</div>':'')+(quoted?'<div class="nb-reply"><strong>'+esc(quoted.name)+'</strong><span>'+esc(quoted.body.slice(0,100))+'</span></div>':'')+'<div class="nb-message-body">'+esc(m.body)+'</div>'+filesHtml(m.attachments,'message-'+m.id)+(m.note_id?btn(icon('file')+' Відкрити конспект','note-from-chat','data-id="'+esc(m.note_id)+'"'):'')+'<div class="nb-message-footer">'+(S.chatSearch?btn('До повідомлення','message-jump','data-id="'+m.id+'"'):'')+(m.pinned?'<span aria-label="Закріплено">⌖</span>':'')+'<time class="nb-message-time" datetime="'+esc(new Date(m.created_at).toISOString())+'">'+(m.edited_at?'змінено ':'')+new Date(m.created_at).toLocaleTimeString('uk-UA',{hour:'2-digit',minute:'2-digit'})+'</time></div>'+((m.reactions||[]).length?'<div class="nb-reactions">'+m.reactions.map(r=>btn(r.emoji+' '+r.total,'react','data-id="'+m.id+'" data-emoji="'+r.emoji+'" aria-pressed="'+!!r.mine+'"')).join('')+'</div>':'')+(m.deleted?'':btn(icon('more'),'message-menu','data-id="'+m.id+'" aria-label="Дії з повідомленням"','nb-bubble-more'))+'</article></div>';
 }).join('')+(ms.length?'':empty(S.chatSearch?'Повідомлень не знайдено.':'Тут починається ваша розмова. Напиши першим.','chat'))+'</div>';
 const quote=S.messages.find(m=>m.id===S.reply);
 out+='<form id="nb-compose" class="nb-compose">'+(quote?'<div class="nb-compose-reply">'+icon('reply')+'<div class="nb-grow"><strong>'+esc(quote.name)+'</strong><span>'+esc(quote.body.slice(0,100))+'</span></div>'+btn(icon('close'),'reply-clear','aria-label="Скасувати відповідь"','nb-chat-icon')+'</div>':'')+(S.chatFiles.length?filesHtml(S.chatFiles,'chat'):'')+(S.attachMenu?'<div class="nb-attach-menu">'+btn(icon('clip')+' Фото або файл','chat-file')+btn(icon('book')+' Поділитися конспектом','chat-note')+'</div>':'')+'<div class="nb-compose-bar">'+btn(icon('clip'),'chat-attachments','aria-label="Додати вкладення" aria-expanded="'+S.attachMenu+'"','nb-chat-icon')+'<div class="nb-input-wrap"><label for="nb-message" class="nb-sr-only">Повідомлення</label><textarea id="nb-message" rows="1" maxlength="4000" placeholder="Повідомлення">'+esc(S.chatDraft)+'</textarea></div><button type="submit" data-action="message-send" class="nb-btn nb-send" aria-label="Надіслати" '+(S.loading?'disabled':'')+'>'+icon('send')+'</button></div><input type="file" id="nb-chat-file" accept="image/jpeg,image/png,image/webp,application/pdf,.doc,.docx,.txt" hidden></form>';
 if(S.editMessage)out=out.replace('<form id="nb-compose" class="nb-compose">','<form id="nb-compose" class="nb-compose"><div class="nb-compose-reply"><div class="nb-grow"><strong>Редагування повідомлення</strong><span>Зміни текст і збережи</span></div>'+btn(icon('close'),'edit-cancel','aria-label="Скасувати редагування"','nb-chat-icon')+'</div>').replace('aria-label="Надіслати"','aria-label="Зберегти зміни"');
 return out+'</div>'+messageMenuView()+notePickerView();
}
function notePickerView(){const picker=S.notePicker;if(!picker)return '';const notes=picker.notes.filter(n=>(n.title+' '+n.subject).toLocaleLowerCase('uk').includes(picker.search.toLocaleLowerCase('uk')));return '<div class="nb-note-picker" role="dialog" aria-modal="true" aria-label="Поділитися конспектом"><div class="nb-picker-panel"><div class="nb-row nb-between"><h2>Поділитися конспектом</h2>'+btn(icon('close'),'picker-close','aria-label="Закрити вибір конспекту"')+'</div><p class="nb-sub">Для '+esc(picker.title)+'. Показані лише записи, до яких адресати мають доступ.</p><input id="nb-picker-search" type="search" placeholder="Знайти конспект…" aria-label="Пошук конспекту для надсилання" value="'+esc(picker.search)+'"><div class="nb-stack">'+notes.map(n=>btn('<span>'+icon('file')+'</span><span class="nb-grow"><strong>'+esc(n.title)+'</strong><small>'+esc(n.subject)+' · '+esc(vis[n.visibility])+'</small></span>','picker-send','data-id="'+esc(n.id)+'"','nb-picker-note')).join('')+(notes.length?'':empty('Немає доступних записів. Спочатку відкрий потрібний конспект і зміни його видимість.'))+'</div></div></div>';}
async function openNotePicker(channel,title){const result=await api('notes/shareable?channel='+encodeURIComponent(channel));S.notePicker={channel,title,notes:result.notes,search:''};}
function windowPreview(f){const a=S.windows[f.id];if(f.privacy==='none'||a?.hidden)return 'Розклад приховано другом';if(a?.error)return 'Розклад зараз недоступний';if(a?.date===kyivDate()&&a.common?.length)return 'Спільне вікно '+a.common[0].start+'–'+a.common[0].end;return f.status||'Знайти спільне вікно';}
function windowsView(a){if(a.hidden)return '<p class="nb-sub">Друг приховав свій розклад.</p>';return '<div class="nb-row nb-between"><h3>Спільні вікна</h3><small>Час за Києвом</small></div><label for="nb-window-date">Вибери день</label><input id="nb-window-date" type="date" min="'+kyivDate()+'" value="'+esc(a.date||kyivDate())+'"><div class="nb-window-list">'+(a.common||[]).map(w=>btn('<span>'+icon('clock')+'<strong>'+esc(w.start)+'–'+esc(w.end)+'</strong></span><small>Запросити зустрітися →</small>','window-invite','data-start="'+esc(w.start)+'" data-date="'+esc(a.date)+'"','nb-window-chip')).join('')+((a.common||[]).length?'':'<p class="nb-sub">На цей день спільних вікон від 20 хвилин до 20:00 немає. Перевір інший день.</p>')+'</div><p class="nb-sub">'+esc(a.notice||'За розкладом, не фактичне місцеперебування')+'</p>';}
function messageMenuView(){
 const m=S.messages.find(x=>x.id===S.messageMenu);if(!m||m.deleted)return '';const mine=m.author_id===S.me.id;
 return '<div class="nb-message-overlay">'+btn('','message-menu-close','aria-label="Закрити дії"','nb-menu-scrim')+'<div class="nb-message-sheet" role="dialog" aria-modal="true" aria-label="Дії з повідомленням"><div class="nb-sheet-handle"></div><div class="nb-quick-reactions">'+['👍','❤️','🔥','😂','😮','👎'].map(emoji=>btn(emoji,'react','data-id="'+m.id+'" data-emoji="'+emoji+'" aria-label="Реакція '+emoji+'"')).join('')+'</div><p class="nb-menu-preview">'+esc(m.body.slice(0,110)||'Вкладення')+'</p>'+btn(icon('reply')+' Відповісти','reply','data-id="'+m.id+'"')+btn('Скопіювати текст','message-copy','data-id="'+m.id+'"')+(mine?btn('Редагувати','message-edit','data-id="'+m.id+'"'):'')+(mine||S.canModerate?btn('Видалити','message-delete','data-id="'+m.id+'"','nb-danger'):'')+(S.canModerate?btn(m.pinned?'Відкріпити':'Закріпити','message-pin','data-id="'+m.id+'"')+(!mine&&!m.isLeader?btn('Обмежити на 1 год','message-mute','data-id="'+m.id+'"'):''):'')+btn('Скасувати','message-menu-close','','nb-menu-cancel')+'</div></div>';
}
function friendsView(){
 if(!S.ready)return intro('friends')+empty('Увійди через Telegram, щоб додати друзів і знаходити спільні вікна.','friends');
 if(S.friendDetail)return friendView();
 const accepted=S.friends.filter(f=>f.state==='accepted').sort((a,b)=>Number(b.favorite)-Number(a.favorite)||a.name.localeCompare(b.name,'uk'));
 let out=intro('friends')+'<div class="nb-invite-banner"><span class="nb-invite-emblem">'+icon('friends')+'</span><div><span class="nb-eyebrow">ЗАПРОСИ СВОЇХ</span><h3>Побачимось між парами?</h3><p>Додай друга, щоб знайти час для зустрічі.</p></div></div><details class="nb-disclosure nb-add-friend"><summary>'+icon('plus')+'<span>Мій код і запрошення друга</span></summary><div class="nb-card"><div class="nb-code">'+esc(S.me.friend_code)+'</div><p class="nb-sub">Друг вводить код і надсилає запит. Після підтвердження ви стаєте друзями.</p>'+btn('Скопіювати код','friend-code')+'<label for="nb-friend-code">Код друга</label><input id="nb-friend-code" placeholder="Код із 12 символів" maxlength="32">'+btn('Надіслати запит','friend-request')+'</div></details>';
 const requests=S.friends.filter(f=>f.state==='pending');if(requests.length)out+='<h2>Запити</h2><div class="nb-stack">'+requests.map(f=>'<div class="nb-card"><strong>'+esc(f.name)+'</strong><p class="nb-sub">'+(f.incoming?'Хоче додати тебе в друзі':'Очікує підтвердження')+'</p>'+(f.incoming?'<div class="nb-row">'+btn('Прийняти','friend-respond','data-id="'+f.id+'" data-accept="true"','nb-primary')+btn('Відхилити','friend-respond','data-id="'+f.id+'" data-accept="false"')+'</div>':'')+'</div>').join('')+'</div>';
 out+='<div class="nb-row nb-between nb-section-head"><h2>Мої друзі <span>'+accepted.length+'</span></h2>'+btn(icon('clock')+' Спільний час','friends-windows')+'</div><div class="nb-stack">'+accepted.map(f=>'<article class="nb-card nb-friend-card"><button class="nb-friend-open" type="button" data-action="friend-open" data-id="'+f.id+'"><span class="nb-avatar">'+esc(initials(f.name))+'</span><span class="nb-grow"><strong>'+(f.favorite?'★ ':'')+esc(f.name)+'</strong><span class="nb-sub">'+esc(windowPreview(f))+'</span></span>'+icon('arrow','nb-channel-arrow')+'</button><div class="nb-row nb-friend-actions">'+btn('Написати','dm','data-id="'+f.id+'"')+btn('Конспект','friend-share','data-id="'+f.id+'"')+'</div></article>').join('')+(accepted.length?'':empty('Тут будуть твої люди. Запроси першого друга за кодом.','friends'))+'</div>';
 out+='<details class="nb-disclosure"><summary>'+icon('lock')+'<span>Хто бачить мій розклад і статус</span></summary><label for="nb-global-privacy">Видимість для друзів</label><select id="nb-global-privacy">'+Object.entries(privacy).filter(([k])=>k!=='inherit').map(([k,v])=>'<option value="'+k+'" '+(S.me.privacy===k?'selected':'')+'>'+v+'</option>').join('')+'</select><p class="nb-sub">Це інформація за розкладом, не геолокація. Для окремого друга можна задати інший доступ.</p><label for="nb-my-status">Мій статус</label><input id="nb-my-status" maxlength="100" value="'+esc(S.me.status_until>Date.now()?S.me.status:'')+'" placeholder="Наприклад, шукаю компанію на обід"><label for="nb-status-hours">Прибрати через</label><select id="nb-status-hours"><option value="1">1 годину</option><option value="3">3 години</option><option value="24">24 години</option></select>'+btn('Зберегти','friend-privacy','','nb-primary')+'</details>';
 out+='<details class="nb-disclosure"><summary>Запрошення зустрітися · '+S.invitations.filter(i=>i.receiver_id===S.me.id&&i.state==='pending').length+'</summary>'+invitationsView()+'</details>';return out+notePickerView();
}
function invitationsView(){return '<div class="nb-stack">'+S.invitations.map(i=>'<div class="nb-card"><strong>'+esc(i.sender_id===S.me.id?'Для '+i.receiver_name:'Від '+i.sender_name)+'</strong><p>'+esc(i.place)+' · '+esc(new Date(i.starts_at).toLocaleString('uk-UA'))+'</p><p class="nb-sub">'+({pending:'Очікує відповіді',accepted:'Прийнято',declined:'Відхилено'}[i.state]||i.state)+'</p>'+(i.receiver_id===S.me.id&&i.state==='pending'?'<div class="nb-row">'+btn('Прийняти','invite-respond','data-id="'+i.id+'" data-value="accepted"')+btn('Відхилити','invite-respond','data-id="'+i.id+'" data-value="declined"')+'</div>':'')+'</div>').join('')+(S.invitations.length?'':empty('Запрошень поки немає.'))+'</div>'}
function friendView(){const f=S.friends.find(x=>x.id===S.friendDetail);if(!f)return empty('Друга більше немає у списку.');const a=S.availability;
 let out=btn('← Друзі','friend-back')+'<h2>'+esc(f.name)+'</h2>'+(f.status?'<p>'+esc(f.status)+'</p>':'')+'<div class="nb-row">'+btn('Написати','dm','data-id="'+f.id+'"','nb-primary')+btn(f.favorite?'★ В обраних':'☆ В обране','favorite','data-id="'+f.id+'"')+'</div>';
 out+='<div class="nb-card" style="margin-top:14px"><h3>Зараз за розкладом</h3>'+(a?(a.hidden?windowsView(a):'<p>'+esc(a.subject||(a.busy?'На парі':'Зараз вільний'))+'</p>'+(a.group?'<span class="nb-badge">'+esc(a.group)+'</span>':'')+(a.room?'<p>'+esc(a.room)+'</p>':'')+'<p class="nb-sub">'+(a.ends?'Пара до '+esc(a.ends):a.nextStart?'Наступна пара о '+esc(a.nextStart):'На сьогодні більше пар немає')+'</p>'+windowsView(a)):'<p class="nb-sub">Завантажуємо розклад…</p>')+'</div>';
 out+='<details id="nb-meeting"><summary>Запросити зустрітися</summary><label for="nb-invite-date">Дата й час за Києвом</label><input id="nb-invite-date" type="datetime-local"><label for="nb-invite-place">Де зустрінемось</label><input id="nb-invite-place" maxlength="160" placeholder="Наприклад, біля корпусу №1">'+btn('Надіслати запрошення','invite','data-id="'+f.id+'"','nb-primary')+'</details>';
 out+='<details><summary>Мій розклад для цього друга</summary><select id="nb-one-privacy" aria-label="Видимість для друга">'+Object.entries(privacy).map(([k,v])=>'<option value="'+k+'" '+(f.shareWith===k?'selected':'')+'>'+v+'</option>').join('')+'</select>'+btn('Зберегти доступ','friend-one-privacy','data-id="'+f.id+'"')+btn('Прибрати з друзів','friend-remove','data-id="'+f.id+'"','nb-danger')+'</details>';return out;
}
function render(){
 ensure();if(S.tab==='chats'&&S.thread)return '<section id="dp-nb" data-view="thread">'+(S.error?'<div class="nb-thread-error nb-alert nb-error" role="alert">'+esc(S.error)+btn('Повторити','thread-refresh')+'</div>':'')+threadView()+'</section>';const head='<section id="dp-nb" data-view="'+(S.note&&S.tab==='notes'?'editor':S.thread&&S.tab==='chats'?'thread':S.tab)+'"><div class="nb-header"><div><span class="nb-kicker">ТВІЙ СТУДЕНТСЬКИЙ ПРОСТІР</span><h1>Зошит<span class="nb-title-dot">.</span></h1></div>'+btn(icon('refresh'),'refresh','aria-label="Оновити зошит"','nb-icon-btn')+'</div><div class="nb-tabs nb-main-tabs" role="tablist" aria-label="Розділи зошита">'+[['notes','Конспекти','book'],['chats','Чати','chat'],['friends','Друзі','friends']].map(([k,v,i])=>'<button type="button" role="tab" aria-selected="'+(S.tab===k)+'" data-action="tab" data-value="'+k+'">'+icon(i)+'<span>'+v+'</span></button>').join('')+'</div>';
 return head+(S.error?'<div class="nb-alert nb-error" role="alert">'+esc(S.error)+' '+btn('Повторити','refresh')+'</div>':'')+(!auth()?'<div class="nb-alert">Особисті записи зберігаються на цьому пристрої. Для чатів, друзів і публікації відкрий тестовий Telegram-бот.</div>':'')+'<span class="nb-status nb-connection" aria-live="polite"><i class="'+(S.ready?'is-ready':'')+'"></i>'+(S.loading?'Оновлення…':S.ready?'Підключено · '+esc(S.me.group.name):'Локальні записи')+'</span><div role="tabpanel">'+(S.tab==='notes'?notesView():S.tab==='chats'?chatsView():friendsView())+'</div></section>';
}
function draw(){
 if(!active())return;const screen=$('#screen');if(!screen)return;
 const y=window.scrollY,old=$('#nb-message-list'),scroll=old?{top:old.scrollTop,height:old.scrollHeight,bottom:old.scrollHeight-old.scrollTop-old.clientHeight<70}:null,input=document.activeElement,focused=input?.closest('#dp-nb')&&input.matches('input,textarea,select')?input.id:null,selection=focused&&typeof input.selectionStart==='number'?[input.selectionStart,input.selectionEnd]:null;
 const opened=[...screen.querySelectorAll('#dp-nb details[open]>summary')].map(x=>x.textContent);screen.innerHTML=render();
 for(const summary of screen.querySelectorAll('#dp-nb details>summary'))if(opened.includes(summary.textContent))summary.parentElement.open=true;
 const fresh=$('#nb-message-list');if(fresh){if(S.preserveOlder&&scroll){fresh.scrollTop=scroll.top+fresh.scrollHeight-scroll.height;S.preserveOlder=false;}else fresh.scrollTop=S.scrollToEnd||!scroll||scroll.bottom?fresh.scrollHeight:scroll.top;S.scrollToEnd=false;}
 resizeChatInput();if(focused){const field=document.getElementById(focused);field?.focus({preventScroll:true});if(selection)try{field?.setSelectionRange(...selection)}catch{}}
 if(S.messageMenu)$('#dp-nb .nb-message-sheet button')?.focus({preventScroll:true});
 if(S.jumpId){const message=$('#dp-nb [data-message-id="'+S.jumpId+'"]');message?.scrollIntoView({block:'center'});message?.classList.add('nb-highlight-message');S.jumpId=null;}
 if(!fresh&&window.scrollY!==y)window.scrollTo(0,y);
}
function resizeChatInput(){const input=$('#nb-message');if(!input)return;const list=$('#nb-message-list'),bottom=list&&list.scrollHeight-list.scrollTop-list.clientHeight<70;input.style.height='auto';input.style.height=Math.min(input.scrollHeight,128)+'px';if(bottom)list.scrollTop=list.scrollHeight;}
function syncChatViewport(){const v=window.visualViewport,root=document.documentElement,list=$('#nb-message-list'),bottom=list&&list.scrollHeight-list.scrollTop-list.clientHeight<70;root.style.setProperty('--nb-viewport-height',(v?.height||window.innerHeight)+'px');root.style.setProperty('--nb-viewport-top',(v?.offsetTop||0)+'px');if(bottom)requestAnimationFrame(()=>{if(list.isConnected)list.scrollTop=list.scrollHeight;});}
syncChatViewport();window.visualViewport?.addEventListener('resize',syncChatViewport);window.visualViewport?.addEventListener('scroll',syncChatViewport);window.addEventListener('resize',syncChatViewport);
function newNote(){const n={id:uuid(),title:'Новий конспект',body:'',subject:S.subject||'',kind:S.subject?S.section:'note',due:'',done:0,visibility:'private',audience:[],attachments:[],created_at:Date.now(),updated_at:Date.now(),dirty:true,owner_id:S.me?.id||undefined};flushDraft();S.note=n;persist(n);draw();$('#dp-nb-title')?.focus()}
function saveStatus(n,text){if(S.note?.id===n.id){const status=$('#dp-nb-status');if(status)status.textContent=text}}
function backgroundSave(n){void saveNote(false,n).catch(e=>{S.error=messageError(e);saveStatus(n,'Не вдалося синхронізувати. Чернетка залишається на пристрої.');})}
function flushDraft(){clearTimeout(saveTimer);const n=S.note;if(n?.dirty&&n.visibility==='private'&&S.ready)backgroundSave(n)}
function updateDraft(){
 const n=S.note;if(!n||deleting.has(n.id))return;
 n.updated_at=Date.now();n.dirty=true;edits.set(n.id,(edits.get(n.id)||0)+1);
 const ok=persist(n);saveStatus(n,ok?'✓ Збережено на телефоні':'Не вдалося зберегти — скопіюй текст');
 clearTimeout(saveTimer);if(S.ready&&n.visibility==='private')saveTimer=setTimeout(()=>backgroundSave(n),1000);
}
async function saveNote(explicit,n=S.note){
 if(!n||deleting.has(n.id))return;
 if(!n.title.trim()){if(explicit)throw Error('INVALID_FIELD');return}
 if(!S.ready){if(n.visibility!=='private')throw Error('AUTH_REQUIRED');if(persist(n))toast('Збережено на цьому пристрої');return}
 if(n.visibility!=='private'&&!explicit)return;
 if(explicit&&n.visibility!=='private'&&!confirm(scopeLabel(n.visibility)+' Опублікувати цей запис?'))return;
 const snapshot=JSON.parse(JSON.stringify(n)),version=edits.get(n.id)||0,generation=requestEpoch;
 pendingSaves++;S.saving=true;saveStatus(n,'Збереження…');
 const task=async()=>{
  try{
   if(deleting.has(n.id)||generation!==requestEpoch)return;
   const draft=S.drafts.find(x=>x.id===n.id);
   const result=await api('notes/save','POST',{...snapshot,revision:draft?.revision??n.revision});
   if(generation!==requestEpoch)return;
   n.revision=result.note.revision;
   const latest=S.drafts.find(x=>x.id===n.id),unchanged=(edits.get(n.id)||0)===version;
   if(latest){latest.revision=n.revision;if(unchanged)latest.dirty=false;}
   if(unchanged){n.dirty=false;if(S.note?.id===n.id){S.note.revision=n.revision;S.note.dirty=false;}}
   const stored={...snapshot,revision:n.revision,dirty:false},at=S.notes.findIndex(x=>x.id===n.id);
   if(at<0)S.notes.unshift(stored);else S.notes[at]=stored;
   const localOK=localStore();saveStatus(n,!localOK?'Хмарну копію збережено. Не вдалося оновити локальну копію.':unchanged?'✓ Збережено в хмарі':'Нові правки залишаються в чернетці');
   if(explicit)toast('Збережено');
  }catch(e){saveStatus(n,'Не вдалося синхронізувати. Чернетка залишається на пристрої.');throw e}
  finally{pendingSaves--;S.saving=pendingSaves>0;}
 };
 const next=saveChain.catch(()=>{}).then(task);saveChain=next;return next;
}
async function deleteNote(){
 const n=S.note,generation=requestEpoch;if(!n||!confirm('Видалити цей запис?'))return;
 clearTimeout(saveTimer);deleting.add(n.id);
 try{
  await saveChain.catch(()=>{});if(generation!==requestEpoch)return;
  if(S.ready&&(n.revision||S.drafts.find(x=>x.id===n.id)?.revision))await api('notes/delete','POST',{id:n.id});
  if(generation!==requestEpoch)return;
  const previousNotes=S.notes,previousDrafts=S.drafts;S.notes=S.notes.filter(x=>x.id!==n.id);S.drafts=S.drafts.filter(x=>x.id!==n.id);
  if(!localStore()){S.notes=previousNotes;S.drafts=previousDrafts;throw Error('LOCAL_STORAGE')}
  edits.delete(n.id);if(S.note?.id===n.id)S.note=null;
 }finally{deleting.delete(n.id)}
}
async function openThread(key,title){S.tab='chats';S.messageMenu=null;S.attachMenu=false;S.chatSearchOpen=false;S.threadElection=false;S.chatSearch='';S.editMessage=null;S.thread={key,title};S.messages=[];S.pins=[];S.reply=0;S.chatDraft='';S.chatFiles=[];await refreshThread();}
async function refreshThread(older=false,around=0){if(!S.thread)return;const channel=S.thread.key,query=S.chatSearch;const before=older&&S.messages.length?'&before='+S.messages[0].id:'';const r=await api('messages?channel='+encodeURIComponent(channel)+before+(query?'&q='+encodeURIComponent(query):'')+(around?'&around='+around:''));if(S.thread?.key!==channel||S.chatSearch!==query)return;if(older)S.preserveOlder=true;S.messages=older?[...r.messages,...S.messages]:r.messages;S.pins=r.pins||[];S.canModerate=r.canModerate;if(S.messages.length&&!query&&!older&&!around){await api('messages/read','POST',{channel,id:S.messages.at(-1).id});const c=[...S.channels,...S.direct].find(c=>c.key===channel);if(c)c.unread=0;}}
async function sendMessage(){if(!S.thread||!S.chatDraft.trim()&&!S.chatFiles.length)return;if(S.editMessage){await api('messages/action','POST',{id:S.editMessage,action:'edit',body:S.chatDraft});S.editMessage=null;S.chatDraft=S.preEditDraft||'';S.preEditDraft='';}else{await api('messages/send','POST',{channel:S.thread.key,body:S.chatDraft,attachments:S.chatFiles,replyId:S.reply});S.chatDraft='';S.chatFiles=[];S.reply=0;S.scrollToEnd=true;}await refreshThread();await refreshFriends();}
async function addFiles(file,chat){if(!file)return;let data,type=file.type||'application/octet-stream';if(/^image\/(jpeg|png|webp)$/.test(type)){
 const image=await createImageBitmap(file);const scale=Math.min(1,1000/Math.max(image.width,image.height)),canvas=document.createElement('canvas');canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);image.close();data=canvas.toDataURL('image/jpeg',.7);type='image/jpeg';
 }else{if(file.size>500000)throw Error('TOO_LARGE');data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file)})}
 const target=chat?S.chatFiles:S.note.attachments;if(target.length>=3||target.reduce((n,a)=>n+a.data.length,0)+data.length>700000)throw Error('TOO_LARGE');const attachment={name:file.name.slice(0,140),type,data};target.push(attachment);if(!chat){if(type==='image/jpeg'){const body=window.DeParaNoteEditor.insertImage(attachment,target.length-1);if(body!==null)S.note.body=body;}updateDraft();}
}
function downloadFile(context,index){const files=context==='note'?S.note?.attachments:context==='chat'?S.chatFiles:S.messages.find(m=>'message-'+m.id===context)?.attachments;const f=files?.[index];if(!f)return;const encoded=f.data.split(',')[1],binary=atob(encoded),array=Uint8Array.from(binary,c=>c.charCodeAt(0));const url=URL.createObjectURL(new Blob([array],{type:f.type})),a=document.createElement('a');a.href=url;a.download=f.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000)}
document.addEventListener('click',async e=>{
 const nav=e.target.closest('#nav [data-page="notebook"]');if(nav){setTimeout(()=>{draw();ensure()},0);return}
 if(e.target.closest('#nav [data-page]')){flushDraft();return}
 if(!e.target.closest('#dp-nb'))return;e.stopPropagation();const b=e.target.closest('[data-action]');if(!b)return;if(b.dataset.action==='message-send')e.preventDefault();const a=b.dataset.action,id=b.dataset.id;
 if(a==='message-menu'){S.messageMenu=Number(id);draw();return}if(a==='message-menu-close'){S.messageMenu=null;draw();return}
 if(a==='chat-attachments'){S.attachMenu=!S.attachMenu;draw();return}
 if(a==='thread-search'){b.closest('details')?.removeAttribute('open');S.chatSearchOpen=true;draw();$('#nb-chat-search')?.focus();return}
 if(a==='thread-search-close'){S.chatSearchOpen=false;S.chatSearch='';await act(()=>refreshThread());return}
 if(a==='thread-election'){b.closest('details')?.removeAttribute('open');S.threadElection=!S.threadElection;draw();return}
 S.messageMenu=null;b.closest('.nb-thread-options')?.removeAttribute('open');
 if(a==='tab'){flushDraft();S.tab=b.dataset.value;S.error='';draw();if(S.tab==='chats'&&S.ready)void act(async()=>{await refreshFriends();S.electionData=await api('elections')});return}
 if(a==='download'){downloadFile(b.dataset.context,Number(b.dataset.index));return}
 if(a==='subject'){S.subject=b.dataset.value;S.section='note';S.search='';S.topic='';draw();return}
 if(a==='subjects'){S.subject=null;S.search='';S.topic='';draw();return}
 if(a==='topic'){S.topic=b.dataset.value;draw();return}
 if(a==='note-pin'&&S.note){noteMeta(S.note.id,{pinned:!noteMeta(S.note.id).pinned});draw();return}
 if(a==='picker-close'){S.notePicker=null;draw();return}
 if(a==='window-invite'){const details=$('#nb-meeting');details.open=true;$('#nb-invite-date').value=b.dataset.date+'T'+b.dataset.start;$('#nb-invite-place')?.focus();details.scrollIntoView({behavior:'smooth',block:'center'});return}
 if(a==='message-edit'){const message=S.messages.find(m=>m.id===Number(id));if(message?.author_id===S.me.id){S.preEditDraft=S.chatDraft;S.editMessage=message.id;S.chatDraft=message.body;S.reply=0;S.messageMenu=null;draw();$('#nb-message')?.focus();}return}
 if(a==='edit-cancel'){S.editMessage=null;S.chatDraft=S.preEditDraft||'';S.preEditDraft='';draw();return}
 if(a==='subject-new'){const name=prompt('Назва предмета');if(name?.trim()){const clean=name.trim().slice(0,180),existing=subjects().find(s=>s.toLocaleLowerCase('uk')===clean.toLocaleLowerCase('uk'));if(existing){S.subject=existing;draw();return}S.customSubjects.push(clean);localStorage.setItem('dp_reborn2_nb_subjects',JSON.stringify(S.customSubjects));S.subject=clean;draw()}return}
 if(a==='filter'){S.filter=b.dataset.value;draw();return}if(a==='section'){S.section=b.dataset.value;draw();return}
 if(a==='note-new'){newNote();return}
 if(a==='note-open'){const n=listNotes().find(n=>n.id===id);if(n){noteMeta(id,{openedAt:Date.now()});if(S.ready&&n.attachments===undefined){await act(async()=>{S.note=(await api('notes/get?id='+encodeURIComponent(id))).note})}else{S.note=JSON.parse(JSON.stringify(n));draw()}}return}
 if(a==='note-back'){flushDraft();S.note=null;draw();return}
 if(a==='format'){window.DeParaNoteEditor.format(b.dataset.value);return}
 if(a==='note-file'){$('#nb-file')?.click();return}if(a==='chat-file'){S.attachMenu=false;$('#nb-chat-file')?.click();return}
 if(a==='file-remove'){const index=Number(b.dataset.index);S.note.attachments.splice(index,1);S.note.body=S.note.body.replace(/\[\[image:(\d+)\]\]/g,(text,n)=>Number(n)===index?'':Number(n)>index?'[[image:'+(Number(n)-1)+']]':text);updateDraft();draw();return}
 if(a==='friend-back'){S.friendDetail=null;S.availability=null;draw();return}
 if(a==='thread-back'){S.thread=null;S.chatDraft='';S.chatFiles=[];S.messageMenu=null;S.editMessage=null;await act(()=>refreshFriends());return}
 if(a==='reply'){S.reply=Number(id);draw();$('#nb-message')?.focus();return}if(a==='reply-clear'){S.reply=0;draw();return}
 await act(async()=>{
  if(a==='message-jump'){S.chatSearch='';S.chatSearchOpen=false;await refreshThread(false,Number(id));S.jumpId=Number(id);return;}
  if(a==='message-copy'){const m=S.messages.find(m=>m.id===Number(id));if(m){try{await navigator.clipboard.writeText(m.body);toast('Текст скопійовано')}catch{prompt('Скопіюй текст',m.body)}}return;}
  if(a==='message-send')await sendMessage();
  if(a==='refresh'){if(S.ready){await refreshNotes();await refreshFriends();if(S.thread)await refreshThread()}else await bootstrap();}
  if(a==='note-save'){clearTimeout(saveTimer);await saveNote(true)}
  if(a==='note-copy'){const source=S.note;S.note={...source,id:uuid(),title:source.title+' (копія)',owner_id:S.me?.id,visibility:'private',audience:[],revision:undefined,created_at:Date.now(),updated_at:Date.now(),dirty:true,author:undefined};persist(S.note);await saveNote(false)}
  if(a==='note-delete')await deleteNote();
  if(a==='note-reload'){await refreshNotes();const current=S.notes.find(n=>n.id===S.note.id);if(current){if(confirm('Твоя чернетка залишиться окремою копією. Відкрити серверну версію?')){S.drafts=S.drafts.filter(n=>n.id!==current.id);S.drafts.push({...S.note,id:uuid(),revision:undefined,visibility:'private',title:S.note.title+' (чернетка)',dirty:true});localStore();S.note={...current};S.error='';}}}
  if(a==='legacy-import'){if(!confirm('Додати попередні локальні записи до твого особистого облікового запису?'))return;const old=get(LEGACY,[]);let count=0;for(const n of old){if(S.notes.some(x=>x.id===n.id)||!n.title)continue;S.note={...n,subject:n.subject||'',visibility:'private',audience:[],attachments:[],kind:'note',owner_id:S.me.id,updated_at:Date.now(),dirty:true};persist(S.note);await saveNote(false);count++;}S.note=null;toast('Імпортовано: '+count);}
  if(a==='thread')await openThread(b.dataset.channel,b.dataset.title);
  if(a==='dm'){const f=S.friends.find(f=>f.id===id);if(f)await openThread('dm:'+ [S.me.id,f.id].sort().join(':'),f.name);}
  if(a==='thread-refresh')await refreshThread();if(a==='messages-older')await refreshThread(true);
  if(a==='note-from-chat'){S.note=(await api('notes/get?id='+encodeURIComponent(id))).note;S.tab='notes';}
  if(a==='react'||a.startsWith('message-')){let action={react:'react','message-edit':'edit','message-delete':'delete','message-pin':'pin','message-mute':'mute'}[a];if(!action)return;const m=S.messages.find(m=>m.id===Number(id));let data={id:Number(id),action,emoji:b.dataset.emoji||'👍'};if(action==='edit'){const t=prompt('Текст повідомлення',m.body);if(t===null)return;data.body=t}if((action==='delete'||action==='mute')&&!confirm(action==='delete'?'Видалити повідомлення?':'Обмежити надсилання в цьому чаті на годину?'))return;await api('messages/action','POST',data);await refreshThread();}
  if(a==='chat-note'){S.attachMenu=false;await openNotePicker(S.thread.key,S.thread.title);}
  if(a==='friend-share'){const f=S.friends.find(f=>f.id===id);await openNotePicker('dm:'+ [S.me.id,id].sort().join(':'),f.name);}
  if(a==='picker-send'){const picker=S.notePicker,n=picker.notes.find(n=>n.id===id);if(!n)return;await api('messages/send','POST',{channel:picker.channel,noteId:n.id,body:'▤ '+n.title});S.notePicker=null;if(S.thread?.key===picker.channel)await refreshThread();await refreshFriends();toast('Конспект надіслано');}
  if(a==='friend-code'){try{await navigator.clipboard.writeText(S.me.friend_code);toast('Код скопійовано')}catch{prompt('Скопіюй код',S.me.friend_code)}}
  if(a==='friend-request'){await api('friends/request','POST',{code:$('#nb-friend-code').value});await refreshFriends();toast('Запит надіслано');}
  if(a==='friend-respond'){await api('friends/respond','POST',{userId:id,accept:b.dataset.accept==='true'});await refreshFriends();}
  if(a==='friend-open'){S.friendDetail=id;S.availability=null;const result=await api('friends/availability?userId='+id);S.availability=result;S.windows[id]=result;}
  if(a==='friend-windows-date'){const result=await api('friends/availability?userId='+S.friendDetail+'&date='+encodeURIComponent(b.dataset.date));S.availability=result;}
  if(a==='friends-windows'){const fs=S.friends.filter(f=>f.state==='accepted'&&f.privacy!=='none');for(let i=0;i<fs.length;i+=3){const batch=fs.slice(i,i+3);const results=await Promise.allSettled(batch.map(f=>api('friends/availability?userId='+f.id)));results.forEach((r,j)=>{S.windows[batch[j].id]=r.status==='fulfilled'?r.value:{error:true};});}toast(fs.length?'Спільні вікна оновлено':'Друзі ще не відкрили доступ до розкладу');}
  if(a==='favorite'||a==='friend-one-privacy'||a==='friend-remove'){const f=S.friends.find(f=>f.id===id);if(a==='friend-remove'&&!confirm('Прибрати з друзів? Доступ до приватних розмов і записів для друзів буде закрито.'))return;await api('friends/options','POST',{userId:id,favorite:a==='favorite'?!f.favorite:f.favorite,privacy:a==='friend-one-privacy'?$('#nb-one-privacy').value:f.shareWith,remove:a==='friend-remove'});await refreshFriends();if(a==='friend-remove')S.friendDetail=null;}
  if(a==='friend-privacy'){await api('profile','POST',{groupId:gid(),privacy:$('#nb-global-privacy').value,status:$('#nb-my-status').value,statusUntil:Date.now()+Number($('#nb-status-hours').value)*3600000});await refreshFriends();toast('Доступ і статус збережено');}
  if(a==='invite'){const value=$('#nb-invite-date').value;if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value))throw Error('INVALID_DATE');const startsAt=kyivInstant(value);if(!Number.isFinite(startsAt.getTime()))throw Error('INVALID_DATE');await api('invitations','POST',{userId:id,startsAt:startsAt.toISOString(),place:$('#nb-invite-place').value});await refreshFriends();toast('Запрошення надіслано');}
  if(a==='invite-respond'){await api('invitations/respond','POST',{id,state:b.dataset.value});await refreshFriends();}
  if(a==='elections-load')S.electionData=await api('elections');
  if(a==='election-start'){if(!confirm('Почати голосування на 48 годин? Правила показані в розділі виборів.'))return;await api('elections/start','POST',{action:b.dataset.value});S.electionData=await api('elections');}
  if(a==='vote'){await api('elections/vote','POST',{id:S.electionData.election.id,yes:b.dataset.yes==='true'});S.electionData=await api('elections');}
 });
},true);
let pressTimer=null,pressStart=null,chatSearchTimer;
const cancelPress=()=>{clearTimeout(pressTimer);pressTimer=null;};
document.addEventListener('pointerdown',e=>{const message=e.target.closest('#dp-nb article[data-message-id]');if(!message||e.target.closest('button,a,input,textarea')||e.button>0)return;cancelPress();pressStart={x:e.clientX,y:e.clientY,id:Number(message.dataset.messageId),message};pressTimer=setTimeout(()=>{S.messageMenu=Number(message.dataset.messageId);pressStart=null;draw();},500);});
document.addEventListener('pointermove',e=>{if(pressStart&&Math.hypot(e.clientX-pressStart.x,e.clientY-pressStart.y)>10)cancelPress();});
document.addEventListener('pointerup',e=>{cancelPress();if(pressStart){const swipe=e.clientX-pressStart.x>70&&Math.abs(e.clientY-pressStart.y)<35,id=pressStart.id;pressStart=null;if(swipe&&!S.editMessage){S.reply=id;S.messageMenu=null;draw();$('#nb-message')?.focus();}}});
document.addEventListener('pointercancel',()=>{cancelPress();pressStart=null;});
document.addEventListener('contextmenu',e=>{const message=e.target.closest('#dp-nb article[data-message-id]');if(message){e.preventDefault();cancelPress();S.messageMenu=Number(message.dataset.messageId);draw();}});
document.addEventListener('keydown',e=>{if(!S.messageMenu)return;if(e.key==='Escape'){S.messageMenu=null;draw();return}if(e.key==='Tab'){const buttons=[...document.querySelectorAll('.nb-message-sheet button')];if(!buttons.length)return;const first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}});
document.addEventListener('input',e=>{
 const el=e.target;if(!el.closest('#dp-nb'))return;
 if(el.id==='nb-chat-search'){S.chatSearch=el.value.slice(0,120);const query=S.chatSearch;clearTimeout(chatSearchTimer);chatSearchTimer=setTimeout(async()=>{try{await refreshThread();if(S.chatSearch!==query)return;const focused=document.activeElement?.id==='nb-chat-search',pos=$('#nb-chat-search')?.selectionStart;draw();if(focused){$('#nb-chat-search')?.focus();try{$('#nb-chat-search')?.setSelectionRange(pos,pos)}catch{}}}catch(e){S.error=messageError(e);draw()}},350);return}
 if(el.id==='nb-picker-search'){const pos=el.selectionStart;S.notePicker.search=el.value;draw();$('#nb-picker-search')?.focus();try{$('#nb-picker-search')?.setSelectionRange(pos,pos)}catch{}return}
 if(el.id==='nb-search'){const pos=el.selectionStart;S.search=el.value;draw();const fresh=$('#'+el.id);fresh?.focus();try{fresh?.setSelectionRange(pos,pos)}catch{}return}
 if(el.id==='nb-message'){S.chatDraft=el.value;resizeChatInput();return}
 if(el.id==='nb-topic'&&S.note){noteMeta(S.note.id,{topic:el.value.slice(0,100)});return}
 if(el.id==='dp-nb-body'&&S.note){const text=window.DeParaNoteEditor.serialize(el);if(text.length>60000){el.innerHTML=window.DeParaNoteEditor.render(S.note.body,S.note.attachments);toast('До 60 000 символів у конспекті');return;}S.note.body=text;updateDraft();return}
 const map={'dp-nb-title':'title','dp-nb-body':'body','nb-subject':'subject','nb-due':'due'};if(map[el.id]&&S.note){S.note[map[el.id]]=el.value;updateDraft();}
});
document.addEventListener('change',e=>{const el=e.target;if(!el.closest('#dp-nb'))return;
 if(el.id==='nb-window-date'&&S.friendDetail){const date=el.value;if(!date)return;void act(async()=>{S.availability=await api('friends/availability?userId='+S.friendDetail+'&date='+encodeURIComponent(date));});return;}
 if(el.id==='nb-kind'||el.id==='nb-visibility'||el.id==='nb-done'||el.dataset.audience){if(!S.note)return;if(el.id==='nb-kind'){S.note.kind=el.value;const check=$('#nb-done')?.closest('label');if(check)check.hidden=el.value!=='task';}if(el.id==='nb-done')S.note.done=el.checked?1:0;if(el.id==='nb-visibility')S.note.visibility=el.value;if(el.dataset.audience){const a=new Set(S.note.audience||[]);el.checked?a.add(el.dataset.audience):a.delete(el.dataset.audience);S.note.audience=[...a]}updateDraft();if(el.id==='nb-visibility')draw();}
 if(el.id==='nb-file'||el.id==='nb-chat-file'){const file=el.files?.[0];el.value='';void act(()=>addFiles(file,el.id==='nb-chat-file'));}
});
document.addEventListener('submit',e=>{if(e.target.id!=='nb-compose')return;e.preventDefault();void act(()=>sendMessage())});
window.addEventListener('depara:student-group',()=>{clearTimeout(saveTimer);requestEpoch++;attemptedGroup=null;S.ready=false;S.me=null;S.thread=null;S.note=null;S.notes=[];S.subject=null;S.friendDetail=null;S.availability=null;S.electionData=null;S.windows={};S.direct=[];S.notePicker=null;if(active())setTimeout(()=>void bootstrap(),0)});
window.addEventListener('pagehide',flushDraft);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flushDraft();if(document.visibilityState==='visible'&&active()&&S.ready&&!S.loading)void act(async()=>{await refreshFriends();if(S.thread)await refreshThread()})});
setInterval(async()=>{if(!active()||!S.ready||S.loading||S.notePicker||document.visibilityState==='hidden'||document.activeElement?.matches('input,textarea,select,[contenteditable=true]'))return;try{if(S.tab==='chats'){if(S.thread){const before=JSON.stringify(S.messages);await refreshThread();if(before!==JSON.stringify(S.messages))draw()}else{const before=JSON.stringify([S.channels,S.direct]);await refreshFriends();if(before!==JSON.stringify([S.channels,S.direct]))draw();}}}catch{}},7000);
document.addEventListener('DOMContentLoaded',()=>{const original=window.DeParaShowLesson;if(typeof original!=='function')return;window.DeParaShowLesson=lesson=>{original(lesson);if(document.body.dataset.dpRole==='teacher')return;const dialog=$('dialog.dp-lesson-dialog[open]');if(!dialog||!lesson?.subject)return;const button=document.createElement('button');button.type='button';button.className='dp-lesson-done';button.id='nb-lesson-note';button.textContent='▤ Конспект до цієї пари';button.onclick=()=>{dialog.close();S.tab='notes';S.subject=String(lesson.subject);$('#nav [data-page="notebook"]')?.click();newNote();S.note.title=String(lesson.subject).slice(0,95)+' · '+(lesson.date||'');S.note.lesson=JSON.stringify({date:lesson.date,start:lesson.start,subject:lesson.subject}).slice(0,600);updateDraft();draw()};dialog.querySelector('.dp-lesson-fields')?.after(button)}});
window.DeParaNotebook={render,version:2};
})();

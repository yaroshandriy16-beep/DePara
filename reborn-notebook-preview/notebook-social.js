/* Isolated test notebook. Shared actions require signed Telegram authentication. */
(()=>{'use strict';
const API='https://depara-api-preview.yaroshandriy16.workers.dev/api/notebook/';
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
const errors={AUTH_REQUIRED:'Для спільних функцій відкрий застосунок із тестового Telegram-бота.',SESSION_EXPIRED:'Сесія Telegram закінчилася. Закрий і відкрий мініапп заново.',INVALID_AUTH:'Не вдалося перевірити вхід Telegram. Відкрий тестового бота заново.',SERVICE_UNAVAILABLE:'Сервер тимчасово недоступний. Чернетки залишаються на пристрої.',FORBIDDEN:'Ця дія недоступна для твого облікового запису.',WAIT_48_HOURS:'Голосувати й висуватися можна після 48 годин у групі.',NEED_TWO_MEMBERS:'Для виборів потрібні щонайменше двоє учасників із правом голосу.',ELECTION_ACTIVE:'У групі вже триває голосування.',ELECTION_COOLDOWN:'Нове голосування можна почати через добу після попереднього.',FRIEND_NOT_FOUND:'Друга з таким кодом не знайдено. Він має відкрити вкладку «Зошит» у тестовому боті.',REQUEST_EXISTS:'Запит уже існує. Перевір вхідні або вихідні запити.',NOTE_NOT_SHARED:'Адресати цього чату не мають доступу до конспекту. Спочатку зміни його видимість.',TOO_FAST:'Зачекай кілька секунд перед наступною дією.',MUTED:'Модератор тимчасово обмежив надсилання повідомлень.',TOO_LARGE:'Вкладення завеликі. Обери менший файл.',REVISION_CONFLICT:'Цей запис змінився на іншому пристрої. Твоя чернетка збережена; онови список і порівняй версії.',NOT_FRIEND:'Спочатку підтвердіть дружбу.',INVALID_DATE:'Перевір дату й час зустрічі.',NOTE_LIMIT:'Досягнуто ліміту 500 записів.',SCHEDULE_UNAVAILABLE:'Розклад друга зараз не вдалося завантажити.'};
let S={tab:'notes',subject:null,note:null,notes:[],drafts:get(draftKey(),[]),me:null,friends:[],channels:[],ready:false,loading:false,error:'',search:'',filter:'all',section:'note',thread:null,messages:[],reply:0,chatDraft:'',chatFiles:[],chatSearch:'',canModerate:false,election:null,electionData:null,invitations:[],friendDetail:null,availability:null,customSubjects:get('dp_reborn2_nb_subjects',[]),saving:false};
let booting=null,lastGroup=null,attemptedGroup=null,saveTimer,saveChain=Promise.resolve(),requestEpoch=0;
function localNotes(){const d=get(draftKey(),[]);return Array.isArray(d)?d:[]}
function localStore(){try{localStorage.setItem(draftKey(),JSON.stringify(S.drafts));return true}catch{S.error='Не вистачає місця на пристрої. Збережи копію тексту.';return false}}
function persist(n){const at=S.drafts.findIndex(x=>x.id===n.id);if(at<0)S.drafts.unshift({...n});else S.drafts[at]={...n};return localStore()}
function listNotes(){const m=new Map(S.notes.map(n=>[n.id,n]));for(const d of S.drafts)if(!m.has(d.id)||d.dirty)m.set(d.id,d);return [...m.values()].sort((a,b)=>(b.updated_at||b.updated||0)-(a.updated_at||a.updated||0))}
const date=n=>new Date(n.updated_at||n.updated||n.created_at||n.created||Date.now()).toLocaleDateString('uk-UA',{day:'numeric',month:'short'});
const btn=(label,action,extra='',cls='')=>'<button type="button" class="nb-btn '+cls+'" data-action="'+action+'" '+extra+'>'+label+'</button>';
const empty=text=>'<div class="nb-empty">'+esc(text)+'</div>';
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
  S.me=data.me;S.friends=data.friends;S.channels=data.channels;S.ready=true;lastGroup=group;S.drafts=localNotes();
  await refreshNotes();const inv=await api('invitations');S.invitations=inv.invitations;S.error='';
 }catch(e){S.error=messageError(e)}finally{S.loading=false;booting=null;draw()}})();return booting;
}
async function refreshNotes(){const r=await api('notes');S.notes=r.notes;}
async function refreshFriends(){const d=await api('bootstrap');S.me=d.me;S.friends=d.friends;S.channels=d.channels;const inv=await api('invitations');S.invitations=inv.invitations;}
function ensure(){if(auth()&&!booting&&((!S.ready&&attemptedGroup!==gid())||(S.ready&&lastGroup!==gid())))void bootstrap()}
function subjects(){const cached=load('cachedSchedule_'+gid());return [...new Set([...(cached?.lessons||[]).map(l=>l.subject),...S.customSubjects,...listNotes().map(n=>n.subject)].filter(Boolean))].sort((a,b)=>a.localeCompare(b,'uk'))}
function filesHtml(files,context){return '<div class="nb-files">'+(files||[]).map((f,i)=>{const image=/^data:image\/(jpeg|png|webp);base64,/.test(f.data||'');return '<div>'+(image?'<img alt="'+esc(f.name)+'" src="'+esc(f.data)+'" loading="lazy">':'')+btn('↓ '+esc(f.name),'download','data-context="'+context+'" data-index="'+i+'"')+'</div>'}).join('')+'</div>'}
function notesView(){
 if(S.note)return editorView();
 let notes=listNotes().filter(n=>!n.deleted_at&&(S.subject===null||n.subject===S.subject));
 if(S.search)notes=notes.filter(n=>(n.title+' '+n.subject+' '+n.body).toLocaleLowerCase('uk').includes(S.search.toLocaleLowerCase('uk')));
 if(S.filter==='mine')notes=notes.filter(n=>!n.owner_id||n.owner_id===S.me?.id);if(S.filter==='shared')notes=notes.filter(n=>n.owner_id&&n.owner_id!==S.me?.id);
 if(S.subject!==null)notes=notes.filter(n=>(n.kind||'note')===S.section);
 let out='<div class="nb-row nb-between">'+(S.subject!==null?btn('← Предмети','subjects'):'<h2>Предмети</h2>')+btn('＋ '+(S.subject===null?'Свій предмет':'Новий запис'),S.subject===null?'subject-new':'note-new','','nb-primary')+'</div>';
 out+='<input id="nb-search" class="nb-search" type="search" aria-label="Пошук конспектів" placeholder="Пошук у назвах і записах" value="'+esc(S.search)+'">';
 out+='<div class="nb-row">'+[['all','Усе'],['mine','Мої'],['shared','Спільні']].map(([k,v])=>btn(v,'filter','data-value="'+k+'" aria-pressed="'+(S.filter===k)+'"',S.filter===k?'nb-primary':'')).join('')+'</div>';
 if(S.subject!==null)out+='<h2>'+esc(S.subject||'Без предмета')+'</h2><div class="nb-tabs">'+[['note','Записи'],['task','Д/з'],['material','Матеріали']].map(([k,v])=>'<button type="button" data-action="section" data-value="'+k+'" aria-selected="'+(S.section===k)+'">'+v+'</button>').join('')+'</div>';
 if(S.subject===null&&!S.search&&S.filter!=='shared'){
  out+='<div class="nb-grid" style="margin-top:14px">'+subjects().map(s=>'<button type="button" class="nb-card" data-action="subject" data-value="'+esc(s)+'"><span class="nb-kicker">ПРЕДМЕТ</span><strong>'+esc(s)+'</strong><small>'+listNotes().filter(n=>n.subject===s&&!n.deleted_at).length+' записів</small></button>').join('')+'</div>';
  notes=notes.filter(n=>!n.subject);if(notes.length)out+='<h2>Без предмета</h2>';
 }
 out+='<div class="nb-stack" style="margin-top:14px">'+notes.map(n=>'<button type="button" class="nb-card nb-full" data-action="note-open" data-id="'+esc(n.id)+'"><h3>'+esc(n.title||'Без назви')+'</h3><div class="nb-sub">'+esc((n.body||'').slice(0,120))+'</div><div class="nb-row"><span class="nb-badge">'+esc(n.kind==='task'?(n.done?'✓ Виконано':'Д/з'+(n.due?' · '+n.due:'')):vis[n.visibility]||'Лише я')+'</span><small>'+date(n)+'</small>'+(n.author?'<small>'+esc(n.author)+'</small>':'')+(n.dirty?'<span class="nb-badge">Чернетка</span>':'')+'</div></button>').join('')+'</div>';
 if(!notes.length&&(S.subject!==null||S.search||S.filter==='shared'))out+=empty(S.filter==='shared'?'Спільних записів поки немає. Одногрупники можуть опублікувати їх для групи, курсу або факультету.':'Записів ще немає. Створи перший.');
 if(!S.subject&&!S.search)out+='<div class="nb-row" style="margin-top:16px">'+btn('＋ Новий зошит','note-new','data-nb="new"')+(S.ready&&get(LEGACY,[]).length?btn('Імпортувати попередні записи','legacy-import'):'')+'</div>';
 return out;
}
function editorView(){
 const n=S.note,readOnly=!!(n.owner_id&&n.owner_id!==S.me?.id);
 let out=btn('← До зошитів','note-back','data-nb="back"');
 if(readOnly)return out+'<div class="nb-card"><h2>'+esc(n.title)+'</h2><p class="nb-sub">'+esc(n.author||'Автор')+' · '+esc(n.subject)+' · '+esc(vis[n.visibility])+'</p><div class="nb-note">'+markdown(n.body)+'</div>'+filesHtml(n.attachments,'note')+btn('Зберегти власну копію','note-copy','','nb-primary')+'</div>';
 out+='<label for="nb-subject">Предмет</label><input id="nb-subject" list="nb-subject-options" value="'+esc(n.subject||'')+'" maxlength="180"><datalist id="nb-subject-options">'+subjects().map(s=>'<option value="'+esc(s)+'">').join('')+'</datalist>';
 out+='<label for="dp-nb-title">Назва</label><input id="dp-nb-title" value="'+esc(n.title)+'" maxlength="120" placeholder="Тема заняття">';
 out+='<div class="nb-row"><div class="nb-grow"><label for="nb-kind">Тип запису</label><select id="nb-kind">'+[['note','Конспект'],['task','Домашнє завдання'],['material','Матеріал']].map(([k,v])=>'<option value="'+k+'" '+(n.kind===k?'selected':'')+'>'+v+'</option>').join('')+'</select></div><div class="nb-grow"><label for="nb-due">Дата здачі, якщо потрібна</label><input id="nb-due" type="date" value="'+esc(n.due||'')+'"></div></div>';
 out+='<div class="nb-toolbar">'+[['Ж','**'],['К','*'],['Маркер','=='],['Заголовок','# '],['• Список','- '],['1. Список','1. ']].map(([label,v])=>btn(label,'format','data-value="'+esc(v)+'"')).join('')+'</div><label for="dp-nb-body">Записи</label><textarea id="dp-nb-body" placeholder="Почни писати тут…">'+esc(n.body||'')+'</textarea>';
 out+='<label class="nb-check"><input id="nb-done" type="checkbox" '+(n.done?'checked':'')+'> Завдання виконано</label>'+filesHtml(n.attachments,'note')+btn('＋ Фото або файл','note-file')+'<input id="nb-file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.doc,.docx,.ppt,.pptx,.txt" hidden><p class="nb-sub">До 3 вкладень, разом до 500 КБ. Фото стискаються автоматично.</p>';
 out+='<label for="nb-visibility">Хто бачить</label><select id="nb-visibility">'+Object.entries(vis).map(([k,v])=>'<option value="'+k+'" '+(n.visibility===k?'selected':'')+'>'+v+'</option>').join('')+'</select>';
 if(n.visibility==='friends')out+='<div>'+S.friends.filter(f=>f.state==='accepted').map(f=>'<label class="nb-check"><input type="checkbox" data-audience="'+f.id+'" '+((n.audience||[]).includes(f.id)?'checked':'')+'>'+esc(f.name)+'</label>').join('')+'</div>';
 out+='<p class="nb-sub">'+scopeLabel(n.visibility)+'</p><span id="dp-nb-status" class="nb-status" role="status">'+(S.saving?'Збереження…':n.dirty?'Чернетку збережено на пристрої':'Збережено')+'</span><div class="nb-row">'+btn(n.visibility==='private'?'Зберегти':'Зберегти й опублікувати','note-save','','nb-primary')+btn('Видалити запис','note-delete','','nb-danger')+'</div>';
 if(n.attachments?.length)out+='<details><summary>Видалення вкладень</summary>'+n.attachments.map((f,i)=>btn('× '+esc(f.name),'file-remove','data-index="'+i+'"')).join('')+'</details>';
 if(S.error?.includes('іншому пристрої'))out+=btn('Завантажити актуальну версію','note-reload');
 return out;
}
function scopeLabel(level){const g=S.me?.group;return level==='private'?'Запис доступний лише тобі.':level==='friends'?'Доступ отримають лише вибрані підтверджені друзі.':level==='group'?'Побачать учасники '+(g?.name||load('groupName')||'твоєї групи')+'.':level==='course'?'Побачить '+(g?.course||'твій')+' курс · '+(g?.faculty||'твій факультет')+'.':'Побачать усі курси · '+(g?.faculty||'твій факультет')+'.'}
function chatsView(){
 if(S.thread)return threadView();
 if(!S.ready)return empty('Чати працюють у тестовому Telegram-мініаппі після підключення до сервера.');
 const g=S.me.group;const subjectChannels=subjects().map(s=>({key:'subject:'+g.id+':'+encodeURIComponent(s),title:s}));
 let out='<h2>Спільноти</h2><div class="nb-stack">'+S.channels.map(c=>btn('<div class="nb-row nb-between"><strong>'+esc(c.title)+'</strong>'+(c.unread?'<span class="nb-unread">'+c.unread+'</span>':'')+'</div>','thread','data-channel="'+esc(c.key)+'" data-title="'+esc(c.title)+'"','nb-full')).join('')+'</div>';
 out+='<details><summary>Предмети · '+subjectChannels.length+'</summary><div class="nb-stack">'+subjectChannels.map(c=>btn(esc(c.title),'thread','data-channel="'+esc(c.key)+'" data-title="'+esc(c.title)+'"','nb-full')).join('')+'</div></details><h2>Особисті</h2><div class="nb-stack">'+S.friends.filter(f=>f.state==='accepted').map(f=>btn(esc(f.name),'dm','data-id="'+f.id+'"','nb-full')).join('')+'</div>';
 out+='<details><summary>Староста й модерація</summary>'+electionView()+'</details>';return out;
}
function electionView(){const d=S.electionData,e=d?.election;let out='<p class="nb-sub">Староста модерує чат своєї групи та її предметів, а також чати свого курсу й факультету. Приватні записи й особисті чати йому недоступні.</p>';
 if(!d)return out+btn('Переглянути вибори','elections-load');
 out+='<p>Староста: <strong>'+esc(d.leader?.name||'Ще не обраний')+'</strong></p>';
 if(e)out+='<div class="nb-card"><h3>'+(e.action==='remove'?'Зняття з ролі: ':'Кандидат: ')+esc(e.candidate||'Студент')+'</h3><p class="nb-sub">'+(e.state==='open'?'До '+new Date(e.ends_at).toLocaleString('uk-UA'):e.state==='cancelled'?'Скасовано: кандидат змінив групу.':e.winner?'Рішення прийнято.':'Голосування завершено без прийняття рішення.')+'</p><div class="nb-row"><span>За: '+(e.tally.yes||0)+'</span><span>Проти: '+(e.tally.no||0)+'</span><span>Учасників: '+e.tally.total+'</span></div>'+(e.state==='open'&&e.eligible?'<div class="nb-row">'+btn('За','vote','data-yes="true" aria-pressed="'+(e.vote===1)+'"')+btn('Проти','vote','data-yes="false" aria-pressed="'+(e.vote===0)+'"')+'</div>':'')+'</div>';
 if(!e||e.state!=='open')out+='<div class="nb-row">'+btn('Висунути себе','election-start','data-value="elect"')+(d.leader?btn('Голосування про зняття','election-start','data-value="remove"'):'')+'</div>';
 return out+'<details><summary>Правила тестових виборів</summary><p class="nb-rules">Право голосу — через 48 годин у вибраній групі. Голосування триває 48 годин; склад виборців фіксується на початку. Потрібні щонайменше 2 виборці, участь половини та більше «За», ніж «Проти». Голос можна змінити до завершення. Нічия — рішення не прийнято. Нові вибори — не раніше ніж через добу. Зміна групи скидає очікування та права. Це роль у застосунку, не офіційне призначення університету.</p></details>';}
function threadView(){
 let ms=S.messages;if(S.chatSearch)ms=ms.filter(m=>m.body.toLocaleLowerCase('uk').includes(S.chatSearch.toLocaleLowerCase('uk')));
 let out='<div class="nb-row nb-between">'+btn('← Чати','thread-back')+btn('↻ Оновити','thread-refresh')+'</div><h2>'+esc(S.thread.title)+'</h2><input id="nb-chat-search" type="search" placeholder="Пошук у завантажених повідомленнях" aria-label="Пошук повідомлень" value="'+esc(S.chatSearch)+'">';
 const pins=S.messages.filter(m=>m.pinned&&!m.deleted);if(pins.length)out+='<details open><summary>Закріплені · '+pins.length+'</summary>'+pins.map(m=>'<div class="nb-alert">'+esc(m.body.slice(0,250))+'</div>').join('')+'</details>';
 if(S.messages.length>=60)out+=btn('Завантажити попередні','messages-older');
 out+='<div id="nb-message-list" aria-label="Повідомлення">'+ms.map(m=>{
  const mine=m.author_id===S.me.id,quoted=S.messages.find(x=>x.id===m.reply_id);
  return '<article class="nb-message '+(mine?'nb-mine ':'')+(m.pinned?'nb-pinned':'')+'"><div class="nb-message-name">'+esc(m.name)+(S.thread.key.startsWith('course:')||S.thread.key.startsWith('faculty:')?' · '+esc(m.group):'')+(m.isLeader?' · Староста':'')+'</div>'+(quoted?'<div class="nb-reply">↳ '+esc(quoted.name)+': '+esc(quoted.body.slice(0,100))+'</div>':'')+'<div class="nb-message-body">'+esc(m.body)+'</div>'+filesHtml(m.attachments,'message-'+m.id)+(m.note_id?btn('▤ Відкрити конспект','note-from-chat','data-id="'+esc(m.note_id)+'"'):'')+'<div class="nb-message-time">'+new Date(m.created_at).toLocaleTimeString('uk-UA',{hour:'2-digit',minute:'2-digit'})+(m.edited_at?' · змінено':'')+'</div>'+(m.deleted?'':'<div class="nb-row">'+(m.reactions||[]).map(r=>btn(r.emoji+' '+r.total,'react','data-id="'+m.id+'" data-emoji="'+r.emoji+'" aria-pressed="'+!!r.mine+'"')).join('')+btn('👍','react','data-id="'+m.id+'"')+btn('Відповісти','reply','data-id="'+m.id+'"')+'</div><details><summary>Дії</summary><div class="nb-row">'+(mine?btn('Редагувати','message-edit','data-id="'+m.id+'"'):'')+(mine||S.canModerate?btn('Видалити','message-delete','data-id="'+m.id+'"','',''):'')+(S.canModerate?btn(m.pinned?'Відкріпити':'Закріпити','message-pin','data-id="'+m.id+'"')+(!mine&&!m.isLeader?btn('Обмежити на 1 год','message-mute','data-id="'+m.id+'"'):''):'')+'</div></details>')+'</article>';
 }).join('')+(ms.length?'':empty('Повідомлень поки немає. Почни розмову.'))+'</div>';
 const quote=S.messages.find(m=>m.id===S.reply);
 out+='<form id="nb-compose" class="nb-compose">'+(quote?'<div class="nb-reply">Відповідь '+esc(quote.name)+': '+esc(quote.body.slice(0,100))+btn('×','reply-clear')+'</div>':'')+'<label for="nb-message">Повідомлення</label><textarea id="nb-message" maxlength="4000" placeholder="Напиши повідомлення…">'+esc(S.chatDraft)+'</textarea>'+filesHtml(S.chatFiles,'chat')+'<div class="nb-row">'+btn('Фото / файл','chat-file')+btn('Конспект','chat-note')+'<button type="submit" class="nb-btn nb-primary" '+(S.loading?'disabled':'')+'>Надіслати</button></div><input type="file" id="nb-chat-file" accept="image/jpeg,image/png,image/webp,application/pdf,.doc,.docx,.txt" hidden></form>';
 return out;
}
function friendsView(){
 if(!S.ready)return empty('Друзі з’являться після входу через тестового Telegram-бота.');
 if(S.friendDetail)return friendView();
 const accepted=S.friends.filter(f=>f.state==='accepted').sort((a,b)=>Number(b.favorite)-Number(a.favorite)||a.name.localeCompare(b.name,'uk'));
 let out='<details><summary>Мій код і запрошення друга</summary><div class="nb-card"><div class="nb-code">'+esc(S.me.friend_code)+'</div><p class="nb-sub">Друг вводить код і надсилає запит. Після підтвердження ви стаєте друзями.</p>'+btn('Скопіювати код','friend-code')+'<label for="nb-friend-code">Код друга</label><input id="nb-friend-code" placeholder="Код із 12 символів" maxlength="32">'+btn('Надіслати запит','friend-request')+'</div></details>';
 const requests=S.friends.filter(f=>f.state==='pending');if(requests.length)out+='<h2>Запити</h2><div class="nb-stack">'+requests.map(f=>'<div class="nb-card"><strong>'+esc(f.name)+'</strong><p class="nb-sub">'+(f.incoming?'Хоче додати тебе в друзі':'Очікує підтвердження')+'</p>'+(f.incoming?'<div class="nb-row">'+btn('Прийняти','friend-respond','data-id="'+f.id+'" data-accept="true"','nb-primary')+btn('Відхилити','friend-respond','data-id="'+f.id+'" data-accept="false"')+'</div>':'')+'</div>').join('')+'</div>';
 out+='<h2>Мої друзі · '+accepted.length+'</h2><div class="nb-stack">'+accepted.map(f=>'<button class="nb-card nb-full" type="button" data-action="friend-open" data-id="'+f.id+'"><div class="nb-friend-head"><span class="nb-avatar">'+esc(f.name.slice(0,1))+'</span><div><strong>'+(f.favorite?'★ ':'')+esc(f.name)+'</strong><p class="nb-sub">'+esc(f.status||'Відкрити розклад і спільні вікна')+'</p></div></div></button>').join('')+(accepted.length?'':empty('Додай друга за кодом. Він має підтвердити запит.'))+'</div>';
 out+='<details><summary>Хто бачить мій розклад і статус</summary><label for="nb-global-privacy">Видимість для друзів</label><select id="nb-global-privacy">'+Object.entries(privacy).filter(([k])=>k!=='inherit').map(([k,v])=>'<option value="'+k+'" '+(S.me.privacy===k?'selected':'')+'>'+v+'</option>').join('')+'</select><p class="nb-sub">Це інформація за розкладом, не геолокація. Для окремого друга можна задати інший доступ.</p><label for="nb-my-status">Мій статус</label><input id="nb-my-status" maxlength="100" value="'+esc(S.me.status_until>Date.now()?S.me.status:'')+'" placeholder="Наприклад, шукаю компанію на обід"><label for="nb-status-hours">Прибрати через</label><select id="nb-status-hours"><option value="1">1 годину</option><option value="3">3 години</option><option value="24">24 години</option></select>'+btn('Зберегти','friend-privacy','','nb-primary')+'</details>';
 out+='<details><summary>Запрошення зустрітися · '+S.invitations.filter(i=>i.receiver_id===S.me.id&&i.state==='pending').length+'</summary>'+invitationsView()+'</details>';return out;
}
function invitationsView(){return '<div class="nb-stack">'+S.invitations.map(i=>'<div class="nb-card"><strong>'+esc(i.sender_id===S.me.id?'Для '+i.receiver_name:'Від '+i.sender_name)+'</strong><p>'+esc(i.place)+' · '+esc(new Date(i.starts_at).toLocaleString('uk-UA'))+'</p><p class="nb-sub">'+({pending:'Очікує відповіді',accepted:'Прийнято',declined:'Відхилено'}[i.state]||i.state)+'</p>'+(i.receiver_id===S.me.id&&i.state==='pending'?'<div class="nb-row">'+btn('Прийняти','invite-respond','data-id="'+i.id+'" data-value="accepted"')+btn('Відхилити','invite-respond','data-id="'+i.id+'" data-value="declined"')+'</div>':'')+'</div>').join('')+(S.invitations.length?'':empty('Запрошень поки немає.'))+'</div>'}
function friendView(){const f=S.friends.find(x=>x.id===S.friendDetail);if(!f)return empty('Друга більше немає у списку.');const a=S.availability;
 let out=btn('← Друзі','friend-back')+'<h2>'+esc(f.name)+'</h2>'+(f.status?'<p>'+esc(f.status)+'</p>':'')+'<div class="nb-row">'+btn('Написати','dm','data-id="'+f.id+'"','nb-primary')+btn(f.favorite?'★ В обраних':'☆ В обране','favorite','data-id="'+f.id+'"')+'</div>';
 out+='<div class="nb-card" style="margin-top:14px"><h3>Зараз за розкладом</h3>'+(a?(a.hidden?'<p class="nb-sub">Друг приховав свій розклад.</p>':'<p>'+esc(a.subject||(a.busy?'На парі':'Зараз вільний'))+'</p>'+(a.room?'<p>'+esc(a.room)+'</p>':'')+'<p class="nb-sub">'+(a.ends?'Пара до '+esc(a.ends):a.nextStart?'Наступна пара о '+esc(a.nextStart):'На сьогодні більше пар немає')+'</p><h3>Спільні вікна сьогодні</h3>'+a.common.map(w=>'<p>'+esc(w.start)+'–'+esc(w.end)+'</p>').join('')+(a.common.length?'':'<p class="nb-sub">Спільних вікон від 20 хвилин до 20:00 немає.</p>')+'<p class="nb-sub">'+esc(a.notice)+'</p>'):'<p class="nb-sub">Завантажуємо розклад…</p>')+'</div>';
 out+='<details><summary>Запросити зустрітися</summary><label for="nb-invite-date">Дата й час</label><input id="nb-invite-date" type="datetime-local"><label for="nb-invite-place">Де зустрінемось</label><input id="nb-invite-place" maxlength="160" placeholder="Наприклад, біля корпусу №1">'+btn('Надіслати запрошення','invite','data-id="'+f.id+'"','nb-primary')+'</details>';
 out+='<details><summary>Мій розклад для цього друга</summary><select id="nb-one-privacy" aria-label="Видимість для друга">'+Object.entries(privacy).map(([k,v])=>'<option value="'+k+'" '+(f.shareWith===k?'selected':'')+'>'+v+'</option>').join('')+'</select>'+btn('Зберегти доступ','friend-one-privacy','data-id="'+f.id+'"')+btn('Прибрати з друзів','friend-remove','data-id="'+f.id+'"','nb-danger')+'</details>';return out;
}
function render(){
 ensure();const head='<section id="dp-nb"><div class="nb-header"><div><span class="nb-kicker">DEPARA · НАВЧАННЯ РАЗОМ</span><h1>Зошит</h1></div>'+btn('↻','refresh','aria-label="Оновити зошит"')+'</div><div class="nb-tabs" role="tablist" aria-label="Розділи зошита">'+[['notes','Конспекти'],['chats','Чати'],['friends','Друзі']].map(([k,v])=>'<button type="button" role="tab" aria-selected="'+(S.tab===k)+'" data-action="tab" data-value="'+k+'">'+v+'</button>').join('')+'</div>';
 return head+(S.error?'<div class="nb-alert nb-error" role="alert">'+esc(S.error)+' '+btn('Повторити','refresh')+'</div>':'')+(!auth()?'<div class="nb-alert">Особисті записи зберігаються на цьому пристрої. Для чатів, друзів і публікації відкрий тестовий Telegram-бот.</div>':'')+'<span class="nb-status" aria-live="polite">'+(S.loading?'Оновлення…':S.ready?'Підключено · '+esc(S.me.group.name):'Локальні записи')+'</span><div role="tabpanel">'+(S.tab==='notes'?notesView():S.tab==='chats'?chatsView():friendsView())+'</div></section>';
}
function draw(){if(!active())return;const screen=$('#screen');if(!screen)return;const y=window.scrollY;screen.innerHTML=render();if(window.scrollY!==y)window.scrollTo(0,y)}
function newNote(){const n={id:uuid(),title:'Новий зошит',body:'',subject:S.subject||'',kind:S.subject?S.section:'note',due:'',done:0,visibility:'private',audience:[],attachments:[],created_at:Date.now(),updated_at:Date.now(),dirty:true,owner_id:S.me?.id||undefined};S.note=n;persist(n);draw();$('#dp-nb-title')?.focus()}
function updateDraft(){const n=S.note;if(!n)return;n.updated_at=Date.now();n.dirty=true;const ok=persist(n);const status=$('#dp-nb-status');if(status)status.textContent=ok?'✓ Чернетку збережено на цьому пристрої':'Не вдалося зберегти — скопіюй текст';clearTimeout(saveTimer);if(S.ready&&n.visibility==='private')saveTimer=setTimeout(()=>{void saveNote(false).catch(e=>{S.error=messageError(e);draw()})},1000)}
async function saveNote(explicit){
 const n=S.note;if(!n)return;
 if(!n.title.trim())throw Error('INVALID_FIELD');
 if(!S.ready){if(n.visibility!=='private')throw Error('AUTH_REQUIRED');persist(n);toast('Збережено на цьому пристрої');return}
 if(n.visibility!=='private'&&!explicit)return;
 if(explicit&&n.visibility!=='private'&&!confirm(scopeLabel(n.visibility)+' Опублікувати цей запис?'))return;
 const snapshot=JSON.parse(JSON.stringify(n));S.saving=true;
 const task=async()=>{try{const result=await api('notes/save','POST',{...snapshot,revision:n.revision});n.revision=result.note.revision;const latest=S.drafts.find(x=>x.id===n.id);if(latest&&latest.updated_at===snapshot.updated_at){Object.assign(latest,{revision:n.revision,dirty:false});n.dirty=false;}else if(latest)latest.revision=n.revision;const stored={...snapshot,revision:n.revision,dirty:false};const at=S.notes.findIndex(x=>x.id===n.id);if(at<0)S.notes.unshift(stored);else S.notes[at]=stored;localStore();if(explicit)toast('Збережено');}finally{S.saving=false;const status=$('#dp-nb-status');if(status)status.textContent=n.dirty?'Чернетку збережено':'✓ Збережено в хмарі'}};
 const next=saveChain.catch(()=>{}).then(task);saveChain=next;return next;
}
async function openThread(key,title){S.tab='chats';S.thread={key,title};S.messages=[];S.reply=0;S.chatDraft='';S.chatFiles=[];S.chatSearch='';await refreshThread();}
async function refreshThread(older=false){if(!S.thread)return;const channel=S.thread.key;const before=older&&S.messages.length?'&before='+S.messages[0].id:'';const r=await api('messages?channel='+encodeURIComponent(channel)+before);if(S.thread?.key!==channel)return;S.messages=older?[...r.messages,...S.messages]:r.messages;S.canModerate=r.canModerate;if(S.messages.length)await api('messages/read','POST',{channel,id:S.messages.at(-1).id});}
async function addFiles(file,chat){if(!file)return;let data,type=file.type||'application/octet-stream';if(/^image\/(jpeg|png|webp)$/.test(type)){
 const image=await createImageBitmap(file);const scale=Math.min(1,1000/Math.max(image.width,image.height)),canvas=document.createElement('canvas');canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);image.close();data=canvas.toDataURL('image/jpeg',.7);type='image/jpeg';
 }else{if(file.size>500000)throw Error('TOO_LARGE');data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file)})}
 const target=chat?S.chatFiles:S.note.attachments;if(target.length>=3||target.reduce((n,a)=>n+a.data.length,0)+data.length>700000)throw Error('TOO_LARGE');target.push({name:file.name.slice(0,140),type,data});if(!chat)updateDraft();
}
function downloadFile(context,index){const files=context==='note'?S.note?.attachments:context==='chat'?S.chatFiles:S.messages.find(m=>'message-'+m.id===context)?.attachments;const f=files?.[index];if(!f)return;const encoded=f.data.split(',')[1],binary=atob(encoded),array=Uint8Array.from(binary,c=>c.charCodeAt(0));const url=URL.createObjectURL(new Blob([array],{type:f.type})),a=document.createElement('a');a.href=url;a.download=f.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000)}
document.addEventListener('click',async e=>{
 const nav=e.target.closest('#nav [data-page="notebook"]');if(nav){setTimeout(()=>{draw();ensure()},0);return}
 const b=e.target.closest('#dp-nb [data-action]');if(!b)return;const a=b.dataset.action,id=b.dataset.id;
 if(a==='tab'){clearTimeout(saveTimer);S.tab=b.dataset.value;S.error='';draw();if(S.tab==='chats'&&S.ready)void act(async()=>{S.electionData=await api('elections')});return}
 if(a==='download'){downloadFile(b.dataset.context,Number(b.dataset.index));return}
 if(a==='subject'){S.subject=b.dataset.value;S.section='note';S.search='';draw();return}
 if(a==='subjects'){S.subject=null;S.search='';draw();return}
 if(a==='subject-new'){const name=prompt('Назва предмета');if(name?.trim()){S.customSubjects.push(name.trim().slice(0,180));localStorage.setItem('dp_reborn2_nb_subjects',JSON.stringify(S.customSubjects));S.subject=name.trim().slice(0,180);draw()}return}
 if(a==='filter'){S.filter=b.dataset.value;draw();return}if(a==='section'){S.section=b.dataset.value;draw();return}
 if(a==='note-new'){newNote();return}
 if(a==='note-open'){const n=listNotes().find(n=>n.id===id);if(n){S.note=JSON.parse(JSON.stringify(n));draw()}return}
 if(a==='note-back'){clearTimeout(saveTimer);if(S.ready&&S.note?.visibility==='private'&&S.note?.dirty)void saveNote(false).catch(e=>{S.error=messageError(e);draw()});S.note=null;draw();return}
 if(a==='format'){const input=$('#dp-nb-body');if(!input)return;const v=b.dataset.value,start=input.selectionStart,end=input.selectionEnd,selected=input.value.slice(start,end);input.setRangeText(v+selected+(['**','*','=='].includes(v)?v:''),start,end,'end');input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();return}
 if(a==='note-file'){$('#nb-file')?.click();return}if(a==='chat-file'){$('#nb-chat-file')?.click();return}
 if(a==='file-remove'){S.note.attachments.splice(Number(b.dataset.index),1);updateDraft();draw();return}
 if(a==='friend-back'){S.friendDetail=null;S.availability=null;draw();return}
 if(a==='thread-back'){S.thread=null;S.chatDraft='';S.chatFiles=[];draw();return}
 if(a==='reply'){S.reply=Number(id);draw();$('#nb-message')?.focus();return}if(a==='reply-clear'){S.reply=0;draw();return}
 await act(async()=>{
  if(a==='refresh'){if(S.ready){await refreshNotes();await refreshFriends();if(S.thread)await refreshThread()}else await bootstrap();}
  if(a==='note-save'){clearTimeout(saveTimer);await saveNote(true)}
  if(a==='note-copy'){const source=S.note;S.note={...source,id:uuid(),title:source.title+' (копія)',owner_id:S.me?.id,visibility:'private',audience:[],revision:undefined,created_at:Date.now(),updated_at:Date.now(),dirty:true,author:undefined};persist(S.note);await saveNote(false)}
  if(a==='note-delete'){if(!confirm('Видалити цей запис?'))return;const n=S.note;if(S.ready&&n.revision)await api('notes/delete','POST',{id:n.id});S.notes=S.notes.filter(x=>x.id!==n.id);S.drafts=S.drafts.filter(x=>x.id!==n.id);localStore();S.note=null;}
  if(a==='note-reload'){await refreshNotes();const current=S.notes.find(n=>n.id===S.note.id);if(current){if(confirm('Твоя чернетка залишиться окремою копією. Відкрити серверну версію?')){S.drafts=S.drafts.filter(n=>n.id!==current.id);S.drafts.push({...S.note,id:uuid(),revision:undefined,visibility:'private',title:S.note.title+' (чернетка)',dirty:true});localStore();S.note={...current};S.error='';}}}
  if(a==='legacy-import'){if(!confirm('Додати попередні локальні записи до твого особистого облікового запису?'))return;const old=get(LEGACY,[]);let count=0;for(const n of old){if(S.notes.some(x=>x.id===n.id)||!n.title)continue;S.note={...n,subject:n.subject||'',visibility:'private',audience:[],attachments:[],kind:'note',owner_id:S.me.id,updated_at:Date.now(),dirty:true};persist(S.note);await saveNote(false);count++;}S.note=null;toast('Імпортовано: '+count);}
  if(a==='thread')await openThread(b.dataset.channel,b.dataset.title);
  if(a==='dm'){const f=S.friends.find(f=>f.id===id);if(f)await openThread('dm:'+ [S.me.id,f.id].sort().join(':'),f.name);}
  if(a==='thread-refresh')await refreshThread();if(a==='messages-older')await refreshThread(true);
  if(a==='note-from-chat'){await refreshNotes();const n=S.notes.find(n=>n.id===id);if(!n)throw Error('NOTE_NOT_SHARED');S.note={...n};S.tab='notes';}
  if(a==='react'||a.startsWith('message-')){let action={react:'react','message-edit':'edit','message-delete':'delete','message-pin':'pin','message-mute':'mute'}[a];if(!action)return;const m=S.messages.find(m=>m.id===Number(id));let data={id:Number(id),action,emoji:b.dataset.emoji||'👍'};if(action==='edit'){const t=prompt('Текст повідомлення',m.body);if(t===null)return;data.body=t}if((action==='delete'||action==='mute')&&!confirm(action==='delete'?'Видалити повідомлення?':'Обмежити надсилання в цьому чаті на годину?'))return;await api('messages/action','POST',data);await refreshThread();}
  if(a==='chat-note'){await refreshNotes();const eligible=S.notes.filter(n=>n.visibility!=='private');if(!eligible.length){toast('Спочатку опублікуй конспект для адресатів цього чату.');return}const value=prompt('Введи номер конспекту:\n'+eligible.slice(0,20).map((n,i)=>(i+1)+'. '+n.title+' ('+vis[n.visibility]+')').join('\n'));if(value===null)return;const n=eligible[Number(value)-1];if(!n)return;if(!confirm('Надіслати «'+n.title+'» у чат «'+S.thread.title+'»?'))return;await api('messages/send','POST',{channel:S.thread.key,noteId:n.id,body:'▤ '+n.title});await refreshThread();}
  if(a==='friend-code'){try{await navigator.clipboard.writeText(S.me.friend_code);toast('Код скопійовано')}catch{prompt('Скопіюй код',S.me.friend_code)}}
  if(a==='friend-request'){await api('friends/request','POST',{code:$('#nb-friend-code').value});await refreshFriends();toast('Запит надіслано');}
  if(a==='friend-respond'){await api('friends/respond','POST',{userId:id,accept:b.dataset.accept==='true'});await refreshFriends();}
  if(a==='friend-open'){S.friendDetail=id;S.availability=null;const result=await api('friends/availability?userId='+id);S.availability=result;}
  if(a==='favorite'||a==='friend-one-privacy'||a==='friend-remove'){const f=S.friends.find(f=>f.id===id);if(a==='friend-remove'&&!confirm('Прибрати з друзів? Доступ до приватних розмов і записів для друзів буде закрито.'))return;await api('friends/options','POST',{userId:id,favorite:a==='favorite'?!f.favorite:f.favorite,privacy:a==='friend-one-privacy'?$('#nb-one-privacy').value:f.shareWith,remove:a==='friend-remove'});await refreshFriends();if(a==='friend-remove')S.friendDetail=null;}
  if(a==='friend-privacy'){await api('profile','POST',{groupId:gid(),privacy:$('#nb-global-privacy').value,status:$('#nb-my-status').value,statusUntil:Date.now()+Number($('#nb-status-hours').value)*3600000});await refreshFriends();toast('Доступ і статус збережено');}
  if(a==='invite'){const startsAt=new Date($('#nb-invite-date').value);if(!Number.isFinite(startsAt.getTime()))throw Error('INVALID_DATE');await api('invitations','POST',{userId:id,startsAt:startsAt.toISOString(),place:$('#nb-invite-place').value});await refreshFriends();toast('Запрошення надіслано');}
  if(a==='invite-respond'){await api('invitations/respond','POST',{id,state:b.dataset.value});await refreshFriends();}
  if(a==='elections-load')S.electionData=await api('elections');
  if(a==='election-start'){if(!confirm('Почати голосування на 48 годин? Правила показані в розділі виборів.'))return;await api('elections/start','POST',{action:b.dataset.value});S.electionData=await api('elections');}
  if(a==='vote'){await api('elections/vote','POST',{id:S.electionData.election.id,yes:b.dataset.yes==='true'});S.electionData=await api('elections');}
 });
});
document.addEventListener('input',e=>{
 const el=e.target;if(!el.closest('#dp-nb'))return;
 if(el.id==='nb-search'||el.id==='nb-chat-search'){const pos=el.selectionStart,key=el.id==='nb-search'?'search':'chatSearch';S[key]=el.value;draw();const fresh=$('#'+el.id);fresh?.focus();try{fresh?.setSelectionRange(pos,pos)}catch{}return}
 if(el.id==='nb-message'){S.chatDraft=el.value;return}
 const map={'dp-nb-title':'title','dp-nb-body':'body','nb-subject':'subject','nb-due':'due'};if(map[el.id]&&S.note){S.note[map[el.id]]=el.value;updateDraft();}
});
document.addEventListener('change',e=>{const el=e.target;if(!el.closest('#dp-nb'))return;
 if(el.id==='nb-kind'||el.id==='nb-visibility'||el.id==='nb-done'||el.dataset.audience){if(!S.note)return;if(el.id==='nb-kind')S.note.kind=el.value;if(el.id==='nb-done')S.note.done=el.checked?1:0;if(el.id==='nb-visibility')S.note.visibility=el.value;if(el.dataset.audience){const a=new Set(S.note.audience||[]);el.checked?a.add(el.dataset.audience):a.delete(el.dataset.audience);S.note.audience=[...a]}updateDraft();if(el.id==='nb-visibility')draw();}
 if(el.id==='nb-file'||el.id==='nb-chat-file'){const file=el.files?.[0];el.value='';void act(()=>addFiles(file,el.id==='nb-chat-file'));}
});
document.addEventListener('submit',e=>{if(e.target.id!=='nb-compose')return;e.preventDefault();void act(async()=>{if(!S.chatDraft.trim()&&!S.chatFiles.length)return;await api('messages/send','POST',{channel:S.thread.key,body:S.chatDraft,attachments:S.chatFiles,replyId:S.reply});S.chatDraft='';S.chatFiles=[];S.reply=0;await refreshThread()})});
window.addEventListener('depara:student-group',()=>{requestEpoch++;attemptedGroup=null;S.ready=false;S.me=null;S.thread=null;S.note=null;S.notes=[];S.subject=null;S.friendDetail=null;S.availability=null;S.electionData=null;if(active())setTimeout(()=>void bootstrap(),0)});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&active()&&S.ready&&!S.loading)void act(async()=>{await refreshFriends();if(S.thread)await refreshThread()})});
setInterval(async()=>{if(!active()||!S.ready||S.loading||!S.thread||document.visibilityState==='hidden'||document.activeElement?.matches('input,textarea,select'))return;try{const before=JSON.stringify(S.messages);await refreshThread();if(before!==JSON.stringify(S.messages))draw()}catch{}},7000);
window.DeParaNotebook={render,version:2};
})();

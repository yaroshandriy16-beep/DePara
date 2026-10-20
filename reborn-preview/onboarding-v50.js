(()=>{
'use strict';
const $=s=>document.querySelector(s), root=$('#dp-onboarding'), roles=$('#dp-onboarding-roles');
if(!root||!roles)return;
const K='dp_reborn2_',roleKey=K+'role',setupKey=K+'student_setup';
const read=k=>{try{return localStorage.getItem(k)}catch{return null}},write=(k,v)=>{try{localStorage.setItem(k,v)}catch{}};
const inner=root.querySelector('.dp-onboarding-inner');
const logo=root.querySelector('.dp-onboarding-logo');
if(logo){logo.setAttribute('aria-hidden','true');}
const tagline=root.querySelector('.dp-onboarding-sub');
if(tagline)tagline.textContent='Навчання у твоєму ритмі';
roles.innerHTML='<div class="dp-step">КРОК 1 ІЗ 2</div><h2>Хто ви?</h2><p>Налаштуємо простір під вас</p><button type="button" data-dp-role="student"><span>🎓</span><strong>Я студент</strong><small>Розклад, завдання, оцінки та група</small></button><button type="button" data-dp-role="teacher"><span>📚</span><strong>Я викладач</strong><small>Перегляд розкладу та занять</small></button>';
const setup=document.createElement('section');setup.className='dp-student-setup dp-v50-step';setup.hidden=true;
setup.innerHTML='<div class="dp-step">КРОК 2 ІЗ 2</div><div class="dp-setup-head"><span>🎓</span><h2>Знайдемо твою групу</h2><p>Обери факультет, курс і групу ВНАУ</p></div><label for="dp-faculty">Факультет</label><select id="dp-faculty"></select><label for="dp-course">Курс</label><select id="dp-course" disabled></select><label for="dp-group">Група <span id="dp-group-count"></span></label><select id="dp-group" disabled></select><label for="dp-group-search">Швидкий пошук групи</label><input id="dp-group-search" type="search" placeholder="Наприклад, ЕІ-23-1" autocomplete="off"><div id="dp-search-results" class="dp-search-results" role="listbox" aria-label="Знайдені групи"></div><p id="dp-setup-error" role="status"></p><button id="dp-setup-done" type="button" disabled>Це моя група →</button><button id="dp-setup-back" type="button">← До вибору ролі</button>';
inner.append(setup);
const teacher=document.createElement('section');teacher.className='dp-v50-step dp-teacher-step';teacher.hidden=true;
teacher.innerHTML='<div class="dp-step">КРОК 2 ІЗ 2 · ВИКЛАДАЧ</div><div class="dp-setup-head"><span>📚</span><h2>Знайди себе у ВНАУ</h2><p>Обери викладача, щоб відкрити персональний розклад</p></div><label for="dp-teacher-search">Прізвище викладача</label><input id="dp-teacher-search" type="search" placeholder="Почни вводити прізвище…" autocomplete="off"><div id="dp-teacher-search-results" class="dp-search-results" role="listbox" aria-label="Викладачі ВНАУ"></div><p id="dp-teacher-status" role="status">Завантажуємо список викладачів…</p><button type="button" id="dp-teacher-enter" disabled>Відкрити мій розклад →</button><button type="button" id="dp-teacher-back">← Обрати іншу роль</button>';
inner.append(teacher);
const success=document.createElement('section');success.className='dp-v50-step dp-success-step';success.hidden=true;
success.innerHTML='<div class="dp-success-icon">✓</div><h2>Твій розклад готовий!</h2><p id="dp-success-group"></p><button type="button" id="dp-success-enter">Відкрити ДеПара? →</button>';inner.append(success);
const fac=$('#dp-faculty'),course=$('#dp-course'),group=$('#dp-group'),search=$('#dp-group-search'),done=$('#dp-setup-done'),err=$('#dp-setup-error'),count=$('#dp-group-count');
let catalog=[],filtered=[],mode='first',animationTimer=null;
const opts=(el,items,label)=>{el.replaceChildren(new Option(label,''));for(const item of items)el.add(new Option(item.name,String(item.id)));el.disabled=!items.length};
const show=el=>{for(const part of [roles,setup,teacher,success])part.hidden=part!==el;if(el){el.classList.remove('dp-roles-visible');requestAnimationFrame(()=>el.classList.add('dp-roles-visible'))}};
const reveal=()=>{root.hidden=false;root.style.display='flex';root.classList.remove('dp-onboarding-out');document.body.classList.add('dp-onboarding-active')};
const finish=()=>{root.classList.add('dp-onboarding-out');setTimeout(()=>{root.hidden=true;root.style.display='none';document.body.classList.remove('dp-onboarding-active')},460)};
const results=$('#dp-search-results');const norm=s=>String(s||'').toLocaleLowerCase('uk').replace(/[‐‑‒–—−]/g,'-').replace(/\\s+/g,'').trim();
function filterGroups(){const f=catalog.find(x=>String(x.id)===fac.value),c=f?.courses?.find(x=>String(x.course)===course.value);const groups=c?.groups||[];opts(group,groups,'Оберіть групу');count.textContent=groups.length?'· '+groups.length+' груп':'';done.disabled=true;updateResults()}
function updateResults(){results.replaceChildren();const q=norm(search.value);if(!q)return;const selectedFaculty=catalog.find(f=>String(f.id)===fac.value);const matches=[];for(const f of (selectedFaculty?[selectedFaculty]:catalog)){for(const c of (course.value?(f.courses||[]).filter(c=>String(c.course)===course.value):f.courses||[])){for(const g of c.groups||[]){if(norm(g.name).includes(q))matches.push({f,c,g})}}}for(const match of matches.slice(0,12)){const b=document.createElement('button');b.type='button';b.className='dp-search-result';b.textContent=match.g.name+' · '+match.c.course+' курс';b.addEventListener('click',()=>{fac.value=String(match.f.id);fac.dispatchEvent(new Event('change'));course.value=String(match.c.course);course.dispatchEvent(new Event('change'));group.value=String(match.g.id);done.disabled=false;search.value=match.g.name;results.replaceChildren();});results.append(b)}if(!matches.length){const p=document.createElement('p');p.textContent='Групу не знайдено';results.append(p)}}
async function studentSetup(){reveal();show(setup);err.textContent='';opts(fac,[],'Завантаження…');opts(course,[],'Спочатку факультет');opts(group,[],'Спочатку курс');done.disabled=true;
try{let response=await fetch('../data/catalog.json');if(!response.ok)throw Error('catalog');const data=await response.json();catalog=data.faculties||[];write(K+'onboarding_catalog',JSON.stringify(catalog))}
catch{try{catalog=JSON.parse(read(K+'onboarding_catalog')||'[]')}catch{catalog=[]}}
if(!catalog.length){err.textContent='Каталог недоступний. Перевір інтернет і спробуй знову.';return}
opts(fac,catalog.map(f=>({id:f.id,name:f.name})),'Оберіть факультет');
const selected=read(K+'group');if(selected){for(const f of catalog)for(const c of f.courses||[])if((c.groups||[]).some(g=>String(g.id)===selected)){fac.value=String(f.id);fac.dispatchEvent(new Event('change'));course.value=String(c.course);course.dispatchEvent(new Event('change'));group.value=selected;done.disabled=false;return}}
}
fac.addEventListener('change',()=>{const f=catalog.find(x=>String(x.id)===fac.value);opts(course,(f?.courses||[]).map(c=>({id:c.course,name:c.course+' курс'})),'Оберіть курс');filterGroups()});
course.addEventListener('change',()=>{filterGroups()});
search.addEventListener('input',updateResults);
group.addEventListener('change',()=>done.disabled=!group.value);
done.addEventListener('click',()=>{if(!group.value)return;const name=group.selectedOptions[0].textContent,id=group.value;write(roleKey,'student');write(setupKey,'1');document.body.dataset.dpRole='student';window.dispatchEvent(new CustomEvent('depara:student-group',{detail:{id,name}}));$('#dp-success-group').textContent=name+' · ВНАУ';show(success)});
$('#dp-success-enter').addEventListener('click',finish);
$('#dp-setup-back').addEventListener('click',()=>show(roles));
let teacherList=[],chosenTeacher=null;
const tInput=$('#dp-teacher-search'),tResults=$('#dp-teacher-search-results'),tStatus=$('#dp-teacher-status'),tEnter=$('#dp-teacher-enter');
const teacherName=t=>String(t.name||'').replace(/^\\*/,'').trim();
async function teacherSetup(){reveal();show(teacher);chosenTeacher=null;tEnter.disabled=true;tInput.value='';tResults.replaceChildren();tStatus.textContent='Завантажуємо список викладачів…';
try{const response=await fetch('../data/teachers/catalog.json');if(!response.ok)throw Error('catalog');const data=await response.json();teacherList=Array.from(new Map((data.teachers||[]).map(t=>[String(t.id),t])).values());tStatus.textContent='Викладачів у базі: '+teacherList.length+'. Введи щонайменше 2 літери.';}catch{tStatus.textContent='Не вдалося завантажити викладачів. Перевір інтернет і відкрий цей екран ще раз.'}}
tInput.addEventListener('input',()=>{chosenTeacher=null;tEnter.disabled=true;tResults.replaceChildren();const q=tInput.value.trim().toLocaleLowerCase('uk');if(q.length<2){tStatus.textContent='Введи щонайменше 2 літери прізвища';return}const matches=teacherList.filter(t=>teacherName(t).toLocaleLowerCase('uk').includes(q)).slice(0,35);tStatus.textContent=matches.length?'Знайдено: '+matches.length+(matches.length===35?' (перші 35)':''):'Нічого не знайдено';for(const t of matches){const b=document.createElement('button');b.type='button';b.className='dp-search-result';b.textContent=teacherName(t)+(t.chair?' · '+t.chair:'');b.addEventListener('click',()=>{chosenTeacher=t;tInput.value=teacherName(t);tResults.replaceChildren();tStatus.textContent='Обрано: '+teacherName(t);tEnter.disabled=false;tInput.blur();tEnter.scrollIntoView({block:'nearest',behavior:'smooth'})});tResults.append(b)}});
function choose(value){if(value==='student'){studentSetup();return}teacherSetup()}
roles.addEventListener('click',e=>{const b=e.target.closest('[data-dp-role]');if(b)choose(b.dataset.dpRole)});
$('#dp-teacher-enter').addEventListener('click',()=>{if(!chosenTeacher)return;write(K+'teacher_v1',JSON.stringify({name:teacherName(chosenTeacher),teacherId:String(chosenTeacher.id)}));write(roleKey,'teacher');document.body.dataset.dpRole='teacher';finish();if(typeof window.DeParaOpenTeacher==='function')window.DeParaOpenTeacher(String(chosenTeacher.id));else window.dispatchEvent(new CustomEvent('depara:teacher-open',{detail:{id:String(chosenTeacher.id)}}))});
$('#dp-teacher-back').addEventListener('click',()=>show(roles));
function start(){reveal();show(null);const role=read(roleKey);animationTimer=setTimeout(()=>{if(role==='student'&&read(setupKey)==='1'){document.body.dataset.dpRole='student';finish()}else if(role==='teacher'&&read(K+'teacher_v1')){document.body.dataset.dpRole='teacher';finish()}else show(roles)},1050)}
window.DeParaChangeRole=()=>{clearTimeout(animationTimer);localStorage.removeItem(roleKey);document.body.dataset.dpRole='';document.body.classList.remove('dp-teacher-active');const dashboard=document.querySelector('#dp-teacher-app');if(dashboard){dashboard.hidden=true;dashboard.style.display='none'}reveal();show(roles)};
window.DeParaChangeTeacher=()=>{clearTimeout(animationTimer);localStorage.removeItem(roleKey);document.body.classList.remove('dp-teacher-active');const dashboard=document.querySelector('#dp-teacher-app');if(dashboard){dashboard.hidden=true;dashboard.style.display='none'}teacherSetup()};
window.DeParaChangeGroup=()=>{clearTimeout(animationTimer);mode='change';studentSetup()};
window.DeParaReplayWelcome=()=>{clearTimeout(animationTimer);reveal();show(null);setTimeout(()=>show(roles),1100)};
start();
})();
/* DePara NEXT — independent presentation & navigation layer. Never modifies schedule data. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const entries=[
 ['home','Головна','Пульс дня','⌂'],['schedule','Розклад','День, тиждень, місяць','▦'],
 ['tasks','Завдання','Нотатки й дедлайни','✓'],['rooms','Аудиторії','Знайти вільне місце','⌑'],
 ['teachers','Викладачі','Розклад і кафедри','♙'],['hub','Мій простір','Теми, сезон, налаштування','◈']
];
const dialog=$('nextCommand'),input=$('nextCommandInput'),results=$('nextCommandResults');
let focusBefore=null;
function close(){if(!dialog||dialog.hidden)return;dialog.hidden=true;document.body.classList.remove('next-modal-open');focusBefore?.focus?.()}
function open(){if(!dialog)return;focusBefore=document.activeElement;dialog.hidden=false;document.body.classList.add('next-modal-open');input.value='';renderResults();input.focus()}
function renderResults(){const q=input.value.trim().toLocaleLowerCase('uk');const matches=entries.filter(e=>e.slice(1,3).join(' ').toLocaleLowerCase('uk').includes(q));results.replaceChildren();if(!matches.length){const p=document.createElement('p');p.className='next-empty';p.textContent='Нічого не знайдено';results.append(p);return}matches.forEach(([id,title,desc,icon])=>{const b=document.createElement('button');b.type='button';b.className='next-result';b.innerHTML='<span class="next-result-icon"></span><span class="next-result-copy"><strong></strong><small></small></span><span class="next-result-arrow">↗</span>';b.querySelector('.next-result-icon').textContent=icon;b.querySelector('strong').textContent=title;b.querySelector('small').textContent=desc;b.addEventListener('click',()=>{close();const target=document.querySelector('.bottom-nav [data-go="'+id+'"]')||document.querySelector('[data-go="'+id+'"]');if(target)target.click();else{document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id===id+'View'));document.querySelectorAll('.bottom-nav [data-go]').forEach(v=>v.classList.toggle('active',v.dataset.go===id));window.scrollTo(0,0)}});results.append(b)})}
$('searchBtn')?.addEventListener('click',e=>{e.stopImmediatePropagation();e.preventDefault();open()},true);
$('nextCommandClose')?.addEventListener('click',close);
dialog?.querySelector('[data-next-close]')?.addEventListener('click',close);
input?.addEventListener('input',renderResults);
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();dialog.hidden?open():close()}else if(e.key==='Escape')close();else if(e.key==='Enter'&&!dialog.hidden&&document.activeElement===input){e.preventDefault();results.querySelector('button')?.click()}});
// Add transient navigation motion to each actual view, without taking over application routing.
const observer=new MutationObserver(changes=>{for(const change of changes){if(change.type!=='attributes'||change.attributeName!=='class')continue;const view=change.target;if(!view.classList?.contains('view')||!view.classList.contains('active')||change.oldValue?.split(/\s+/).includes('active'))continue;view.classList.remove('next-arriving');void view.offsetWidth;view.classList.add('next-arriving');if(window.Telegram?.WebApp?.HapticFeedback){} }});
document.querySelectorAll('.view').forEach(v=>observer.observe(v,{attributes:true,attributeOldValue:true,attributeFilter:['class']}));
// Re-render seasonal ambient label using the season module's current root dataset.
const labels={autumn:'🍂 ОСІННЯ АТМОСФЕРА',winter:'❄️ ЗИМОВА АТМОСФЕРА',spring:'🌸 ВЕСНЯНА АТМОСФЕРА',summer:'☀️ ЛІТНЯ АТМОСФЕРА'};
const intro=$('nextIntro');if(intro){const label=document.createElement('span');label.className='next-season-label';intro.append(label);const update=()=>{const root=document.documentElement;const season=root.dataset.season||document.body.dataset.season||'autumn';label.textContent=labels[season]||'✦ DEPARA ATMOSPHERE'};update();new MutationObserver(update).observe(document.documentElement,{attributes:true,attributeFilter:['data-season']});}
// No weather/location requests, no new network dependencies, no token exposure.
})();

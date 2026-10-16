(()=>{'use strict';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let snapshot=null,loadError='';
function valid(j){return j&&/^\d{4}-\d{2}-\d{2}$/.test(j.date||'')&&Number.isInteger(Number(j.startPair))&&Array.isArray(j.rooms)&&j.rooms.every(r=>r&&typeof r.name==='string'&&typeof r.available==='boolean')}
function formatTime(t){if(!t)return 'невідомо';const d=new Date(t);return Number.isNaN(d.getTime())?'невідомо':d.toLocaleString('uk-UA',{timeZone:'Europe/Kyiv',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})+' (Київ)'}
function render(){if(!$('roomsList'))return;const info=$('roomsSnapshot'),count=$('roomsCount'),list=$('roomsList');if(!snapshot){info.textContent=loadError||'Завантаження даних…';count.textContent='';list.innerHTML='';return}
const j=snapshot,rooms=j.rooms,q=$('roomsSearch').value.trim().toLocaleLowerCase('uk-UA'),min=Number($('roomsCapacity').value),free=$('roomsFreeOnly').checked;
const filtered=rooms.filter(r=>(!free||r.available)&&(!min||Number(r.capacity)>=min)&&(!q||[r.name,r.note].some(x=>String(x||'').toLocaleLowerCase('uk-UA').includes(q))));
const available=rooms.filter(r=>r.available).length;
info.innerHTML=`<strong>📅 ${esc(j.date)} · ${esc(j.startPair)}${j.endPair!==j.startPair?'–'+esc(j.endPair):''}-а пара</strong><small>Оновлено: ${esc(formatTime(j.fetchedAt))}</small><small>Це знімок лише для вказаної дати й пари, не перевірка в реальному часі.</small>${loadError?'<small class="rooms-error">'+esc(loadError)+'</small>':''}`;
count.textContent=`${available} вільних · ${rooms.length-available} зайнятих · показано ${filtered.length}`;
list.innerHTML=filtered.length?filtered.map(r=>`<div class="glass room-item"><div class="room-main"><strong>⌑ ${esc(r.name)}</strong><small>${r.capacity===null||r.capacity===undefined?'Місткість не вказана':esc(r.capacity)+' місць'}${r.note?' · '+esc(r.note):''}</small></div><span class="room-status ${r.available?'room-free':'room-busy'}">${r.available?'Вільна':'Зайнята'}</span></div>`).join(''):'<div class="empty">За вибраними фільтрами аудиторій немає.</div>';
}
async function load(){loadError='';if(!snapshot){$('roomsSnapshot').textContent='Завантаження даних…'}try{const response=await fetch('./data/campus/free-classrooms.json?t='+Date.now(),{cache:'no-store'});if(!response.ok)throw Error('HTTP '+response.status);const j=await response.json();if(!valid(j))throw Error('некоректний формат JSON');snapshot=j;try{localStorage.setItem('depara-rooms-snapshot',JSON.stringify(j))}catch{}}catch(e){loadError='Не вдалося оновити дані: '+e.message;if(!snapshot){try{const saved=JSON.parse(localStorage.getItem('depara-rooms-snapshot'));if(valid(saved))snapshot=saved}catch{}}}render()}
function init(){if(!$('roomsView'))return;['roomsSearch','roomsCapacity','roomsFreeOnly'].forEach(id=>$(id).addEventListener(id==='roomsSearch'?'input':'change',render));$('roomsRefresh').addEventListener('click',load);load();document.addEventListener('visibilitychange',()=>{if(!document.hidden&&$('roomsView').classList.contains('active'))load()})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();

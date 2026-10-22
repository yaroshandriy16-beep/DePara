/* Telegram user photo for home and profile; preview only */
(()=>{'use strict';
const screen=document.querySelector('#screen');if(!screen)return;
function user(){
 const tg=window.Telegram?.WebApp?.initDataUnsafe?.user;
 if(tg?.photo_url&&/^https:\/\//i.test(tg.photo_url))return tg;
 try{const a=JSON.parse(localStorage.getItem('dp_reborn2_authUser')||'null');if(a?.photo_url&&/^https:\/\//i.test(a.photo_url))return a}catch{}
 return tg||null;
}
function apply(){
 const u=user(),photo=u?.photo_url;
 for(const selector of ['.reborn-home .home-sun','.profile-hero .profile-avatar']){
  const el=screen.querySelector(selector);if(!el)continue;
  if(!photo){
   el.querySelector('img[data-dp-telegram-photo]')?.remove();
   if(selector.includes('home-sun'))el.textContent='✦';
   continue;
  }
  let img=el.querySelector('img[data-dp-telegram-photo]');
  if(!img){el.textContent='';img=document.createElement('img');img.dataset.dpTelegramPhoto='1';img.alt='Фото профілю Telegram';img.referrerPolicy='no-referrer';img.loading='eager';img.addEventListener('error',()=>{img.remove();el.textContent=selector.includes('home-sun')?'✦':(u?.first_name?.charAt(0)||'Д').toUpperCase()});el.append(img)}
  if(img.getAttribute('src')!==photo)img.src=photo;
 }
}
let queued=false;function queue(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;apply()})}
new MutationObserver(queue).observe(screen,{childList:true,subtree:false});
document.querySelector('#nav')?.addEventListener('click',queue);
queue();
})();
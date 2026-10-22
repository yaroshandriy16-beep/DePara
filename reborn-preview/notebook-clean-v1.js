(()=>{'use strict';
const nav=document.querySelector('#nav'),screen=document.querySelector('#screen');
if(!nav||!screen)return;
const study=nav.querySelector('[data-page="study"]');
if(!study)return;
study.dataset.page='notebook';study.innerHTML='<span>▤</span>Зошит';
const social=nav.querySelector('[data-page="social"]');if(social)social.remove();
const style=document.createElement('style');
style.textContent='#nav{grid-template-columns:repeat(4,minmax(0,1fr))}#dp-clean-notebook{padding:20px 16px 100px;max-width:640px;margin:auto}#dp-clean-notebook h1{font-size:26px;margin:0 0 10px}#dp-clean-notebook p{line-height:1.6;opacity:.8}';
document.head.appendChild(style);
let active=false;
function render(){screen.innerHTML='<section id="dp-clean-notebook"><h1>Зошит</h1><p>Починаємо з чистої версії. Старі експериментальні конспекти, чати та журнал більше не підключені до цього екрана.</p></section>'}
nav.addEventListener('click',e=>{const b=e.target.closest('button[data-page]');if(!b)return;if(b.dataset.page==='notebook'){active=true;queueMicrotask(()=>{if(active){render();nav.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b))}})}else active=false},true);
})();
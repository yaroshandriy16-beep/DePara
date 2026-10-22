(()=>{'use strict';
const root=document.querySelector('#dp-launch');if(!root)return;
const skip=root.querySelector('#dp-launch-skip'),reduce=matchMedia('(prefers-reduced-motion: reduce)');
let timer=0,exitTimer=0,after=null,locked=[],previousFocus=null;
function unlock(){for(const [el,inert] of locked)el.inert=inert;locked=[];document.body.classList.remove('dp-intro-active')}
function close(immediate=false){
 clearTimeout(timer);clearTimeout(exitTimer);
 if(root.hidden)return;
 const callback=after;after=null;callback?.();
 root.classList.add('dp-launch-out');
 const finish=()=>{root.hidden=true;unlock();document.dispatchEvent(new CustomEvent('depara:intro-finished'));if(document.activeElement===skip){const target=!document.querySelector('#dp-onboarding')?.hidden?document.querySelector('[data-dp-role]'):previousFocus?.isConnected?previousFocus:null;target?.focus({preventScroll:true})}};
 if(immediate||reduce.matches)finish();else exitTimer=setTimeout(finish,320);
}
function play(callback,returning=false){
 clearTimeout(timer);clearTimeout(exitTimer);unlock();after=callback||null;previousFocus=document.activeElement;
 if(reduce.matches){root.hidden=false;close(true);return}
 root.hidden=false;root.classList.remove('dp-launch-out');document.body.classList.add('dp-intro-active');
 locked=Array.from(document.querySelectorAll('body>.app,#dp-teacher-app,#dp-onboarding')).map(el=>{const was=el.inert;el.inert=true;return[el,was]});
 root.getAnimations({subtree:true}).forEach(animation=>{animation.cancel();animation.play()});
 skip.focus({preventScroll:true});timer=setTimeout(()=>close(),returning?1000:1950);
}
skip.addEventListener('click',()=>close());
root.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();close()}if(event.key==='Tab'){event.preventDefault();skip.focus()}});
reduce.addEventListener('change',()=>{if(reduce.matches)close(true)});
window.addEventListener('pagehide',()=>close(true));
const replay=window.DeParaReplayWelcome;
window.DeParaReplayWelcome=()=>play(()=>replay?.());
window.DeParaPlayIntro=play;
play(null,document.documentElement.classList.contains('dp-resume'));
})();

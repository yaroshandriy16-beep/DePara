const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('reborn-notebook-preview/notebook-social.js','utf8');
function fixture(){
 const storage=new Map(),events={},timers=new Map(),calls=[],status={textContent:''};let timerId=0,failStorage=false;
 const document={visibilityState:'visible',activeElement:null,documentElement:{style:{setProperty(){}}},querySelector(s){if(s==='#dp-nb-status')return status;return null},addEventListener(n,fn){(events[n]??=[]).push(fn)}};
 const context={document,console,crypto:require('node:crypto').webcrypto,AbortController,URL,Date,Map,Set,JSON,Promise,requestAnimationFrame(){},confirm:()=>true,setInterval(){},clearTimeout(id){timers.delete(id)},setTimeout(fn){const id=++timerId;timers.set(id,fn);return id},localStorage:{getItem:k=>storage.get(k)||null,setItem(k,v){if(failStorage)throw Error('quota');storage.set(k,v)}},innerHeight:844,addEventListener(n,fn){(events['window:'+n]??=[]).push(fn)},Telegram:{WebApp:{initData:'signed',initDataUnsafe:{user:{id:100}}}}};
 context.window=context;context.globalThis=context;
 context.fetch=async(url,options)=>{const data=JSON.parse(options.body||'{}'),call={url,data};calls.push(call);return new Promise(resolve=>{call.reply=(revision=1)=>resolve({ok:true,json:async()=>({ok:true,note:{...data,revision}})});})};
 vm.runInNewContext(source.replace('window.DeParaNotebook={render,version:2};','window.testNotebook={S,updateDraft,saveNote,deleteNote,flushDraft,notesView,draw,newNote,edits,chain:()=>saveChain};'),context);
 const t=context.testNotebook;t.S.ready=true;t.S.me={id:'100',group:{name:'ЕІ-23-1'}};
 const note={id:'one',title:'Лекція',body:'Початок',visibility:'private',attachments:[],updated_at:1,dirty:true,owner_id:'100'};
 t.S.note=note;t.S.drafts=[{...note}];
 return {...t,note,storage,calls,status,events,context,timers,failStorage(){failStorage=true},tick:()=>new Promise(resolve=>setImmediate(resolve))};
}
test('Queued writes use latest revision and preserve edits made during a request',async()=>{
 const f=fixture();f.updateDraft();const first=f.saveNote(false);await f.tick();
 f.note.body='Нові правки';f.updateDraft();const second=f.saveNote(false);
 f.calls[0].reply(1);await first;await f.tick();
 assert.equal(f.S.drafts[0].dirty,true);assert.equal(f.calls[1].data.revision,1);assert.equal(f.calls[1].data.body,'Нові правки');
 f.calls[1].reply(2);await second;assert.equal(f.S.drafts[0].dirty,false);assert.equal(f.S.drafts[0].revision,2);
});
test('Two edits in the same millisecond cannot mark newer content clean',async()=>{
 const f=fixture();f.context.Date={now:()=>42};f.updateDraft();const pending=f.saveNote(false);await f.tick();f.note.body='Нове';f.updateDraft();f.calls[0].reply();await pending;
 assert.equal(f.S.drafts[0].dirty,true);assert.equal(f.S.drafts[0].body,'Нове');
});
test('Autosave stays attached to its original note after editor switches',async()=>{
 const f=fixture();f.updateDraft();const callback=[...f.timers.values()].at(-1);
 f.S.note={...f.note,id:'two',body:'Інший запис'};callback();await f.tick();assert.equal(f.calls[0].data.id,'one');f.calls[0].reply();await f.chain();
});
test('Delete waits for in-flight create and prevents queued resurrection',async()=>{
 const f=fixture();const first=f.saveNote(false);await f.tick();const queued=f.saveNote(false);const deletion=f.deleteNote();
 f.calls[0].reply(1);await first;await queued;await f.tick();assert.equal(f.calls.length,2);assert.match(f.calls[1].url,/notes\/delete$/);f.calls[1].reply();await deletion;
 assert.equal(f.S.notes.length,0);assert.equal(f.S.drafts.length,0);assert.equal(f.S.note,null);assert.equal(JSON.parse(f.storage.get('dp_reborn2_nb_drafts_100')).length,0);
});
test('Leaving editor queues private draft, but never publishes shared drafts',async()=>{
 const f=fixture();f.flushDraft();await f.tick();assert.equal(f.calls[0].data.id,'one');f.calls[0].reply();await f.chain();
 f.note.visibility='faculty';f.note.dirty=true;f.flushDraft();await f.tick();assert.equal(f.calls.length,1);
});
test('Draft attachment arrays remain independent of editor mutations',()=>{
 const f=fixture();f.note.attachments=[{name:'file',data:'abc'}];f.updateDraft();f.note.attachments[0].name='changed';assert.equal(f.S.drafts[0].attachments[0].name,'file');
});
test('Local quota failure does not report a successful local save',async()=>{
 const f=fixture();f.S.ready=false;f.failStorage();await f.saveNote(true);assert.match(f.S.error,/місця/);assert.equal(f.storage.size,0);
});
test('Search trims whitespace, matches subject and escapes note markup',()=>{
 const f=fixture();f.S.drafts[0].subject='Фізика';f.S.drafts[0].title='<img src=x onerror=alert(1)>';f.S.search='  ФІЗИКА  ';f.S.note=null;const html=f.notesView();assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img src=x/);
});
test('Background failure preserves local content and reports sync failure',async()=>{
 const f=fixture();f.context.fetch=async()=>{throw Error('offline')};f.updateDraft();const callback=[...f.timers.values()].at(-1);callback();await f.tick();assert.equal(f.S.drafts[0].dirty,true);assert.match(f.status.textContent,/Не вдалося синхронізувати/);assert.equal(JSON.parse(f.storage.get('dp_reborn2_nb_drafts_100'))[0].body,'Початок');
});

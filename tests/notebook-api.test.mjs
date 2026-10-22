import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { notebookApi } from '../backend/src/notebook-api.mjs';
import catalog from '../backend/src/notebook-catalog.json' with { type:'json' };
import schema from '../backend/src/notebook-schema.mjs';

const TOKEN='test-token-not-a-real-bot-secret';
const home=catalog['3641'];
const otherGroup=Object.values(catalog).find(g=>g.id!==home.id&&g.facultyId===home.facultyId&&g.course===home.course);
const otherCourse=Object.values(catalog).find(g=>g.facultyId===home.facultyId&&g.course!==home.course);
const otherFaculty=Object.values(catalog).find(g=>g.facultyId!==home.facultyId);
function fixture(empty=false){
 const db=new DatabaseSync(':memory:');
 if(!empty)db.exec(readFileSync(new URL('../backend/preview-migrations/0002_notebook_social.sql',import.meta.url),'utf8'));
 const DB={prepare(sql){let args=[];return{bind(...values){args=values;return this},first(){return Promise.resolve(db.prepare(sql).get(...args)||null)},all(){return Promise.resolve({results:db.prepare(sql).all(...args)})},run(){const r=db.prepare(sql).run(...args);return Promise.resolve({meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}})},sql,args:()=>args}},async batch(statements){db.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());db.exec('COMMIT');return results}catch(e){db.exec('ROLLBACK');throw e}}};
 const env={DB,TELEGRAM_BOT_TOKEN:TOKEN};
 function signed(userId,extra={}){const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:Number(userId),first_name:'User '+userId}),...extra});const text=[...p].sort(([a],[b])=>a<b?-1:1).map(([k,v])=>k+'='+v).join('\n');const key=createHmac('sha256','WebAppData').update(TOKEN).digest();p.set('hash',createHmac('sha256',key).update(text).digest('hex'));return 'tma '+p;}
 async function call(who,path,body,extra={}){const headers={Authorization:signed(who),'Content-Type':'application/json',...extra};const r=await notebookApi(new Request('https://worker.test/api/notebook/'+path,{method:body?'POST':'GET',headers,...(body?{body:JSON.stringify(body)}:{})}),env);return {status:r.status,...await r.json()};}
 async function profile(who,group=home.id){const r=await call(who,'profile',{groupId:group});assert.equal(r.status,200,JSON.stringify(r));return r.me;}
 async function becomeFriends(a,b){const me=await call(b,'bootstrap');await call(a,'friends/request',{code:me.me.friend_code});const r=await call(b,'friends/respond',{userId:String(a),accept:true});assert.equal(r.status,200,JSON.stringify(r));}
 const save=(who,id,visibility='private',more={})=>call(who,'notes/save',{id,title:'Конспект',subject:'Електротехніка',body:'Важливий приватний текст',visibility,audience:[],attachments:[],...more});
 return {db,env,call,profile,signed,becomeFriends,save};
}

test('Authenticated additive runtime bootstrap preserves existing data and health never creates tables',async()=>{
 const f=fixture(true);f.db.exec("CREATE TABLE existing_data(value TEXT); INSERT INTO existing_data VALUES('preserve')");
 const sql=readFileSync(new URL('../backend/preview-migrations/0002_notebook_social.sql',import.meta.url),'utf8');
 assert.deepEqual(schema,sql.split(';').map(s=>s.trim()).filter(Boolean));
 const r=await notebookApi(new Request('https://worker.test/api/notebook/health'),f.env);assert.equal((await r.json()).schemaReady,false);
 assert.equal(f.db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='nb_profiles'").get().n,0);
 const denied=await f.call(100,'profile',{groupId:home.id},{Authorization:'tma invalid'});assert.equal(denied.status,401);
 assert.equal(f.db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='nb_profiles'").get().n,0);
 await f.profile(100);assert.equal(f.db.prepare('SELECT value FROM existing_data').get().value,'preserve');
 assert.equal(f.db.prepare('SELECT count(*) AS n FROM nb_profiles').get().n,1);
});

test('Telegram signature, expiry, duplicate keys and origin checks',async()=>{
 const f=fixture();
 let r=await f.call(100,'profile',{groupId:home.id,name:'Fake admin',isLeader:true});assert.equal(r.me.name,'User 100');
 r=await f.call(100,'bootstrap',null,{Authorization:f.signed(101).replace('User+101','User+100')});assert.equal(r.status,401);
 r=await f.call(100,'bootstrap',null,{Authorization:f.signed(100,{auth_date:'1'})});assert.equal(r.status,401);
 r=await f.call(100,'bootstrap',null,{Authorization:f.signed(100)+'&auth_date=1'});assert.equal(r.status,401);
 r=await f.call(100,'bootstrap',null,{Origin:'https://evil.example'});assert.equal(r.status,403);
 const preflight=await notebookApi(new Request('https://worker.test/api/notebook/profile',{method:'OPTIONS'}),f.env);assert.equal(preflight.status,204);
});

test('Note audiences, signed ownership, copies and conflict protection',async()=>{
 const f=fixture();for(const [u,g]of [[100,home],[101,home],[102,otherGroup],[103,otherCourse],[104,otherFaculty]])await f.profile(u,g.id);
 await f.save(100,'private');await f.save(100,'group','group');await f.save(100,'course','course');await f.save(100,'faculty','faculty');
 const ids=async u=>(await f.call(u,'notes')).notes.map(n=>n.id).sort();
 assert.deepEqual(await ids(101),['course','faculty','group']);assert.deepEqual(await ids(102),['course','faculty']);assert.deepEqual(await ids(103),['faculty']);assert.deepEqual(await ids(104),[]);
 assert.equal((await f.save(101,'private')).status,403);
 assert.equal((await f.call(101,'notes/get?id=private')).status,403);
 assert.equal((await f.call(101,'notes/get?id=faculty')).note.owner_id,'100');
 let r=await f.save(100,'private','private',{revision:1,body:'Новий текст'});assert.equal(r.note.revision,2);
 r=await f.save(100,'private','private',{revision:1,body:'Застарілий текст'});assert.equal(r.status,409);assert.equal(r.note.body,'Новий текст');
 await f.becomeFriends(100,101);r=await f.save(100,'friends','friends',{audience:['101']});assert.equal(r.status,200);
 assert((await ids(101)).includes('friends'));assert(!(await ids(102)).includes('friends'));
 await f.call(100,'friends/options',{userId:'101',remove:true});assert(!(await ids(101)).includes('friends'));
 assert.equal((await f.call(101,'notes/delete',{id:'group'})).status,403);
 assert.equal((await f.call(100,'notes/delete',{id:'group'})).status,200);assert(!(await ids(100)).includes('group'));
});

test('Friend requests require acceptance; privacy defaults closed and cannot leak other users',async()=>{
 const f=fixture();const a=await f.profile(100),b=await f.profile(101);await f.profile(102);
 let r=await f.call(100,'friends/request',{code:b.friend_code});assert.equal(r.status,200);
 r=await f.call(100,'friends/respond',{userId:'101',accept:true});assert.equal(r.status,403);
 r=await f.call(100,'messages/send',{channel:'dm:100:101',body:'Передчасний чат'});assert.equal(r.status,403);
 await f.call(101,'friends/respond',{userId:'100',accept:true});
 r=await f.call(100,'friends/availability?userId=101');assert.deepEqual(r,{status:200,ok:true,hidden:true});
 r=await f.call(102,'friends/availability?userId=101');assert.equal(r.status,403);
 r=await f.call(100,'bootstrap');assert(!('group' in r.friends[0]));assert.equal(r.friends[0].privacy,'none');assert.equal(a.privacy,'none');
 await f.call(100,'friends/options',{userId:'101',favorite:true,privacy:'room'});r=await f.call(100,'bootstrap');assert.equal(r.friends[0].favorite,true);assert.equal(r.friends[0].shareWith,'room');
});

test('Chat membership, author groups, unread counts, private-note sharing and moderation',async()=>{
 const f=fixture();await f.profile(100);await f.profile(101);await f.profile(102,otherFaculty.id);
 const channel='group:'+home.id;
 assert.equal((await f.call(102,'messages?channel='+channel)).status,403);
 let r=await f.call(100,'messages/send',{channel,body:'Привіт',name:'Адміністратор',group_id:otherFaculty.id});assert.equal(r.status,200);
 const messageId=r.id;r=await f.call(101,'messages?channel='+channel);assert.equal(r.messages[0].name,'User 100');assert.equal(r.messages[0].group,home.name);assert.equal(r.canModerate,false);
 r=await f.call(101,'bootstrap');assert.equal(r.channels[0].unread,1);await f.call(101,'messages/read',{channel,id:messageId});r=await f.call(101,'bootstrap');assert.equal(r.channels[0].unread,0);
 assert.equal((await f.call(101,'messages/action',{id:messageId,action:'edit',body:'Злам'})).status,403);
 assert.equal((await f.call(101,'messages/action',{id:messageId,action:'delete'})).status,403);
 assert.equal((await f.call(101,'messages/action',{id:messageId,action:'pin'})).status,403);
 await f.call(101,'messages/action',{id:messageId,action:'react',emoji:'👍'});r=await f.call(101,'messages?channel='+channel);assert.equal(r.messages[0].reactions[0].total,1);
 await f.save(101,'secret');assert.equal((await f.call(101,'messages/send',{channel,noteId:'secret',body:'Секрет'})).status,403);
 f.db.prepare('INSERT INTO nb_leaders VALUES(?,?,?,?)').run(home.id,'101',Date.now(),'test');
 await f.call(101,'messages/action',{id:messageId,action:'pin'});r=await f.call(100,'messages?channel='+channel);assert.equal(r.messages[0].pinned,1);
 assert.equal((await f.call(101,'messages/action',{id:messageId,action:'mute'})).status,200);
 assert.equal((await f.call(100,'messages/send',{channel,body:'Ще повідомлення'})).error,'MUTED');
 assert.equal((await f.call(101,'messages?channel=faculty:'+otherFaculty.facultyId)).status,403);
 await f.call(101,'messages/action',{id:messageId,action:'delete'});r=await f.call(100,'messages?channel='+channel);assert.equal(r.messages[0].body,'Повідомлення видалено');
});

test('Vote eligibility, one replaceable vote, quorum, leader rights and revocation on group change',async()=>{
 const f=fixture();await f.profile(100);await f.profile(101);await f.profile(102,otherFaculty.id);
 assert.equal((await f.call(100,'elections/start',{action:'elect'})).error,'WAIT_48_HOURS');
 f.db.exec('UPDATE nb_profiles SET joined_at=joined_at-259200000');
 let r=await f.call(100,'elections/start',{action:'elect'});assert.equal(r.status,200,JSON.stringify(r));
 let e=(await f.call(100,'elections')).election;assert.equal(e.tally.total,2);
 assert.equal((await f.call(102,'elections/vote',{id:e.id,yes:true})).status,403);
 await f.call(100,'elections/vote',{id:e.id,yes:false});await f.call(100,'elections/vote',{id:e.id,yes:true});await f.call(101,'elections/vote',{id:e.id,yes:true});
 e=(await f.call(100,'elections')).election;assert.equal(e.tally.yes,2);assert.equal(e.tally.no,0);
 f.db.prepare('UPDATE nb_elections SET ends_at=? WHERE id=?').run(Date.now()-1,e.id);
 r=await f.call(100,'elections');assert.equal(r.leader.user_id,'100');assert.equal(r.election.winner,1);
 assert.equal((await f.call(100,'messages?channel=course:'+home.facultyId+':'+home.course)).canModerate,true);
 await f.profile(100,otherCourse.id);r=await f.call(101,'elections');assert.equal(r.leader,null);
 assert.equal((await f.call(100,'messages?channel=group:'+otherCourse.id)).canModerate,false);
});

test('Meetings only between friends and only recipient can answer; files are validated',async()=>{
 const f=fixture();await f.profile(100);await f.profile(101);await f.profile(102);
 const meeting={userId:'101',place:'Біля корпусу №1',startsAt:new Date(Date.now()+3600000).toISOString()};
 assert.equal((await f.call(100,'invitations',meeting)).status,403);await f.becomeFriends(100,101);
 assert.equal((await f.call(100,'invitations',meeting)).status,200);const inv=(await f.call(101,'invitations')).invitations[0];
 assert.equal((await f.call(102,'invitations/respond',{id:inv.id,state:'accepted'})).status,403);
 assert.equal((await f.call(101,'invitations/respond',{id:inv.id,state:'accepted'})).status,200);
 assert.equal((await f.save(100,'unsafe','private',{attachments:[{name:'x',type:'text/html',data:'javascript:alert(1)'}]})).status,400);
 assert.equal((await f.save(100,'safe','private',{attachments:[{name:'note.txt',type:'text/plain',data:'data:text/plain;base64,SGVsbG8='}]})).status,200);
});

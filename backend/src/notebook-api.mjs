import catalog from './notebook-catalog.json' with { type: 'json' };

const VERSION = 'notebook-social-1';
const PREFIX = '/api/notebook/';
const ALLOWED = 'https://yaroshandriy16-beep.github.io';
const enc = new TextEncoder();
const groups = catalog;
const visibilities = ['private','friends','group','course','faculty'];
const privacyLevels = ['none','busy','subject','room'];
const now = () => Date.now();
const id = () => crypto.randomUUID();
const parse = (s, fallback = []) => { try { return JSON.parse(s); } catch { return fallback; } };
const fail = (code, status = 400) => { throw Object.assign(new Error(code), { status }); };
const clean = (s, max, required = false) => {
  if (typeof s !== 'string' || s.length > max || (required && !s.trim())) fail('INVALID_FIELD');
  return s.trim();
};
const reply = (data, status = 200) => new Response(status===204?null:JSON.stringify(data), { status, headers: {
  'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store',
  'Access-Control-Allow-Origin':ALLOWED, 'Access-Control-Allow-Headers':'Content-Type, Authorization',
  'Access-Control-Allow-Methods':'GET, POST, OPTIONS', 'Vary':'Origin', 'X-Content-Type-Options':'nosniff'
} });
const one = (db, sql, ...args) => db.prepare(sql).bind(...args).first();
const all = async (db, sql, ...args) => (await db.prepare(sql).bind(...args).all()).results;
const run = (db, sql, ...args) => db.prepare(sql).bind(...args).run();
const pair = (a,b) => [String(a),String(b)].sort();
async function friends(db,a,b) { const [x,y]=pair(a,b); return !!await one(db,"SELECT 1 FROM nb_friendships WHERE a=? AND b=? AND state='accepted'",x,y); }

async function hmac(key, data) {
  const k=await crypto.subtle.importKey('raw',key,{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC',k,enc.encode(data)));
}
export async function authenticate(request, token) {
  const raw=request.headers.get('Authorization') || '';
  if (!raw.startsWith('tma ') || raw.length>17000 || !token) fail('AUTH_REQUIRED',401);
  const params=new URLSearchParams(raw.slice(4)), entries=[...params];
  if (new Set(entries.map(x=>x[0])).size!==entries.length) fail('INVALID_AUTH',401);
  const date=Number(params.get('auth_date')), hash=params.get('hash') || '';
  if (!Number.isSafeInteger(date) || date>now()/1000+60 || now()/1000-date>3600) fail('SESSION_EXPIRED',401);
  if (!/^[a-f0-9]{64}$/i.test(hash)) fail('INVALID_AUTH',401);
  const data=entries.filter(([k])=>k!=='hash').sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>k+'='+v).join('\n');
  const secret=await hmac(enc.encode('WebAppData'),token), expected=await hmac(secret,data);
  let diff=0;for(let i=0;i<32;i++)diff|=expected[i]^parseInt(hash.slice(i*2,i*2+2),16);
  if(diff)fail('INVALID_AUTH',401);
  const u=parse(params.get('user'),null);
  if(!u || !Number.isSafeInteger(u.id) || u.id<=0)fail('INVALID_AUTH',401);
  return {id:String(u.id),name:[u.first_name,u.last_name].filter(x=>typeof x==='string').join(' ').slice(0,140)||'Студент',username:typeof u.username==='string'?u.username.slice(0,64):''};
}
async function body(request) {
  const reader=request.body?.getReader();if(!reader)return {};
  let size=0,parts=[];while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>850000){await reader.cancel();fail('TOO_LARGE',413);}parts.push(r.value);}
  const bytes=new Uint8Array(size);let at=0;for(const p of parts){bytes.set(p,at);at+=p.length;}
  const b=parse(new TextDecoder().decode(bytes),null);if(!b||typeof b!=='object'||Array.isArray(b))fail('INVALID_JSON');return b;
}
function attachmentList(items) {
  if(!Array.isArray(items)||items.length>3)fail('INVALID_ATTACHMENTS');
  let size=0;return items.map(a=>{
    const name=clean(a.name,140,true),type=clean(a.type,120),data=clean(a.data,700000,true);
    if(!/^data:[a-z0-9.+\-/]*;base64,[A-Za-z0-9+/]*={0,2}$/i.test(data))fail('INVALID_ATTACHMENT');
    size+=data.length;if(size>700000)fail('TOO_LARGE',413);
    return {name,type,data};
  });
}
function profileView(p) { const g=groups[p.group_id]; return {...p,group:g,friend_code:undefined}; }
async function canRead(db,n,me) {
  if(!n||n.deleted_at)return false;if(n.owner_id===me.id)return true;
  const mine=groups[me.group_id],theirs=groups[n.group_id];if(!mine||!theirs)return false;
  if(n.visibility==='friends')return parse(n.audience).includes(me.id)&&await friends(db,n.owner_id,me.id);
  return n.visibility==='group'?mine.id===theirs.id:n.visibility==='course'?mine.facultyId===theirs.facultyId&&mine.course===theirs.course:n.visibility==='faculty'?mine.facultyId===theirs.facultyId:false;
}
async function moderator(db, me, channel) {
  if(channel.startsWith('dm:'))return false;
  const leader=await one(db,'SELECT group_id FROM nb_leaders WHERE user_id=?',me.id);
  if(!leader||leader.group_id!==me.group_id)return false;
  const g=groups[leader.group_id];
  return channel===`group:${g.id}` || channel.startsWith(`subject:${g.id}:`) || channel===`course:${g.facultyId}:${g.course}` || channel===`faculty:${g.facultyId}`;
}
async function channelAccess(db,me,key) {
  if(typeof key!=='string'||key.length>500)fail('INVALID_CHANNEL');
  const g=groups[me.group_id];
  if(key.startsWith('dm:')){
    const ids=key.slice(3).split(':');if(ids.length!==2||ids[0]===ids[1]||!ids.includes(me.id)||pair(...ids).join(':')!==ids.join(':')||!await friends(db,...ids))fail('FORBIDDEN',403);
  } else if(key!==`group:${g.id}`&&key!==`course:${g.facultyId}:${g.course}`&&key!==`faculty:${g.facultyId}`&&!new RegExp('^subject:'+g.id+':[^:]{1,400}$').test(key))fail('FORBIDDEN',403);
  return true;
}
async function throttle(db,table,field,user,millis) {
  const last=await one(db,`SELECT created_at FROM ${table} WHERE ${field}=? ORDER BY created_at DESC LIMIT 1`,user);
  if(last&&now()-last.created_at<millis)fail('TOO_FAST',429);
}
async function closeElection(db,e) {
  if(!e||e.state!=='open'||e.ends_at>now())return;
  const c=await one(db,'SELECT count(*) AS total,sum(vote=1) AS yes,sum(vote=0) AS no FROM nb_electors WHERE election_id=?',e.id);
  const candidate=await one(db,'SELECT group_id FROM nb_profiles WHERE id=?',e.candidate_id);
  const votes=Number(c.yes||0)+Number(c.no||0);
  const won=c.total>=2&&votes>=Math.ceil(c.total/2)&&Number(c.yes)>Number(c.no)&&candidate?.group_id===e.group_id;
  const statements=[db.prepare("UPDATE nb_elections SET state='closed',winner=? WHERE id=? AND state='open'").bind(won?1:0,e.id)];
  if(won&&e.action==='elect')statements.push(db.prepare('INSERT INTO nb_leaders(group_id,user_id,elected_at,election_id) VALUES(?,?,?,?) ON CONFLICT(group_id) DO UPDATE SET user_id=excluded.user_id,elected_at=excluded.elected_at,election_id=excluded.election_id').bind(e.group_id,e.candidate_id,now(),e.id));
  if(won&&e.action==='remove')statements.push(db.prepare('DELETE FROM nb_leaders WHERE group_id=? AND user_id=?').bind(e.group_id,e.candidate_id));
  await db.batch(statements);
}
async function friendViews(db,me) {
  const rows=await all(db,"SELECT p.*,f.state,f.sender FROM nb_friendships f JOIN nb_profiles p ON p.id=CASE WHEN f.a=? THEN f.b ELSE f.a END WHERE (f.a=? OR f.b=?) AND f.state IN ('pending','accepted')",me.id,me.id,me.id);
  return Promise.all(rows.map(async p=>{
    const own=await one(db,'SELECT * FROM nb_friend_options WHERE user_id=? AND friend_id=?',me.id,p.id);
    const other=await one(db,'SELECT privacy FROM nb_friend_options WHERE user_id=? AND friend_id=?',p.id,me.id);
    const level=p.state==='accepted'?(other&&other.privacy!=='inherit'?other.privacy:p.privacy):'none';
    return {id:p.id,name:p.name,username:p.username,state:p.state,incoming:p.sender!==me.id,favorite:!!own?.favorite,shareWith:own?.privacy||'inherit',privacy:level,status:p.state==='accepted'&&p.status_until>now()?p.status:'',status_until:p.status_until};
  }));
}
const scheduleCache=new Map();
async function schedule(groupId) {
  if(!groups[groupId])fail('INVALID_GROUP');
  const old=scheduleCache.get(groupId);if(old&&old.at>now()-300000)return old.lessons;
  const r=await fetch(`https://yaroshandriy16-beep.github.io/DePara/data/groups/${groupId}.json`);
  if(!r.ok)fail('SCHEDULE_UNAVAILABLE',503);const d=await r.json();if(!Array.isArray(d.lessons))fail('SCHEDULE_UNAVAILABLE',503);
  if(scheduleCache.size>100)scheduleCache.clear();scheduleCache.set(groupId,{at:now(),lessons:d.lessons});return d.lessons;
}
const minutes=s=>{const [h,m]=String(s).split(':').map(Number);return h*60+m;};
const timeText=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
function kyivClock(){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return{date:`${p.year}-${p.month}-${p.day}`,minute:Number(p.hour)*60+Number(p.minute)};}

export async function notebookApi(request,env) {
  const url=new URL(request.url);if(!url.pathname.startsWith(PREFIX))return null;
  if(request.method==='OPTIONS')return reply({},204);
  if(request.headers.get('Origin')&&request.headers.get('Origin')!==ALLOWED) return reply({ok:false,error:'FORBIDDEN'},403);
  try {
    if(url.pathname===PREFIX+'health'){
      await one(env.DB,'SELECT id FROM nb_profiles LIMIT 1');return reply({ok:true,version:VERSION,database:true});
    }
    const user=await authenticate(request,env.TELEGRAM_BOT_TOKEN),db=env.DB;
    const b=request.method==='POST'?await body(request):{};
    const route=url.pathname.slice(PREFIX.length),method=request.method;
    let me=await one(db,'SELECT * FROM nb_profiles WHERE id=?',user.id);
    if(route==='profile'&&method==='POST') {
      const gid=String(b.groupId||'');if(!groups[gid])fail('INVALID_GROUP');
      const privacy=privacyLevels.includes(b.privacy)?b.privacy:me?.privacy||'none';
      const status=b.status===undefined?me?.status||'':clean(b.status,100);
      const until=b.statusUntil===undefined?me?.status_until||0:Math.min(now()+86400000,Math.max(0,Number(b.statusUntil)||0));
      if(me&&gid!==me.group_id){
        await db.batch([
          db.prepare('DELETE FROM nb_leaders WHERE user_id=?').bind(user.id),
          db.prepare("UPDATE nb_elections SET state='cancelled' WHERE candidate_id=? AND state='open'").bind(user.id),
          db.prepare('DELETE FROM nb_electors WHERE user_id=? AND election_id IN (SELECT id FROM nb_elections WHERE state=\'open\')').bind(user.id)
        ]);
      }
      await run(db,`INSERT INTO nb_profiles(id,name,username,group_id,friend_code,privacy,status,status_until,joined_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name,username=excluded.username,group_id=excluded.group_id,privacy=excluded.privacy,status=excluded.status,status_until=excluded.status_until,joined_at=CASE WHEN nb_profiles.group_id<>excluded.group_id THEN excluded.joined_at ELSE nb_profiles.joined_at END,updated_at=excluded.updated_at`,user.id,user.name,user.username,gid,me?.friend_code||id().replace(/-/g,'').slice(0,12).toUpperCase(),privacy,status,until,now(),now());
      me=await one(db,'SELECT * FROM nb_profiles WHERE id=?',user.id);
      return reply({ok:true,me:{...me,group:groups[gid]}});
    }
    if(!me)fail('PROFILE_REQUIRED',409);
    // Names are always from signed Telegram data, never editable request fields.
    if(me.name!==user.name||me.username!==user.username)await run(db,'UPDATE nb_profiles SET name=?,username=? WHERE id=?',user.name,user.username,user.id);
    if(route==='bootstrap'&&method==='GET') {
      await closeElection(db,await one(db,"SELECT * FROM nb_elections WHERE group_id=? AND state='open'",me.group_id));
      const fs=await friendViews(db,me),leader=await one(db,'SELECT user_id FROM nb_leaders WHERE group_id=?',me.group_id);
      const g=groups[me.group_id],channels=[{key:`group:${g.id}`,title:g.name},{key:`course:${g.facultyId}:${g.course}`,title:`${g.course} курс · ${g.faculty}`},{key:`faculty:${g.facultyId}`,title:g.faculty}];
      for(const c of channels){const r=await one(db,'SELECT count(*) AS n FROM nb_messages WHERE channel=? AND id>COALESCE((SELECT last_id FROM nb_reads WHERE user_id=? AND channel=?),0) AND author_id<>? AND deleted=0',c.key,me.id,c.key,me.id);c.unread=r.n;}
      return reply({ok:true,version:VERSION,me:{...me,group:g,isLeader:leader?.user_id===me.id},friends:fs,channels});
    }
    if(route==='friends/request'&&method==='POST') {
      const code=clean(b.code,32,true).replace(/[\s-]/g,'').toUpperCase();
      const p=await one(db,'SELECT id FROM nb_profiles WHERE friend_code=?',code);if(!p||p.id===me.id)fail('FRIEND_NOT_FOUND',404);
      const [a,c]=pair(me.id,p.id),existing=await one(db,'SELECT * FROM nb_friendships WHERE a=? AND b=?',a,c);
      if(existing?.state==='accepted')return reply({ok:true});
      if(existing?.state==='pending')fail('REQUEST_EXISTS',409);
      await throttle(db,'nb_friendships','sender',me.id,3000);
      await run(db,"INSERT INTO nb_friendships(a,b,sender,state,created_at) VALUES(?,?,?,'pending',?) ON CONFLICT(a,b) DO UPDATE SET sender=excluded.sender,state='pending',created_at=excluded.created_at",a,c,me.id,now());return reply({ok:true});
    }
    if(route==='friends/respond'&&method==='POST') {
      const other=clean(b.userId,32,true),[a,c]=pair(me.id,other),f=await one(db,'SELECT * FROM nb_friendships WHERE a=? AND b=?',a,c);
      if(!f||f.state!=='pending'||f.sender===me.id)fail('FORBIDDEN',403);
      await run(db,'UPDATE nb_friendships SET state=? WHERE a=? AND b=?',b.accept?'accepted':'declined',a,c);return reply({ok:true});
    }
    if(route==='friends/options'&&method==='POST'){
      const other=clean(b.userId,32,true);if(!await friends(db,me.id,other))fail('FORBIDDEN',403);
      if(b.remove){const [a,c]=pair(me.id,other);await run(db,"UPDATE nb_friendships SET state='removed' WHERE a=? AND b=?",a,c);return reply({ok:true});}
      const p=[...privacyLevels,'inherit'].includes(b.privacy)?b.privacy:'inherit';
      await run(db,'INSERT INTO nb_friend_options(user_id,friend_id,favorite,privacy) VALUES(?,?,?,?) ON CONFLICT(user_id,friend_id) DO UPDATE SET favorite=excluded.favorite,privacy=excluded.privacy',me.id,other,b.favorite?1:0,p);return reply({ok:true});
    }
    if(route==='friends/availability'&&method==='GET'){
      const other=await one(db,'SELECT * FROM nb_profiles WHERE id=?',url.searchParams.get('userId')||'');
      if(!other||!await friends(db,me.id,other.id))fail('FORBIDDEN',403);
      const options=await one(db,'SELECT privacy FROM nb_friend_options WHERE user_id=? AND friend_id=?',other.id,me.id);
      const level=options&&options.privacy!=='inherit'?options.privacy:other.privacy;
      if(level==='none')return reply({ok:true,hidden:true});
      const clock=kyivClock(),date=url.searchParams.get('date')||clock.date;if(!/^\d{4}-\d\d-\d\d$/.test(date))fail('INVALID_DATE');
      const [theirs,mine]=await Promise.all([schedule(other.group_id),schedule(me.group_id)]);
      const selected=theirs.filter(l=>l.date===date),today=theirs.filter(l=>l.date===clock.date);
      const current=today.find(l=>minutes(l.start)<=clock.minute&&minutes(l.end)>clock.minute);
      const later=today.filter(l=>minutes(l.start)>clock.minute).sort((a,b)=>minutes(a.start)-minutes(b.start))[0];
      const busy=[...selected,...mine.filter(l=>l.date===date)].map(l=>[minutes(l.start),minutes(l.end)]).filter(x=>x.every(Number.isFinite)).sort((a,b)=>a[0]-b[0]);
      let cursor=date===clock.date?Math.max(480,clock.minute):480;const common=[];for(const [start,end]of busy){if(start-cursor>=20)common.push({start:timeText(cursor),end:timeText(Math.min(start,1200))});cursor=Math.max(cursor,end);if(cursor>=1200)break;}if(1200-cursor>=20)common.push({start:timeText(cursor),end:'20:00'});
      return reply({ok:true,privacy:level,busy:!!current,ends:current?.end||null,nextStart:later?.start||null,subject:level==='subject'||level==='room'?current?.subject||null:null,room:level==='room'?current?.room||null:null,common:common.filter(w=>minutes(w.end)>minutes(w.start)),date,notice:'За розкладом, не фактичне місцеперебування'});
    }
    if(route==='notes'&&method==='GET'){
      const candidates=await all(db,"SELECT n.*,p.name AS author FROM nb_notes n JOIN nb_profiles p ON p.id=n.owner_id WHERE n.deleted_at=0 AND (n.owner_id=? OR n.visibility<>'private') ORDER BY n.updated_at DESC LIMIT 500",me.id);
      const notes=[];for(const n of candidates)if(await canRead(db,n,me))notes.push({...n,attachments:parse(n.attachments),audience:parse(n.audience)});
      return reply({ok:true,notes});
    }
    if(route==='notes/save'&&method==='POST'){
      const noteId=clean(b.id,80,true),existing=await one(db,'SELECT * FROM nb_notes WHERE id=?',noteId);
      if(existing&&existing.owner_id!==me.id)fail('FORBIDDEN',403);
      if(existing&&existing.revision!==b.revision)return reply({ok:false,error:'REVISION_CONFLICT',note:{...existing,attachments:parse(existing.attachments),audience:parse(existing.audience)}},409);
      const visibility=visibilities.includes(b.visibility)?b.visibility:'private';
      let audience=Array.isArray(b.audience)?[...new Set(b.audience.map(String))].slice(0,100):[];
      if(visibility==='friends')for(const friend of audience)if(!await friends(db,me.id,friend))fail('NOT_FRIEND');
      const attachments=attachmentList(b.attachments||[]);
      const data=[clean(b.subject||'',180),clean(b.title||'',120,true),clean(b.body||'',60000),['note','task','material'].includes(b.kind)?b.kind:'note',clean(b.due||'',10),b.done?1:0,visibility,JSON.stringify(audience),me.group_id,JSON.stringify(attachments),clean(b.lesson||'',600),now(),noteId,me.id];
      if(existing){
        const r=await run(db,'UPDATE nb_notes SET subject=?,title=?,body=?,kind=?,due=?,done=?,visibility=?,audience=?,group_id=?,attachments=?,lesson=?,updated_at=?,revision=revision+1,deleted_at=0 WHERE id=? AND owner_id=? AND revision=?',...data,b.revision);
        if(!r.meta.changes)fail('REVISION_CONFLICT',409);
      } else {
        const count=await one(db,'SELECT count(*) AS n FROM nb_notes WHERE owner_id=?',me.id);if(count.n>=500)fail('NOTE_LIMIT');
        await run(db,'INSERT INTO nb_notes(subject,title,body,kind,due,done,visibility,audience,group_id,attachments,lesson,updated_at,id,owner_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',...data,now());
      }
      return reply({ok:true,note:await one(db,'SELECT revision,updated_at FROM nb_notes WHERE id=?',noteId)});
    }
    if(route==='notes/delete'&&method==='POST'){
      const r=await run(db,'UPDATE nb_notes SET deleted_at=?,revision=revision+1 WHERE id=? AND owner_id=?',now(),String(b.id),me.id);if(!r.meta.changes)fail('FORBIDDEN',403);return reply({ok:true});
    }
    if(route==='messages'&&method==='GET'){
      const channel=url.searchParams.get('channel');await channelAccess(db,me,channel);
      const before=Number(url.searchParams.get('before'))||Number.MAX_SAFE_INTEGER;
      const messages=await all(db,'SELECT m.*,CASE WHEN l.user_id=m.author_id THEN 1 ELSE 0 END AS isLeader FROM nb_messages m LEFT JOIN nb_leaders l ON l.group_id=m.group_id WHERE m.channel=? AND m.id<? ORDER BY m.id DESC LIMIT 60',channel,before);messages.reverse();
      const reactions=messages.length?await all(db,'SELECT r.message_id,r.emoji,count(*) AS total,max(r.user_id=?) AS mine FROM nb_reactions r JOIN nb_messages m ON m.id=r.message_id WHERE m.channel=? AND m.id>=? AND m.id<=? GROUP BY r.message_id,r.emoji',me.id,channel,messages[0].id,messages.at(-1).id):[];
      return reply({ok:true,messages:messages.map(m=>({...m,body:m.deleted?'Повідомлення видалено':m.body,note_id:m.deleted?'':m.note_id,attachments:m.deleted?[]:parse(m.attachments),group:groups[m.group_id]?.name||'',reactions:reactions.filter(r=>r.message_id===m.id)})),canModerate:await moderator(db,me,channel)});
    }
    if(route==='messages/send'&&method==='POST'){
      const channel=clean(b.channel,500,true);await channelAccess(db,me,channel);
      const mute=await one(db,'SELECT until_at FROM nb_mutes WHERE channel=? AND user_id=?',channel,me.id);if(mute?.until_at>now())fail('MUTED',403);
      await throttle(db,'nb_messages','author_id',me.id,1500);
      const text=clean(b.body||'',4000),attachments=attachmentList(b.attachments||[]),noteId=clean(b.noteId||'',80);
      if(!text&&!attachments.length&&!noteId)fail('EMPTY_MESSAGE');
      if(noteId){const n=await one(db,'SELECT * FROM nb_notes WHERE id=?',noteId);if(!await canRead(db,n,me))fail('NOTE_NOT_SHARED',403);
        if(channel.startsWith('dm:')){const other=await one(db,'SELECT * FROM nb_profiles WHERE id=?',channel.slice(3).split(':').find(x=>x!==me.id));if(!await canRead(db,n,other))fail('NOTE_NOT_SHARED',403);}
        else {const g=groups[n.group_id];const audience=n.visibility==='faculty'?`faculty:${g.facultyId}`:n.visibility==='course'?`course:${g.facultyId}:${g.course}`:n.visibility==='group'?`group:${g.id}`:'';const mg=groups[me.group_id];const fits=audience===channel||(n.visibility==='faculty'&&g.facultyId===mg.facultyId)||(n.visibility==='course'&&g.facultyId===mg.facultyId&&g.course===mg.course&&(channel.startsWith('group:')||channel.startsWith('subject:')))||(n.visibility==='group'&&g.id===mg.id&&channel.startsWith('subject:'));if(!fits)fail('NOTE_NOT_SHARED',403);}
      }
      const replyId=Number(b.replyId)||0;if(replyId&&!await one(db,'SELECT 1 FROM nb_messages WHERE id=? AND channel=?',replyId,channel))fail('INVALID_REPLY');
      const r=await run(db,'INSERT INTO nb_messages(channel,author_id,group_id,name,body,note_id,attachments,reply_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)',channel,me.id,me.group_id,user.name,text,noteId,JSON.stringify(attachments),replyId,now());return reply({ok:true,id:r.meta.last_row_id});
    }
    if(route==='messages/action'&&method==='POST'){
      const m=await one(db,'SELECT * FROM nb_messages WHERE id=?',Number(b.id));if(!m)fail('NOT_FOUND',404);await channelAccess(db,me,m.channel);
      const mod=await moderator(db,me,m.channel);
      if(b.action==='react') {if(m.deleted)fail('NOT_FOUND',404);const emoji=['👍','❤️','✅','🔥','❓'].includes(b.emoji)?b.emoji:'👍';const old=await one(db,'SELECT emoji FROM nb_reactions WHERE message_id=? AND user_id=?',m.id,me.id);if(old?.emoji===emoji)await run(db,'DELETE FROM nb_reactions WHERE message_id=? AND user_id=?',m.id,me.id);else await run(db,'INSERT INTO nb_reactions(message_id,user_id,emoji) VALUES(?,?,?) ON CONFLICT(message_id,user_id) DO UPDATE SET emoji=excluded.emoji',m.id,me.id,emoji);}
      else if(b.action==='edit'){if(m.author_id!==me.id||m.deleted)fail('FORBIDDEN',403);await run(db,'UPDATE nb_messages SET body=?,edited_at=? WHERE id=?',clean(b.body,4000,true),now(),m.id);}
      else if(b.action==='delete'){if(m.author_id!==me.id&&!mod)fail('FORBIDDEN',403);await run(db,"UPDATE nb_messages SET body='',attachments='[]',note_id='',deleted=1,pinned=0 WHERE id=?",m.id);}
      else if(b.action==='pin'){if(!mod||m.deleted)fail('FORBIDDEN',403);await run(db,'UPDATE nb_messages SET pinned=? WHERE id=?',m.pinned?0:1,m.id);}
      else if(b.action==='mute'){if(!mod||await one(db,'SELECT 1 FROM nb_leaders WHERE user_id=?',m.author_id))fail('FORBIDDEN',403);await run(db,'INSERT INTO nb_mutes(channel,user_id,until_at,moderator_id) VALUES(?,?,?,?) ON CONFLICT(channel,user_id) DO UPDATE SET until_at=excluded.until_at,moderator_id=excluded.moderator_id',m.channel,m.author_id,now()+3600000,me.id);}
      else fail('INVALID_ACTION');return reply({ok:true});
    }
    if(route==='messages/read'&&method==='POST'){
      await channelAccess(db,me,b.channel);const last=await one(db,'SELECT max(id) AS id FROM nb_messages WHERE channel=?',b.channel);const n=Math.min(Number(b.id)||0,last.id||0);
      await run(db,'INSERT INTO nb_reads(user_id,channel,last_id) VALUES(?,?,?) ON CONFLICT(user_id,channel) DO UPDATE SET last_id=max(last_id,excluded.last_id)',me.id,b.channel,n);return reply({ok:true});
    }
    if(route==='invitations'&&method==='GET') return reply({ok:true,invitations:await all(db,'SELECT i.*,p.name AS sender_name,q.name AS receiver_name FROM nb_invitations i JOIN nb_profiles p ON p.id=i.sender_id JOIN nb_profiles q ON q.id=i.receiver_id WHERE i.sender_id=? OR i.receiver_id=? ORDER BY i.created_at DESC LIMIT 50',me.id,me.id)});
    if(route==='invitations'&&method==='POST'){
      const other=clean(b.userId,32,true);if(!await friends(db,me.id,other))fail('FORBIDDEN',403);await throttle(db,'nb_invitations','sender_id',me.id,5000);
      const date=clean(b.startsAt,40,true);if(!Number.isFinite(Date.parse(date))||Date.parse(date)<now()-60000)fail('INVALID_DATE');
      await run(db,'INSERT INTO nb_invitations(id,sender_id,receiver_id,place,starts_at,created_at) VALUES(?,?,?,?,?,?)',id(),me.id,other,clean(b.place,160,true),date,now());return reply({ok:true});
    }
    if(route==='invitations/respond'&&method==='POST'){
      if(!['accepted','declined'].includes(b.state))fail('INVALID_ACTION');const inv=await one(db,'SELECT * FROM nb_invitations WHERE id=?',String(b.id));if(!inv||inv.receiver_id!==me.id||!await friends(db,inv.sender_id,me.id))fail('FORBIDDEN',403);
      await run(db,"UPDATE nb_invitations SET state=? WHERE id=? AND state='pending'",b.state,inv.id);return reply({ok:true});
    }
    if(route==='elections'&&method==='GET') {
      const e=await one(db,'SELECT * FROM nb_elections WHERE group_id=? ORDER BY starts_at DESC LIMIT 1',me.group_id);await closeElection(db,e);const current=e?await one(db,'SELECT * FROM nb_elections WHERE id=?',e.id):null;
      const tally=e?await one(db,'SELECT count(*) AS total,sum(vote=1) AS yes,sum(vote=0) AS no FROM nb_electors WHERE election_id=?',e.id):null;
      const vote=e?await one(db,'SELECT vote FROM nb_electors WHERE election_id=? AND user_id=?',e.id,me.id):null;
      const leader=await one(db,'SELECT l.*,p.name FROM nb_leaders l JOIN nb_profiles p ON p.id=l.user_id WHERE l.group_id=?',me.group_id);
      const candidate=e?await one(db,'SELECT name FROM nb_profiles WHERE id=?',e.candidate_id):null;
      return reply({ok:true,election:current?{...current,candidate:candidate?.name,tally,vote:vote?.vote,eligible:!!vote}:null,leader,eligibleAt:me.joined_at+172800000});
    }
    if(route==='elections/start'&&method==='POST'){
      if(me.joined_at>now()-172800000)fail('WAIT_48_HOURS',403);
      const existing=await one(db,"SELECT * FROM nb_elections WHERE group_id=? AND state='open'",me.group_id);await closeElection(db,existing);if(existing&&existing.ends_at>now())fail('ELECTION_ACTIVE',409);
      const recent=await one(db,'SELECT ends_at FROM nb_elections WHERE group_id=? ORDER BY starts_at DESC LIMIT 1',me.group_id);if(recent&&recent.ends_at>now()-86400000)fail('ELECTION_COOLDOWN',429);
      const action=b.action==='remove'?'remove':'elect';const leader=await one(db,'SELECT user_id FROM nb_leaders WHERE group_id=?',me.group_id);
      if(action==='remove'&&!leader)fail('NO_LEADER');
      const voters=await all(db,'SELECT id FROM nb_profiles WHERE group_id=? AND joined_at<=?',me.group_id,now()-172800000);if(voters.length<2)fail('NEED_TWO_MEMBERS');
      const election=id(),candidate=action==='remove'?leader.user_id:me.id;
      await db.batch([db.prepare('INSERT INTO nb_elections(id,group_id,candidate_id,action,starts_at,ends_at) VALUES(?,?,?,?,?,?)').bind(election,me.group_id,candidate,action,now(),now()+172800000),...voters.map(v=>db.prepare('INSERT INTO nb_electors(election_id,user_id) VALUES(?,?)').bind(election,v.id))]);return reply({ok:true});
    }
    if(route==='elections/vote'&&method==='POST'){
      const e=await one(db,'SELECT * FROM nb_elections WHERE id=?',String(b.id));await closeElection(db,e);
      if(!e||e.group_id!==me.group_id||e.state!=='open'||e.ends_at<=now()||me.joined_at>e.starts_at-172800000)fail('FORBIDDEN',403);
      if(typeof b.yes!=='boolean')fail('INVALID_VOTE');const r=await run(db,'UPDATE nb_electors SET vote=? WHERE election_id=? AND user_id=?',b.yes?1:0,e.id,me.id);if(!r.meta.changes)fail('FORBIDDEN',403);return reply({ok:true});
    }
    return reply({ok:false,error:'NOT_FOUND'},404);
  }catch(e){if(e.status)return reply({ok:false,error:e.message},e.status);console.error('Notebook API failure',String(e.message).slice(0,200));return reply({ok:false,error:'SERVICE_UNAVAILABLE'},503);}
}

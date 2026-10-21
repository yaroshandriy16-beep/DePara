// ДеПара? REBORN — isolated Cloudflare Worker API. Requires D1 and BOT_TOKEN secret.
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8',...headers}});
const hex=bytes=>Array.from(new Uint8Array(bytes)).map(x=>x.toString(16).padStart(2,'0')).join('');
const enc=new TextEncoder();
async function telegramUser(initData,botToken){
 if(!initData||initData.length>8192||!botToken)throw Error('unauthorized');
 const params=new URLSearchParams(initData),hash=params.get('hash'),authDate=Number(params.get('auth_date'));
 if(!hash||!/^[a-f0-9]{64}$/i.test(hash)||!Number.isFinite(authDate)||Math.abs(Date.now()/1000-authDate)>3600)throw Error('unauthorized');
 const check=[...params.entries()].filter(([k])=>k!=='hash').sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n');
 const key=await crypto.subtle.importKey('raw',enc.encode('WebAppData'),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const secret=await crypto.subtle.sign('HMAC',key,enc.encode(botToken));
 const secretKey=await crypto.subtle.importKey('raw',secret,{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signed=hex(await crypto.subtle.sign('HMAC',secretKey,enc.encode(check)));
 // constant-time-ish comparison for fixed-length hex strings
 let diff=0;for(let i=0;i<64;i++)diff|=signed.charCodeAt(i)^hash.toLowerCase().charCodeAt(i);
 if(diff)throw Error('unauthorized');
 let user;try{user=JSON.parse(params.get('user')||'null')}catch{}
 if(!user||!Number.isSafeInteger(user.id)||user.id<=0)throw Error('unauthorized');
 return user;
}
function code(){const a=new Uint8Array(8);crypto.getRandomValues(a);return 'DP-'+hex(a).toUpperCase()}
export default {async fetch(request,env){
 const origin=request.headers.get('Origin')||'',allowed=env.ALLOWED_ORIGIN||'';
 const cors=origin===allowed?{'access-control-allow-origin':origin,'vary':'Origin','access-control-allow-headers':'content-type,authorization','access-control-allow-methods':'GET,POST,OPTIONS'}:{};
 if(request.method==='OPTIONS')return new Response(null,{status:origin===allowed?204:403,headers:cors});
 const reply=(data,status=200)=>json(data,status,cors);
 try{
 const url=new URL(request.url),path=url.pathname;
 if(path==='/health'&&request.method==='GET')return reply({ok:true,service:'depara-reborn-api'});
 if(!env.DB||!(env.TELEGRAM_BOT_TOKEN||env.BOT_TOKEN))return reply({error:'server_not_configured'},503);
 if(origin&&origin!==allowed)return reply({error:'origin_not_allowed'},403);
 const bearer=request.headers.get('Authorization')||'';
 if(!bearer.startsWith('tma '))return reply({error:'telegram_auth_required'},401);
 const tg=await telegramUser(bearer.slice(4),env.TELEGRAM_BOT_TOKEN||env.BOT_TOKEN),uid=String(tg.id);
 const existing=await env.DB.prepare('SELECT id,friend_code FROM users WHERE id=?').bind(uid).first();
 if(!existing){
 let inserted=false;
 for(let i=0;i<4;i++){try{await env.DB.prepare('INSERT INTO users(id,username,first_name,photo_url,friend_code) VALUES(?,?,?,?,?)').bind(uid,String(tg.username||'').slice(0,64),String(tg.first_name||'').slice(0,100),String(tg.photo_url||'').slice(0,500),code()).run();inserted=true;break}catch(e){if(String(e).includes('UNIQUE constraint failed: users.friend_code'))continue;throw e}}
 if(!inserted)return reply({error:'profile_creation_failed'},500);
 }else await env.DB.prepare('UPDATE users SET username=?,first_name=?,photo_url=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(String(tg.username||'').slice(0,64),String(tg.first_name||'').slice(0,100),String(tg.photo_url||'').slice(0,500),uid).run();
 if(path==='/me'&&request.method==='GET'){const me=await env.DB.prepare('SELECT id,username,first_name,friend_code FROM users WHERE id=?').bind(uid).first();return reply({user:me})}
 if(path==='/friends'&&request.method==='GET'){
 const friends=await env.DB.prepare(`SELECT u.id,u.username,u.first_name,u.friend_code FROM friend_requests r JOIN users u ON u.id=CASE WHEN r.sender_id=? THEN r.receiver_id ELSE r.sender_id END WHERE r.status='accepted' AND (r.sender_id=? OR r.receiver_id=?) ORDER BY u.first_name`).bind(uid,uid,uid).all();
 const incoming=await env.DB.prepare("SELECT r.id,r.created_at,u.first_name,u.username FROM friend_requests r JOIN users u ON u.id=r.sender_id WHERE r.receiver_id=? AND r.status='pending' ORDER BY r.created_at DESC").bind(uid).all();
 return reply({friends:friends.results,incoming:incoming.results});
 }
 if(path==='/friends/request'&&request.method==='POST'){
 const body=await request.json().catch(()=>null),friendCode=String(body?.code||'').trim().toUpperCase();
 if(!/^DP-[0-9A-F]{16}$/.test(friendCode))return reply({error:'invalid_friend_code'},400);
 const target=await env.DB.prepare('SELECT id FROM users WHERE friend_code=?').bind(friendCode).first();
 if(!target)return reply({error:'user_not_found'},404);
 if(target.id===uid)return reply({error:'cannot_add_self'},400);
 const existingRequest=await env.DB.prepare('SELECT id,status,sender_id FROM friend_requests WHERE (sender_id=? AND receiver_id=?) OR (sender_id=? AND receiver_id=?)').bind(uid,target.id,target.id,uid).first();
 if(existingRequest){if(existingRequest.status==='accepted')return reply({error:'already_friends'},409);if(existingRequest.status==='pending')return reply({error:'request_pending'},409);return reply({error:'previous_request_exists'},409)}
 await env.DB.prepare("INSERT INTO friend_requests(id,sender_id,receiver_id) VALUES(?,?,?)").bind(crypto.randomUUID(),uid,target.id).run();return reply({ok:true},201);
 }
 if(path==='/friends/respond'&&request.method==='POST'){
 const body=await request.json().catch(()=>null),id=String(body?.id||''),action=body?.action;
 if(!/^[0-9a-f-]{36}$/i.test(id)||!['accept','decline'].includes(action))return reply({error:'invalid_request'},400);
 const result=await env.DB.prepare("UPDATE friend_requests SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND receiver_id=? AND status='pending'").bind(action==='accept'?'accepted':'declined',id,uid).run();
 if(!result.meta?.changes)return reply({error:'request_not_found'},404);
 return reply({ok:true});
 }
 return reply({error:'not_found'},404);
 }catch(e){if(String(e.message)==='unauthorized')return reply({error:'invalid_telegram_auth'},401);return reply({error:'server_error'},500)}
 }};
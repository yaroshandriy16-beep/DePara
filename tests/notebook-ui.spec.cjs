const {test,expect}=require('@playwright/test');
test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const API='https://depara-api-preview.yaroshandriy16.workers.dev/api/notebook/';
const me={id:'100',name:'Андрій',group_id:'3641',group:{id:'3641',name:'ЕІ-23-1',faculty:'Інженерно-технологійний факультет',facultyId:'1',course:'4'},friend_code:'ABCD1234TEST',privacy:'none',status:'',status_until:0};
async function launch(page,options={}){
 const calls=[],notes=[];
 await page.route('https://telegram.org/js/telegram-web-app.js',r=>r.fulfill({contentType:'text/javascript',body:`window.Telegram={WebApp:{initData:'signed-test-fixture',initDataUnsafe:{user:{id:100,first_name:'Андрій'}},ready(){},expand(){},onEvent(){},setHeaderColor(){},setBackgroundColor(){},HapticFeedback:{impactOccurred(){}}}};`}));
 await page.route(API+'**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname.split('/api/notebook/')[1];let data={};try{data=req.postDataJSON()||{}}catch{}
  calls.push({path,data});let result={ok:true};
  if(options.down)return route.fulfill({status:503,headers:{'access-control-allow-origin':'*'},json:{ok:false,error:'SERVICE_UNAVAILABLE'}});
  if(path==='profile')result.me={...me,privacy:data.privacy||'none'};
  if(path==='bootstrap')result={ok:true,me,friends:[{id:'101',name:'Друг',state:'accepted',favorite:false,privacy:'none',shareWith:'inherit'},{id:'102',name:'Новий друг',state:'pending',incoming:true}],channels:[{key:'group:3641',title:'ЕІ-23-1',unread:0},{key:'course:1:4',title:'4 курс',unread:2},{key:'faculty:1',title:'Факультет',unread:0}]};
  if(path==='notes')result.notes=notes;
  if(path==='notes/get')result.note=notes.find(n=>n.id===url.searchParams.get('id'));
  if(path==='notes/save'){const i=notes.findIndex(n=>n.id===data.id),n={...data,owner_id:'100',revision:(data.revision||0)+1,updated_at:Date.now()};if(i<0)notes.push(n);else notes[i]=n;result.note=n;}
  if(path==='messages')result={ok:true,canModerate:false,messages:[{id:1,channel:'course:1:4',author_id:'101',name:'Друг',group:'ЕІ-23-2',body:'Привіт курсу',created_at:Date.now(),attachments:[],reactions:[],deleted:0}]};
  if(path==='invitations')result.invitations=[];
  if(path==='elections')result={ok:true,election:null,leader:null,eligibleAt:Date.now()+172800000};
  if(path==='friends/availability')result={ok:true,hidden:true};
  await route.fulfill({headers:{'access-control-allow-origin':'*','access-control-allow-headers':'authorization,content-type','access-control-allow-methods':'GET,POST,OPTIONS'},json:result});
 });
 await page.goto('/reborn-notebook-preview/');
 await page.locator('[data-dp-role="student"]').click();await page.locator('#dp-group-search').fill('ЕІ-23-1');await page.locator('#dp-search-results button').first().click();await page.locator('#dp-setup-done').click();await page.locator('#dp-success-enter').click();
 await page.locator('#nav [data-page="notebook"]').click();
 return {calls,notes};
}
test('Three notebook sections, subject notes, scoped publication and cloud save',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));const {calls}=await launch(page);await expect(page.locator('#dp-nb')).toContainText('Підключено');
 await expect(page.locator('#dp-nb [role="tab"]')).toHaveCount(3);
 await page.locator('#dp-nb [data-action="subject"]').first().click();await page.locator('[data-action="note-new"]').click();
 await page.locator('#dp-nb-title').fill('Лекція №1');await page.locator('#dp-nb-body').fill('Закон Ома');
 await expect.poll(()=>calls.filter(c=>c.path==='notes/save').length).toBeGreaterThan(0);
 await page.locator('#nb-visibility').selectOption('faculty');await expect(page.locator('#dp-nb')).toContainText('Побачать усі курси');
 page.once('dialog',d=>d.accept());await page.locator('[data-action="note-save"]').click();
 await expect.poll(()=>calls.some(c=>c.path==='notes/save'&&c.data.visibility==='faculty'&&c.data.body==='Закон Ома')).toBeTruthy();
 await page.screenshot({path:'test-results/notebook-editor.png',fullPage:true});
 expect(errors).toEqual([]);
});
test('Chat author labels, draft send and no stale form data',async({page})=>{
 const {calls}=await launch(page);await expect(page.locator('#dp-nb')).toContainText('Підключено');
 await page.locator('[data-action="tab"][data-value="chats"]').click();await page.locator('[data-channel="course:1:4"]').click();
 await expect(page.locator('.nb-message-name')).toContainText('Друг · ЕІ-23-2');
 await page.locator('#nb-message').fill('Питання до курсу');await page.locator('#nb-compose [type="submit"]').click();
 await expect.poll(()=>calls.some(c=>c.path==='messages/send'&&c.data.body==='Питання до курсу')).toBeTruthy();
});
test('Friend request input survives loading, privacy setting and hidden schedule',async({page})=>{
 const {calls}=await launch(page);await expect(page.locator('#dp-nb')).toContainText('Підключено');await page.locator('[data-action="tab"][data-value="friends"]').click();
 await page.getByText('Мій код і запрошення друга',{exact:true}).click();await page.locator('#nb-friend-code').fill('OTHER1234567');await page.locator('[data-action="friend-request"]').click();
 await expect.poll(()=>calls.some(c=>c.path==='friends/request'&&c.data.code==='OTHER1234567')).toBeTruthy();
 await page.getByText('Хто бачить мій розклад і статус',{exact:true}).click();await page.locator('#nb-global-privacy').selectOption('room');await page.locator('#nb-my-status').fill('Готуюсь до пари');await page.locator('[data-action="friend-privacy"]').click();
 await expect.poll(()=>calls.some(c=>c.path==='profile'&&c.data.privacy==='room'&&c.data.status==='Готуюсь до пари')).toBeTruthy();
 await page.locator('[data-action="friend-open"]').click();await expect(page.locator('#dp-nb')).toContainText('Друг приховав свій розклад');
});
test('Backend outage does not cause a request loop and local drafts remain editable',async({page})=>{
 const {calls}=await launch(page,{down:true});await expect(page.locator('#dp-nb')).toContainText('Сервер тимчасово недоступний');
 await page.locator('[data-nb="new"]').click();await page.locator('#dp-nb-title').fill('Офлайн запис');await page.locator('#dp-nb-body').fill('Не губити');
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('dp_reborn2_nb_drafts_100')||'[]')[0]?.body)).toBe('Не губити');
 expect(calls.filter(c=>c.path==='profile').length).toBe(1);
});

test('Create a linked note directly from a lesson detail',async({page})=>{
 const {calls}=await launch(page);await expect(page.locator('#dp-nb')).toContainText('Підключено');
 await page.evaluate(()=>window.DeParaShowLesson({subject:'Електротехніка',date:'2026-10-22',start:'08:00'}));
 await page.locator('#nb-lesson-note').click();
 await expect(page.locator('#nb-subject')).toHaveValue('Електротехніка');
 await expect(page.locator('#dp-nb-title')).toHaveValue('Електротехніка · 2026-10-22');
 await expect.poll(()=>calls.some(c=>c.path==='notes/save'&&c.data.lesson?.includes('08:00'))).toBeTruthy();
});

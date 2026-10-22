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
  if(path==='notes')result.notes=notes.map(({attachments,...n})=>n);
  if(path==='notes/get')result.note=notes.find(n=>n.id===url.searchParams.get('id'));
  if(path==='notes/save'){const i=notes.findIndex(n=>n.id===data.id),n={...data,owner_id:'100',revision:(data.revision||0)+1,updated_at:Date.now()};if(i<0)notes.push(n);else notes[i]=n;result.note=n;}
  if(path==='notes/delete'){const i=notes.findIndex(n=>n.id===data.id);if(i>=0)notes.splice(i,1);}
  if(path==='messages')result={ok:true,canModerate:false,messages:options.messages||[{id:1,channel:'course:1:4',author_id:'101',name:'Друг',group:'ЕІ-23-2',body:'Привіт курсу',created_at:Date.now(),attachments:[],reactions:[],deleted:0}]};
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

test('Read a shared note and create an independent private copy',async({page})=>{
 const {calls,notes}=await launch(page);await expect(page.locator('#dp-nb')).toContainText('Підключено');
 notes.push({id:'shared-note',owner_id:'101',title:'Спільна лекція',subject:'Електротехніка',body:'**Визначення**',visibility:'faculty',audience:[],attachments:[],revision:1,updated_at:Date.now(),author:'Друг'});
 await page.locator('#dp-nb [data-action="refresh"]').click();
 await page.locator('[data-action="filter"][data-value="shared"]').click();
 await page.locator('[data-action="note-open"][data-id="shared-note"]').click();
 await expect(page.locator('#dp-nb')).toContainText('Визначення');
 await expect(page.locator('#dp-nb-body')).toHaveCount(0);
 await page.locator('[data-action="note-copy"]').click();
 await expect.poll(()=>calls.some(c=>c.path==='notes/save'&&c.data.id!=='shared-note'&&c.data.visibility==='private'&&c.data.body==='**Визначення**')).toBeTruthy();
});


test('Conversation fills the screen, keeps composer above a smaller viewport and exits cleanly',async({page})=>{
 await launch(page);await expect(page.locator('#dp-nb')).toContainText('Підключено');
 await page.locator('[data-action="tab"][data-value="chats"]').click();await page.locator('[data-channel="course:1:4"]').click();
 await expect(page.locator('.nb-thread-header h2')).toHaveText('4 курс');
 const viewport=await page.locator('#dp-nb').boundingBox();expect(viewport.x).toBe(0);expect(viewport.y).toBe(0);expect(viewport.width).toBe(390);
 await expect(page.locator('#nav')).toBeHidden();await expect(page.locator('.app>header')).toBeHidden();
 await expect(page.locator('.nb-date-separator')).toHaveCount(1);
 const composer=page.locator('#nb-compose');let box=await composer.boundingBox();expect(box.y+box.height).toBeLessThanOrEqual(845);
 await page.setViewportSize({width:390,height:480});await expect.poll(async()=>{const b=await composer.boundingBox();return b.y+b.height}).toBeLessThanOrEqual(481);
 await page.locator('#nb-message').fill('Перший рядок\nДругий рядок\nТретій рядок');
 await expect.poll(async()=> (await page.locator('#nb-message').boundingBox()).height).toBeGreaterThan(50);
 await page.locator('[data-action="thread-back"]').click();await expect(page.locator('#nav')).toBeVisible();await expect(page.locator('.nb-chat-list').first()).toBeVisible();
});
test('Long press opens message actions, replies reference the message and attachment menu stays compact',async({page})=>{
 const {calls}=await launch(page);await expect(page.locator('#dp-nb')).toContainText('Підключено');
 await page.locator('[data-action="tab"][data-value="chats"]').click();await page.locator('[data-channel="course:1:4"]').click();
 await expect(page.locator('[data-action="reply"]')).toHaveCount(0);
 const body=page.locator('.nb-message-body');await body.dispatchEvent('pointerdown',{pointerType:'touch',button:0,clientX:50,clientY:200});
 await expect(page.getByRole('dialog',{name:'Дії з повідомленням'})).toBeVisible();await page.dispatchEvent('body','pointerup');
 await page.locator('[data-action="reply"]').click();await expect(page.locator('.nb-compose-reply')).toContainText('Привіт курсу');
 await page.locator('#nb-message').fill('Відповідь');await page.getByRole('button',{name:'Надіслати',exact:true}).click();
 await expect.poll(()=>calls.some(c=>c.path==='messages/send'&&c.data.replyId===1&&c.data.body==='Відповідь')).toBeTruthy();
 await expect(page.locator('.nb-compose-reply')).toHaveCount(0);
 await page.locator('[data-action="chat-attachments"]').click();await expect(page.locator('[data-action="chat-file"]')).toBeVisible();await expect(page.locator('[data-action="chat-note"]')).toBeVisible();
});
test('Long conversation starts at the latest message and refresh preserves reading position',async({page})=>{
 const messages=Array.from({length:55},(_,i)=>({id:i+1,author_id:i%2?'100':'101',name:i%2?'Андрій':'Друг',group:'ЕІ-23-2',body:'Повідомлення '+(i+1)+' — обговорюємо завдання до наступної пари.',created_at:Date.now()+i*60000,attachments:[],reactions:[],deleted:0}));
 await launch(page,{messages});await expect(page.locator('#dp-nb')).toContainText('Підключено');await page.locator('[data-action="tab"][data-value="chats"]').click();await page.locator('[data-channel="course:1:4"]').click();
 await expect.poll(()=>page.locator('#nb-message-list').evaluate(el=>Math.abs(el.scrollHeight-el.clientHeight-el.scrollTop))).toBeLessThan(3);
 await page.locator('#nb-message-list').evaluate(el=>el.scrollTop=80);
 await page.locator('.nb-thread-options summary').click();await page.locator('[data-action="thread-refresh"]').click();
 await expect.poll(()=>page.locator('#nb-message-list').evaluate(el=>el.scrollTop)).toBe(80);
});


test('Leaving the editor immediately saves its latest private changes',async({page})=>{
 const {calls}=await launch(page);await expect(page.locator('#dp-nb')).toContainText('Підключено');
 await page.locator('[data-action="note-new"]').click();await page.locator('#dp-nb-title').fill('Швидке повернення');await page.locator('#dp-nb-body').fill('Остання думка перед виходом');
 await page.locator('[data-action="note-back"]').click();
 await expect.poll(()=>calls.some(c=>c.path==='notes/save'&&c.data.body==='Остання думка перед виходом')).toBeTruthy();
 await page.locator('#nb-search').fill('  ШВИДКЕ  ');await expect(page.locator('.nb-note-title')).toHaveText('Швидке повернення');
});

test('Deleting a draft cancels its pending autosave and survives reload',async({page})=>{
 const {calls}=await launch(page);await expect(page.locator('#dp-nb')).toContainText('Підключено');
 await page.locator('[data-action="note-new"]').click();await page.locator('#dp-nb-title').fill('Тимчасовий запис');await page.locator('#dp-nb-body').fill('Видалити');
 page.once('dialog',d=>d.accept());await page.locator('[data-action="note-delete"]').click();
 await expect(page.locator('.nb-note-title')).toHaveCount(0);
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('dp_reborn2_nb_drafts_100')||'[]').length)).toBe(0);
 const savesAfterDelete=calls.filter(c=>c.path==='notes/save').length;
 // Wait past the debounce to catch writes that would resurrect the deleted draft.
 await page.waitForTimeout(1200);
 await page.locator('[data-action="tab"][data-value="friends"]').click();await page.locator('[data-action="tab"][data-value="notes"]').click();
 expect(calls.filter(c=>c.path==='notes/save')).toHaveLength(savesAfterDelete);
 await page.reload();await page.locator('#nav [data-page="notebook"]').click();await expect(page.locator('.nb-note-title')).toHaveCount(0);
});

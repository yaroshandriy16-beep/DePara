const { test, expect } = require('@playwright/test');

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

const app = '/reborn-preview/';
const errors = [];
test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(app);
  await page.locator('#dp-onboarding-roles [data-dp-role="teacher"]').waitFor({ state: 'visible', timeout: 15000 });
});
test.afterEach(async () => {
  expect(errors, 'Unexpected browser JavaScript errors').toEqual([]);
});

test('Teacher: selection, schedule, tabs, notes, change teacher and role', async ({ page }) => {
  await page.locator('[data-dp-role="teacher"]').click();
  const search = page.locator('#dp-teacher-search');
  await expect(search).toBeVisible();
  await search.fill('Шту');
  await page.locator('#dp-teacher-search-results button').first().click();
  await expect(page.locator('#dp-teacher-enter')).toBeEnabled();
  await page.locator('#dp-teacher-enter').click();
  const teacher = page.locator('#dp-teacher-app');
  await expect(teacher).toBeVisible();
  await expect(teacher.locator('.dp-t-nav')).toBeVisible();
  await teacher.locator('.dp-t-nav [data-t-page="schedule"]').click();
  await expect(teacher.locator('#dp-t-refresh')).toBeVisible();
  await expect(teacher.locator('.dp-t-lesson').first()).toBeVisible({ timeout: 15000 }).catch(async () => {
    await expect(teacher.locator('.dp-t-empty')).toBeVisible();
  });
  await teacher.locator('#dp-t-next').click();
  await teacher.locator('[data-t-view="week"]').click();
  await teacher.locator('#dp-t-today').click();
  await teacher.locator('[data-t-page="study"]').click();
  await teacher.locator('#dp-t-notes').fill('Тестова нотатка');
  await teacher.locator('[data-t-page="community"]').click();
  await teacher.locator('[data-t-page="profile"]').click();
  await teacher.locator('#dp-t-change-teacher').click();
  await expect(page.locator('#dp-teacher-search')).toBeVisible();
  await page.locator('#dp-teacher-back').click();
  await expect(page.locator('[data-dp-role="student"]')).toBeVisible();
});

test('Student: group setup, navigation and role switch', async ({ page }) => {
  await page.locator('[data-dp-role="student"]').click();
  await expect(page.locator('#dp-faculty')).toBeVisible();
  await page.locator('#dp-group-search').fill('ЕІ-23-1');
  await page.locator('#dp-search-results button').first().click();
  await expect(page.locator('#dp-setup-done')).toBeEnabled();
  await page.locator('#dp-setup-done').click();
  await page.locator('#dp-success-enter').click();
  await expect(page.locator('#screen')).toBeVisible();
  for (const tab of ['today','schedule','study','social','profile']) {
    await page.locator('#nav button[data-page="'+tab+'"]').click();
    await expect(page.locator('#nav button[data-page="'+tab+'"]')).toHaveClass(/active/);
  }
  await page.evaluate(() => window.DeParaChangeRole());
  await expect(page.locator('[data-dp-role="teacher"]')).toBeVisible();
});

test('Teacher: notes persist after reload and today count matches visible lessons', async ({ page }) => {
  await page.locator('[data-dp-role="teacher"]').click();
  await page.locator('#dp-teacher-search').fill('Шту');
  await page.locator('#dp-teacher-search-results button').first().click();
  await page.locator('#dp-teacher-enter').click();
  const teacher=page.locator('#dp-teacher-app');
  await expect(teacher).toBeVisible();
  await expect(teacher.locator('.dp-t-stats strong').first()).toHaveText(
    String(await teacher.locator('.dp-t-list .dp-t-lesson').count())
  );
  await expect(teacher.locator('.dp-t-card').filter({hasText:'Завантажуємо розклад'})).toHaveCount(0);
  await teacher.locator('.dp-t-nav [data-t-page="study"]').click();
  await teacher.locator('#dp-t-notes').fill('Audit 2.0: збереження нотатки');
  await expect.poll(async()=>page.evaluate(()=>{const id=JSON.parse(localStorage.getItem('dp_reborn2_teacher_v1')||'{}').teacherId;return localStorage.getItem('dp_reborn2_teacher_notes_'+id)})).toBe('Audit 2.0: збереження нотатки');
  await page.reload();
  await expect(teacher).toBeVisible({timeout:15000});
  await teacher.locator('.dp-t-nav [data-t-page="study"]').click();
  await expect(teacher.locator('#dp-t-notes')).toHaveValue('Audit 2.0: збереження нотатки');
});

test('Student: saved group persists and profile settings are accessible', async ({ page }) => {
  await page.locator('[data-dp-role="student"]').click();
  await page.locator('#dp-group-search').fill('ЕІ-23-1');
  await page.locator('#dp-search-results button').first().click();
  await page.locator('#dp-setup-done').click();
  await page.locator('#dp-success-enter').click();
  await page.reload();
  await expect(page.locator('#dp-onboarding-roles')).toBeHidden({timeout:15000});
  await page.locator('#nav button[data-page="profile"]').click();
  await expect(page.locator('#rb43-profile-tabs')).toBeVisible();
  await page.locator('#rb43-profile-tabs [data-rb43-tab="settings"]').click();
  await expect(page.locator('#dp-v50-settings')).toBeVisible();
  await expect(page.locator('[data-dp-setting="export"]')).toBeVisible();
  await expect(page.locator('[data-dp-setting="import"]')).toBeVisible();
  await expect(page.locator('[data-dp-setting="reset"]')).toBeVisible();
  await page.locator('[data-dp-setting="group"]').click();
  await expect(page.locator('#dp-group-search')).toBeVisible();
});

test('Teacher: failed refresh preserves cached schedule and shows warning', async ({ page }) => {
  await page.locator('[data-dp-role="teacher"]').click();
  await page.locator('#dp-teacher-search').fill('Шту');
  await page.locator('#dp-teacher-search-results button').first().click();
  await page.locator('#dp-teacher-enter').click();
  const teacher=page.locator('#dp-teacher-app');
  await teacher.locator('.dp-t-nav [data-t-page="schedule"]').click();
  await expect(teacher.locator('#dp-t-refresh')).toBeVisible();
  await expect.poll(async () => page.evaluate(() => performance.getEntriesByType('resource').some(e => e.name.includes('/data/teachers/schedules/')))).toBe(true);
  await expect(teacher.locator('.dp-t-card').filter({hasText:'Завантажуємо розклад'})).toHaveCount(0);
  const before=await teacher.locator('.dp-t-lesson').count();
  await page.route('**/data/teachers/schedules/**', route=>route.abort());
  await teacher.locator('#dp-t-refresh').click();
  await expect(teacher.getByText('Не вдалося оновити розклад.', {exact:false})).toBeVisible();
  await expect(teacher.locator('.dp-t-lesson')).toHaveCount(before);
});

test('Student: social requires Telegram and settings reject invalid backup', async ({ page }) => {
  await page.locator('[data-dp-role="student"]').click();
  await page.locator('#dp-group-search').fill('ЕІ-23-1');
  await page.locator('#dp-search-results button').first().click();
  await page.locator('#dp-setup-done').click();
  await page.locator('#dp-success-enter').click();
  await page.locator('#nav button[data-page="social"]').click();
  await expect(page.locator('#screen')).toContainText('Telegram');
  await page.locator('#nav button[data-page="profile"]').click();
  await page.locator('#rb43-profile-tabs [data-rb43-tab="settings"]').click();
  const dialog=page.waitForEvent('dialog');
  await page.locator('#dp-v50-import').setInputFiles({
    name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{"format":"unknown","data":{}}')
  });
  const alert=await dialog;
  expect(alert.message()).toContain('Не вдалося імпортувати');
  await alert.accept();
});

test('UI 2.2: mobile home, schedule shortcut, profile and accessible tabs', async ({ page }) => {
  await page.locator('[data-dp-role="student"]').click();
  await page.locator('#dp-group-search').fill('ЕІ-23-1');
  await page.locator('#dp-search-results button').first().click();
  await page.locator('#dp-setup-done').click();
  await page.locator('#dp-success-enter').click();
  await page.locator('#nav button[data-page="today"]').click();
  await expect(page.locator('.reborn-home .home-feature')).toBeVisible();
  await expect(page.locator('#ui23-day-panel .ui23-day-panel-head')).toContainText('Пари на сьогодні');
  await page.locator('#nav button[data-page="schedule"]').click();
  await expect(page.locator('#dp35-schedule')).toBeVisible();
  await page.locator('#dp35-schedule [data-dp35-today]').click();
  await expect(page.locator('#nav button[data-page="schedule"]')).toHaveAttribute('aria-current','page');
  await page.locator('#nav button[data-page="profile"]').click();
  await expect(page.locator('#rb43-profile-tabs')).toHaveAttribute('role','tablist');
  await page.locator('#rb43-profile-tabs [data-rb43-tab="settings"]').click();
  await expect(page.locator('#dp-v50-settings h2')).toHaveText('Налаштування');
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2);
  expect(overflow,'No horizontal viewport overflow on iPhone').toBe(false);
});

test('UI 2.2: teacher tabs stay usable on narrow iPhone', async ({ page }) => {
  await page.setViewportSize({width:320,height:700});
  await page.locator('[data-dp-role="teacher"]').click();
  await page.locator('#dp-teacher-search').fill('Шту');
  await page.locator('#dp-teacher-search-results button').first().click();
  await page.locator('#dp-teacher-enter').click();
  const teacher=page.locator('#dp-teacher-app');
  await expect(teacher).toBeVisible();
  for(const tab of ['today','schedule','study','community','profile']){
    await teacher.locator('.dp-t-nav [data-t-page="'+tab+'"]').click();
    await expect(teacher.locator('.dp-t-nav [data-t-page="'+tab+'"]')).toHaveClass(/active/);
  }
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2);
  expect(overflow,'No horizontal viewport overflow on narrow iPhone').toBe(false);
});

test('UI 2.3: next lesson and today lessons share compact dashboard',async({page})=>{
 await page.locator('[data-dp-role="student"]').click();
 await page.locator('#dp-group-search').fill('ЕІ-23-1');
 await page.locator('#dp-search-results button').first().click();
 await page.locator('#dp-setup-done').click();
 await page.locator('#dp-success-enter').click();
 await page.locator('#nav button[data-page="today"]').click();
 await expect(page.locator('.home-feature')).toBeVisible();
 await expect(page.locator('#ui23-day-panel')).toBeVisible();
 await expect(page.locator('#ui23-day-panel')).toBeVisible();
 await expect(page.locator('#ui23-day-panel')).toBeVisible();
 await expect(page.locator('#ui23-day-panel')).toBeVisible();
 await expect(page.locator('#ui23-day-panel')).toBeVisible();
 await page.locator('#ui23-day-panel .ui23-day-panel-head button').click();
 await expect(page.locator('#nav button[data-page="schedule"]')).toHaveClass(/active/);
});

test('UI 2.3: schedule day controls and profile settings on 375px iPhone',async({page})=>{
 await page.setViewportSize({width:375,height:812});
 await page.locator('[data-dp-role="student"]').click();
 await page.locator('#dp-group-search').fill('ЕІ-23-1');
 await page.locator('#dp-search-results button').first().click();
 await page.locator('#dp-setup-done').click();
 await page.locator('#dp-success-enter').click();
 await page.locator('#nav button[data-page="schedule"]').click();
 await expect(page.locator('#dp35-schedule .dp35-monthbar')).toBeVisible();
 await expect(page.locator('#dp35-schedule .dp35-monthbar button')).toHaveCount(3);
 await page.locator('#nav button[data-page="profile"]').click();
 await expect(page.locator('#ui23-profile-label')).toBeVisible();
 await page.locator('#rb43-profile-tabs [data-rb43-tab="settings"]').click();
 await expect(page.locator('#dp-v50-settings')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2)).toBe(false);
});

test('UI 2.3: home merges daily lessons and keeps secondary panels accessible', async ({ page }) => {
  await page.locator('[data-dp-role="student"]').click();
  await page.locator('#dp-group-search').fill('ЕІ-23-1');
  await page.locator('#dp-search-results button').first().click();
  await page.locator('#dp-setup-done').click();
  await page.locator('#dp-success-enter').click();
  await page.locator('#nav button[data-page="today"]').click();
  await expect(page.locator('#ui23-day-panel')).toBeVisible();
  await expect(page.locator('#ui23-day-panel .ui23-day-panel-head')).toContainText('Пари на сьогодні');
  await expect(page.locator('#ui23-overview')).toHaveCount(1);
  await expect(page.locator('#ui23-day-panel')).toBeVisible();
  await expect(page.locator('#ui23-day-panel')).toBeVisible();
  await page.locator('#ui23-day-panel button').first().click();
  await expect(page.locator('#nav button[data-page="schedule"]')).toHaveClass(/active/);
});
test('UI 2.3: schedule date arrows and profile settings remain usable on 320px screen', async ({ page }) => {
  await page.setViewportSize({width:320,height:700});
  await page.locator('[data-dp-role="student"]').click();
  await page.locator('#dp-group-search').fill('ЕІ-23-1');
  await page.locator('#dp-search-results button').first().click();
  await page.locator('#dp-setup-done').click();
  await page.locator('#dp-success-enter').click();
  await page.locator('#nav button[data-page="schedule"]').click();
  await expect(page.locator('#dp35-schedule .dp35-monthbar')).toBeVisible();
  const buttons=page.locator('#dp35-schedule .dp35-monthbar button');
  await expect(buttons).toHaveCount(3);
  if(await buttons.nth(1).isEnabled())await buttons.nth(1).click();
  await expect(page.locator('#dp35-schedule .dp35-monthbar')).toBeVisible();
  await page.locator('#nav button[data-page="profile"]').click();
  await expect(page.locator('#ui23-profile-label')).toBeVisible();
  await page.locator('#rb43-profile-tabs [data-rb43-tab="settings"]').click();
  await expect(page.locator('#dp-v50-settings')).toBeVisible();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2);
  expect(overflow,'No horizontal overflow on 320px iPhone').toBe(false);
});

test('REBORN 3.0: home displays compact connection status and accessible daily panel', async ({ page }) => {
  await page.locator('[data-dp-role="student"]').click();
  await page.locator('#dp-group-search').fill('ЕІ-23-1');
  await page.locator('#dp-search-results button').first().click();
  await page.locator('#dp-setup-done').click();
  await page.locator('#dp-success-enter').click();
  await page.locator('#nav button[data-page="today"]').click();
  await expect(page.locator('#connection')).toBeVisible();
  await expect(page.locator('#ui23-day-panel')).toBeVisible();
  await expect(page.locator('#connection')).not.toBeEmpty();
});
test('REBORN 3.0: schedule date controls update and retain mobile accessibility', async ({ page }) => {
  await page.locator('[data-dp-role="student"]').click();
  await page.locator('#dp-group-search').fill('ЕІ-23-1');
  await page.locator('#dp-search-results button').first().click();
  await page.locator('#dp-setup-done').click();
  await page.locator('#dp-success-enter').click();
  await page.locator('#nav button[data-page="schedule"]').click();
  await expect(page.locator('#dp35-schedule .dp35-monthbar')).toBeVisible();
  const active=page.locator('.daystrip button.active');
  await expect(active).toHaveAttribute('aria-pressed','true');
  const next=page.locator('#dp35-schedule [data-dp35-next]');
  if(await next.isEnabled()){
    const before=await page.locator('#dp35-schedule .dp35-monthbar b').textContent();
    await next.click();
    await expect(page.locator('#dp35-schedule .dp35-monthbar b')).not.toHaveText(before);
  }
  await expect(page.locator('#dp35-schedule .dp35-monthbar')).toBeVisible();
});

test('REBORN current: student tasks can be added, completed and removed', async ({ page }) => {
 await page.locator('[data-dp-role="student"]').click();
 await page.locator('#dp-group-search').fill('ЕІ-23-1');
 await page.locator('#dp-search-results button').first().click();
 await page.locator('#dp-setup-done').click();
 await page.locator('#dp-success-enter').click();
 await page.locator('#nav button[data-page="study"]').click();
 await expect(page.locator('#task-form')).toBeVisible();
 await page.locator('#task-form [name="title"]').fill('Лабораторна 3.1');
 await page.locator('#task-form button').click();
 const taskDebug=await page.evaluate(()=>({form:document.querySelector('#task-form')?.outerHTML.slice(0,900), stored:localStorage.getItem('dp_reborn2_tasks'), currentPage:document.querySelector('#nav button.active')?.dataset.page, visibleTaskText:document.querySelector('#screen')?.innerText.includes('Лабораторна 3.1')}));
 console.log('DEPARA_TASK_DIAGNOSTIC',JSON.stringify(taskDebug));
 await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('dp_reborn2_tasks') || '[]').map(t => t.title)), {message:'Task submission must persist Лабораторна 3.1'}).toContain('Лабораторна 3.1');
 await expect(page.locator('#screen .card.item').filter({hasText:'Лабораторна 3.1'})).toHaveCount(1);
 await page.locator('#screen .card.item').filter({hasText:'Лабораторна 3.1'}).locator('[data-task]').check();
 await page.locator('.study-filters [data-filter="done"]').click();
 await expect(page.locator('#screen .card.item').filter({hasText:'Лабораторна 3.1'})).toHaveCount(1);
 await page.locator('#screen .card.item').filter({hasText:'Лабораторна 3.1'}).locator('[data-delete-task]').click();
 await expect(page.locator('#screen .card.item').filter({hasText:'Лабораторна 3.1'})).toHaveCount(0);
});

test('REBORN current: student task survives reload with deadline', async ({ page }) => {
 await page.locator('[data-dp-role="student"]').click();
 await page.locator('#dp-group-search').fill('ЕІ-23-1');
 await page.locator('#dp-search-results button').first().click();
 await page.locator('#dp-setup-done').click();
 await page.locator('#dp-success-enter').click();
 await page.locator('#nav button[data-page="study"]').click();
 await page.locator('#task-form [name="title"]').fill('Перевірка збереження');
 await page.locator('#task-form [name="due"]').fill('2026-11-10');
 await page.locator('#task-form button').click();
 await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('dp_reborn2_tasks') || '[]').map(t => t.title)), {message:'Task submission must persist Перевірка збереження'}).toContain('Перевірка збереження');
 await expect(page.locator('#screen .card.item').filter({hasText:'Перевірка збереження'})).toContainText('2026-11-10');
 await page.reload();
 await page.locator('#nav button[data-page="study"]').click();
 await expect(page.locator('#screen .card.item').filter({hasText:'Перевірка збереження'})).toContainText('2026-11-10');
});

test('REBORN 3.1: teacher note persists after reload', async ({ page }) => {
 await page.locator('[data-dp-role="teacher"]').click();
 await page.locator('#dp-teacher-search').fill('Шту');
 await page.locator('#dp-teacher-search-results button').first().click();
 await page.locator('#dp-teacher-enter').click();
 await page.locator('#dp-teacher-app [data-t-page="study"]').click();
 await page.locator('#dp-t-notes').fill('План викладача 3.1');
 await page.reload();
 await expect(page.locator('#dp-teacher-app')).toBeVisible({timeout:15000});
 await page.locator('#dp-teacher-app [data-t-page="study"]').click();
 await expect(page.locator('#dp-t-notes')).toHaveValue('План викладача 3.1');
});
test('REBORN 3.1: profile settings remain usable after navigating across tabs', async ({ page }) => {
 await page.locator('[data-dp-role="student"]').click();
 await page.locator('#dp-group-search').fill('ЕІ-23-1');
 await page.locator('#dp-search-results button').first().click();
 await page.locator('#dp-setup-done').click();
 await page.locator('#dp-success-enter').click();
 await page.locator('#nav button[data-page="profile"]').click();
 await page.locator('#rb43-profile-tabs [data-rb43-tab="settings"]').click();
 await expect(page.locator('#dp-v50-settings')).toBeVisible();
 await page.locator('#nav button[data-page="schedule"]').click();
 await expect(page.locator('#dp35-schedule .dp35-monthbar')).toBeVisible();
 await page.locator('#nav button[data-page="profile"]').click();
 await page.locator('#rb43-profile-tabs [data-rb43-tab="settings"]').click();
 await expect(page.locator('#dp-v50-settings')).toBeVisible();
});

test('REBORN current: home and study use a single task list with working filters', async ({ page }) => {
 await page.locator('[data-dp-role="student"]').click();
 await page.locator('#dp-group-search').fill('ЕІ-23-1');
 await page.locator('#dp-search-results button').first().click();
 await page.locator('#dp-setup-done').click();
 await page.locator('#dp-success-enter').click();
 await page.locator('#nav button[data-page="study"]').click();
 await page.locator('#task-form [name="title"]').fill('Мега перевірка');
 await page.locator('#task-form button').click();
 await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('dp_reborn2_tasks') || '[]').map(t => t.title)), {message:'Task submission must persist Мега перевірка'}).toContain('Мега перевірка');
 await page.locator('#screen .card.item').filter({hasText:'Мега перевірка'}).locator('[data-task]').check();
 await page.locator('.study-filters [data-filter="active"]').click();
 await expect(page.locator('#screen .card.item').filter({hasText:'Мега перевірка'})).toHaveCount(0);
 await page.locator('.study-filters [data-filter="done"]').click();
 await expect(page.locator('#screen .card.item').filter({hasText:'Мега перевірка'})).toHaveCount(1);
 await page.locator('#nav button[data-page="today"]').click();
 await expect(page.locator('.reborn-home .home-feature')).toBeVisible();
 await page.locator('#nav button[data-page="study"]').click();
 await expect(page.locator('#task-form')).toBeVisible();
});

test('REBORN UX audit: no profile-style widgets inside study or duplicate appearance in profile', async ({ page }) => {
 await page.locator('[data-dp-role="student"]').click();
 await page.locator('#dp-group-search').fill('ЕІ-23-1');
 await page.locator('#dp-search-results button').first().click();
 await page.locator('#dp-setup-done').click();
 await page.locator('#dp-success-enter').click();
 await page.locator('#nav button[data-page="study"]').click();
 await expect(page.locator('#screen > .card').filter({has:page.locator('h2', {hasText:/^(Мій стиль|Мій профіль|Твій профіль)$/})})).toHaveCount(0);
 await page.locator('#nav button[data-page="profile"]').click();
 await expect(page.locator('#rb40-slot .rb40-themes')).toHaveCount(1);
 await expect(page.locator('#screen > .card').filter({has:page.locator('h2', {hasText:/^Оформлення$/})})).toHaveCount(0);
});

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
  await teacher.locator('.dp-t-nav [data-t-page="study"]').click();
  await teacher.locator('#dp-t-notes').fill('Audit 2.0: збереження нотатки');
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
  await page.waitForResponse(r => r.url().includes('/data/teachers/schedules/') && r.status() === 200);
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

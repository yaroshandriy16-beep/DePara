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
  await teacher.locator('[data-t-page="schedule"]').click();
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

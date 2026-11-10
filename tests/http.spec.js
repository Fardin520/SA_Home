import { test, expect } from '@playwright/test';

test('static responses support HEAD, validation caching and protected source files', async ({ request }) => {
  const get = await request.get('/assets/app.js');
  expect(get.status()).toBe(200);
  expect(get.headers()['content-type']).toContain('text/javascript');
  expect(get.headers()['content-security-policy']).toContain("script-src 'self'");
  const head = await request.head('/assets/app.js');
  expect(head.status()).toBe(200);
  expect((await head.body()).length).toBe(0);
  const cached = await request.get('/assets/app.js', { headers: { 'if-none-match': get.headers().etag } });
  expect(cached.status()).toBe(304);
  for (const url of ['/server.mjs', '/.env', '/data/pages.json', '/lib/chat/server.js', '/assets/%5c..%5c.env']) {
    expect((await request.get(url)).status(), url).toBeGreaterThanOrEqual(400);
  }
  expect((await request.get('/api/chat')).status()).toBe(405);
  expect((await request.post('/web-hosting', { data: 'hello' })).status()).toBe(405);
});

test('the home page stays lean and loads neither AI nor chat modules until opened', async ({ page }) => {
  const paths = [];
  page.on('request', (request) => paths.push(new URL(request.url()).pathname));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Hosting without limits.');
  expect(paths).not.toContain('/api/chat');
  expect(paths).not.toContain('/assets/chat.js');
  expect(paths).not.toContain('/assets/chat.css');
  expect(paths.filter((path) => path.endsWith('.js'))).toEqual(['/assets/app.js']);
  const size = await page.evaluate(async () => (await (await fetch('/assets/app.js')).text()).length);
  expect(size).toBeLessThan(8000);
  await page.getByRole('button', { name: 'Open AI support chat' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(paths).toContain('/assets/chat.js');
  expect(paths).not.toContain('/api/chat');
});

test('unsafe source URLs fail visibly without executing HTML or leaving chat locked', async ({ page }) => {
  await page.route('**/api/chat', (route) => route.fulfill({
    contentType: 'application/x-ndjson',
    body: JSON.stringify({ type: 'sources', sources: [{ id: 1, title: '<img src=x>', url: 'javascript:alert(1)' }] }) + '\n',
  }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Open AI support chat' }).click();
  await page.getByRole('button', { name: 'What is VPS hosting?', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('website sources');
  await expect(page.getByRole('textbox', { name: 'Your hosting question' })).toBeEnabled();
  await expect(page.locator('#support-chat a[href^="javascript:"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Retry last question' })).toBeVisible();
});

test('rapid navigation keeps the latest page and browser Back restores content', async ({ page }) => {
  await page.goto('/');
  await page.route('**/web-hosting', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    await route.continue().catch(() => {});
  });
  await page.locator('footer a[href="/web-hosting"]').click();
  await page.locator('footer a[href="/sg-web-hosting"]').click();
  await expect(page).toHaveURL(/\/sg-web-hosting$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('SG Web Hosting');
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Hosting without limits.');
});

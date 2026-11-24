import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const snapshot = JSON.parse(readFileSync(new URL('../../data/menu/current.json', import.meta.url), 'utf-8'));
const selectedDay = snapshot.snapshotDate;
const testTime = new Date(`${selectedDay}T11:55:00+09:00`);
const screenshots = 'test-results/screenshots';

test('모바일 홈에서 식당별 가격과 상시 메뉴를 비교한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.clock.setFixedTime(testTime);
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '오늘의 메뉴' })).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  expect(requests.some(url => url.endsWith('.glb') || url.includes('/map/blog-map.js'))).toBe(false);
  await page.screenshot({ path: `${screenshots}/home-mobile.png`, fullPage: true });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');
  await page.screenshot({ path: `${screenshots}/home-mobile-dark.png` });
  await page.emulateMedia({ colorScheme: 'light' });
  const sandeul = page.getByRole('article', { name: '산들푸드' });
  const agio = sandeul.getByRole('tab', { name: '아지오' });
  await sandeul.getByRole('tab', { name: '나루또' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(agio).toBeFocused();
  await expect(agio).toHaveAttribute('aria-selected', 'true');
  const panel = sandeul.getByRole('tabpanel', { name: '아지오' });
  await expect(panel.locator('li:visible')).toHaveCount(5);
  await panel.getByText('전체 보기', { exact: false }).click();
  expect(await panel.locator('li:visible').count()).toBeGreaterThan(5);
  await page.getByRole('link', { name: '날짜별 기록' }).click();
  await expect(page).toHaveURL(`/posts/${selectedDay}/`);
  await expect(page.getByRole('heading', { name: '식단 기록' })).toBeVisible();
  await expect(page.getByRole('link', { name: '세종대학교 식당안내 원문' })).toBeVisible();
});

test('추천 결과에서 다른 메뉴를 요청하고 실제 길안내 링크로 이동한다', async ({ page }) => {
  await page.clock.setFixedTime(testTime);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  const positions = await page.locator('.restaurant-grid article').evaluateAll(cards =>
    cards.map(card => card.getBoundingClientRect().top)
  );
  expect(new Set(positions).size).toBe(1);
  await page.screenshot({ path: `${screenshots}/home-desktop.png`, fullPage: true });
  let attempts = 0;
  await page.route('**/api/chat', async route => {
    const { q, exclude } = route.request().postDataJSON();
    expect(q).toBe('7천 원 이하, 국물 있는 거');
    expect(exclude).toEqual(attempts ? ['fixed-1'] : []);
    attempts += 1;
    await route.fulfill({
      json: {
        choiceId: attempts === 1 ? 'fixed-1' : 'fixed-2',
        restaurantId: 'jingwan', menu: attempts === 1 ? '라면' : '순두부찌개',
        price: attempts === 1 ? 3300 : 5000, reason: '따뜻한 국물이 있는 메뉴예요.',
        mapUrl: '/map/?from=foyer&to=jingwan&mode=auto', fallback: false
      }
    });
  });
  await page.getByRole('button', { name: '7천 원 이하, 국물 있는 거' }).click();
  await page.getByRole('button', { name: '추천받기' }).click();
  const result = page.locator('[data-result]');
  await expect(result.getByRole('heading', { name: '라면' })).toBeVisible();
  await expect(result.getByText('3,300원')).toBeVisible();
  await result.getByRole('button', { name: '다른 추천' }).click();
  await expect(result.getByRole('heading', { name: '순두부찌개' })).toBeVisible();
  await page.screenshot({ path: `${screenshots}/recommendation.png` });
  await result.getByRole('link', { name: '길안내' }).click();
  await expect(page).toHaveURL('/map/?from=foyer&to=jingwan&mode=auto');
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
  await expect(page.locator('#dest')).toHaveValue('jingwan');
  await expect(page.getByRole('button', { name: '안내 멈추기' })).toBeVisible();
});

test('추천 API가 끊기면 오늘 메뉴에서 가격 기반 폴백을 제공한다', async ({ page }) => {
  await page.clock.setFixedTime(testTime);
  await page.route('**/api/chat', route => route.abort('failed'));
  await page.goto('/');
  await page.getByRole('textbox', { name: '추천받고 싶은 메뉴 조건' }).fill('6천 원 이하');
  await page.getByRole('button', { name: '추천받기' }).click();
  await expect(page.getByText('AI 추천을 불러오지 못했어요.', { exact: false })).toBeVisible();
  await expect(page.locator('[data-result] .result-price')).toHaveText(/^\d{1,3}(?:,\d{3})?원$/);
});

test('기준일이 지난 식단은 날짜와 원문 링크를 표시한다', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2040-07-13T11:55:00+09:00'));
  await page.goto('/');
  await expect(page.locator('[data-today]')).toHaveAttribute('datetime', '2040-07-13');
  await expect(page.locator('[data-stale]')).toContainText('수집분');
  await expect(page.getByRole('link', { name: '학교 원문 확인' })).toBeVisible();
});

test('모의 모바일 4G에서 첫 화면 LCP가 2.5초 이내다', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false, latency: 150, downloadThroughput: 200_000, uploadThroughput: 93_750,
    connectionType: 'cellular4g'
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.goto('/');
  const lcp = await page.evaluate(() => new Promise<number>(resolve => {
    let last = 0;
    const observer = new PerformanceObserver(list => {
      last = list.getEntries().at(-1)?.startTime ?? last;
    });
    observer.observe({ type: 'largest-contentful-paint', buffered: true });
    setTimeout(() => {
      observer.disconnect();
      resolve(last);
    }, 700);
  }));
  console.log(`모의 4G LCP: ${Math.round(lcp)}ms`);
  expect(lcp).toBeGreaterThan(0);
  expect(lcp).toBeLessThan(2500);
});

test('3D 입실 링크가 실제 캐릭터를 이동시키고 수동 링크는 출발 위치만 지정한다', async ({ page }) => {
  await page.goto('/map/?from=exit&to=pc&mode=auto');
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
  await expect(page.locator('#dest')).toHaveValue('pc');
  await expect(page.getByRole('button', { name: '안내 멈추기' })).toBeVisible();
  const position = await page.locator('body').getAttribute('data-x');
  await expect(page.locator('body')).not.toHaveAttribute('data-x', position ?? '');
  await page.screenshot({ path: `${screenshots}/map-auto.png` });
  await page.getByRole('link', { name: '오늘 메뉴' }).click();
  await expect(page).toHaveURL('/');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/map/?from=foyer&to=gunja&mode=manual');
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
  await expect(page.locator('body')).toHaveAttribute('data-floor', '6');
  await expect(page.locator('#dest')).toHaveValue('gunja');
  await expect(page.getByRole('button', { name: '안내 따라 걷기' })).toBeVisible();
  await page.screenshot({ path: `${screenshots}/map-mobile-manual.png` });
});

test('2D 지도는 모델을 요청하지 않고 3D 실패 시에도 동선을 표시한다', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await page.goto('/map/?from=exit&to=pc&mode=auto&view=2d');
  await expect(page.getByRole('heading', { name: '2D 길안내' })).toBeVisible();
  await expect(page.getByText('김원관 엘리베이터로 6층 이동')).toBeVisible();
  expect(requests.some(url => url.endsWith('.glb'))).toBe(false);
  await page.screenshot({ path: `${screenshots}/map-2d.png` });
  await page.route('**/map/campus.glb', route => route.abort('failed'));
  await page.goto('/map/?from=foyer&to=student&mode=auto');
  await expect(page.getByRole('heading', { name: '2D 길안내' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('파리바게뜨 건물 지하 1층', { exact: false })).toBeVisible();
});

test('Worker는 잘못된 입력을 거부하고 동시 요청도 하루 20회까지만 허용한다', async ({ request }) => {
  const invalid = await request.post('/api/chat', { data: { q: ' '.repeat(2) } });
  expect(invalid.status()).toBe(400);
  expect((await request.get('/api/chat')).status()).toBe(405);
  const replies = await Promise.all(Array.from({ length: 21 }, () =>
    request.post('/api/chat', { data: { q: '7천 원 이하' } })
  ));
  expect(replies.filter(response => response.status() === 429)).toHaveLength(1);
  const accepted = replies.filter(response => response.status() !== 429);
  expect(accepted).toHaveLength(20);
  for (const response of accepted) {
    expect([200, 404]).toContain(response.status());
    if (response.status() === 200) {
      expect(await response.json()).toMatchObject({ fallback: true, price: expect.any(Number) });
    }
  }
});

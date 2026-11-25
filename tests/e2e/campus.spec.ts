import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const snapshot = JSON.parse(readFileSync(new URL('../../data/menu/current.json', import.meta.url), 'utf-8'));
const selectedDay = snapshot.snapshotDate;
const testTime = new Date(`${selectedDay}T11:55:00+09:00`);
const screenshots = 'test-results/screenshots';
const mobile = { width: 390, height: 844 };

test('모바일 홈에서 식당별 가격과 상시 메뉴를 비교한다', async ({ page }) => {
  await page.setViewportSize(mobile);
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
  await page.getByRole('link', { name: '식당 바로가기' }).click();
  await expect(page).toHaveURL('/#restaurants');
  const gyejeol = page.getByRole('article', { name: '계절밥상' });
  await expect(gyejeol.getByRole('tabpanel', { name: '중식' })).toContainText('7,000원');
  await gyejeol.getByRole('tab', { name: '석식' }).click();
  await expect(gyejeol.getByRole('tabpanel', { name: '석식' })).toContainText('석식 정식');
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
  await sandeul.screenshot({ path: `${screenshots}/menu-expanded.png` });
  await panel.getByText('접기', { exact: true }).click();
  await expect(panel.locator('li:visible')).toHaveCount(5);
  await page.getByRole('link', { name: '날짜별 기록' }).click();
  await expect(page).toHaveURL(`/posts/${selectedDay}/`);
  await expect(page.getByRole('heading', { name: '식단 기록' })).toBeVisible();
  await expect(page.getByRole('link', { name: '세종대학교 식당안내 원문' })).toHaveAttribute('href', snapshot.source);
  await page.screenshot({ path: `${screenshots}/archive.png`, fullPage: true });
  await page.getByRole('navigation', { name: '다른 날짜 식단' }).getByRole('link', { name: '오늘 메뉴' }).click();
  await expect(page).toHaveURL('/');
});

test('데스크톱 홈은 식당 세 곳을 한 행에 표시한다', async ({ page }) => {
  await page.clock.setFixedTime(testTime);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  const positions = await page.locator('.restaurant-grid article').evaluateAll(cards =>
    cards.map(card => card.getBoundingClientRect().top)
  );
  expect(new Set(positions).size).toBe(1);
  await page.screenshot({ path: `${screenshots}/home-desktop.png`, fullPage: true });
});

test('추천 대기와 결과, 다른 추천, 식당 길안내를 차례로 표시한다', async ({ page }) => {
  await page.clock.setFixedTime(testTime);
  await page.setViewportSize(mobile);
  await page.goto('/');
  let attempts = 0;
  let releaseFirstReply!: () => void;
  const firstReply = new Promise<void>(resolve => { releaseFirstReply = resolve; });
  await page.route('**/api/chat', async route => {
    const { q, exclude } = route.request().postDataJSON();
    expect(q).toBe('7천 원 이하, 국물 있는 거');
    expect(exclude).toEqual(attempts ? ['fixed-1'] : []);
    attempts += 1;
    const first = attempts === 1;
    if (first) await firstReply;
    await route.fulfill({
      json: {
        choiceId: first ? 'fixed-1' : 'fixed-2',
        restaurantId: 'jingwan', menu: first ? '라면' : '순두부찌개',
        price: first ? 3300 : 5000, reason: '따뜻한 국물이 있는 메뉴예요.',
        mapUrl: '/map/?from=foyer&to=jingwan&mode=auto', fallback: false
      }
    });
  });
  const recommendation = page.getByRole('region', { name: 'AI 메뉴 추천' });
  const input = recommendation.getByRole('textbox');
  const submit = recommendation.getByRole('button', { name: '추천받기' });
  await page.getByRole('button', { name: '7천 원 이하, 국물 있는 거' }).click();
  await expect(input).toHaveValue('7천 원 이하, 국물 있는 거');
  await submit.click();
  const result = page.locator('[data-result]');
  try {
    await expect(result).toHaveAttribute('aria-busy', 'true');
    await expect(result.getByText('메뉴를 고르는 중이에요.')).toBeVisible();
    await expect(input).toBeDisabled();
    await expect(submit).toBeDisabled();
    await recommendation.screenshot({ path: `${screenshots}/recommendation-loading.png` });
  } finally {
    releaseFirstReply();
  }
  await expect(result.getByRole('heading', { name: '라면' })).toBeVisible();
  await expect(result.getByText('3,300원')).toBeVisible();
  await expect(result.getByText('진관키친')).toBeVisible();
  await expect(result.getByText('따뜻한 국물이 있는 메뉴예요.')).toBeVisible();
  await expect(input).toBeEnabled();
  await recommendation.screenshot({ path: `${screenshots}/recommendation.png` });
  await result.getByRole('button', { name: '다른 추천' }).click();
  await expect(result.getByRole('heading', { name: '순두부찌개' })).toBeVisible();
  await expect(result.getByText('5,000원')).toBeVisible();
  await expect(result.getByRole('link', { name: '길안내' })).toBeFocused();
  await recommendation.screenshot({ path: `${screenshots}/recommendation-alternate.png` });
  await result.getByRole('link', { name: '길안내' }).click();
  await expect(page).toHaveURL('/map/?from=foyer&to=jingwan&mode=auto');
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
  await expect(page.locator('#dest')).toHaveValue('jingwan');
  await expect(page.getByRole('button', { name: '안내 멈추기' })).toBeVisible();
  await page.screenshot({ path: `${screenshots}/map-recommendation.png` });
  await page.getByRole('link', { name: '오늘 메뉴' }).click();
  await expect(page).toHaveURL('/');
});

test('추천 API가 끊기면 오늘 메뉴에서 가격 기반 폴백을 제공한다', async ({ page }) => {
  await page.clock.setFixedTime(testTime);
  await page.setViewportSize(mobile);
  await page.route('**/api/chat', route => route.abort('failed'));
  await page.goto('/');
  await page.getByRole('textbox', { name: '추천받고 싶은 메뉴 조건' }).fill('6천 원 이하');
  await page.getByRole('button', { name: '추천받기' }).click();
  await expect(page.getByText('AI 추천을 불러오지 못했어요.', { exact: false })).toBeVisible();
  const result = page.locator('[data-result]');
  const menu = await result.getByRole('heading').textContent();
  const priceLabel = await result.locator('.result-price').textContent();
  const price = Number(priceLabel?.replace(/[^\d]/g, ''));
  expect(price).toBeGreaterThan(0);
  expect(price).toBeLessThanOrEqual(6000);
  expect(snapshot.fixed).toContainEqual(expect.objectContaining({ name: menu, price }));
  await page.getByRole('region', { name: 'AI 메뉴 추천' }).screenshot({ path: `${screenshots}/recommendation-fallback.png` });
});

test('기준일이 지난 식단은 날짜와 원문 링크를 표시한다', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2040-07-13T11:55:00+09:00'));
  await page.setViewportSize(mobile);
  await page.goto('/');
  await expect(page.locator('[data-today]')).toHaveAttribute('datetime', '2040-07-13');
  await expect(page.locator('[data-stale]')).toContainText('수집분');
  await expect(page.getByRole('link', { name: '학교 원문 확인' })).toHaveAttribute('href', snapshot.source);
  await page.screenshot({ path: `${screenshots}/stale-menu.png`, fullPage: true });
});

for (const { label, date, status, error, message } of [
  { label: '조건에 맞는 메뉴 없음', date: testTime, status: 404, error: 'no_match', message: '조건에 맞는 다른 메뉴가 없어요.' },
  { label: '오래된 식단', date: new Date('2040-07-13T11:55:00+09:00'), status: 404, error: 'stale', message: '오늘 수집된 식단이 아직 없어요.' },
  { label: '주말 휴무', date: new Date('2040-07-14T11:55:00+09:00'), status: 404, error: 'closed', message: '주말에는 교내 식당이 쉬어요.' },
  { label: '추천 횟수 초과', date: testTime, status: 429, error: 'rate_limit', message: '오늘의 추천 횟수를 모두 사용했어요.' }
]) {
  test(`추천 응답이 ${label}일 때 사용자에게 이유를 표시한다`, async ({ page }) => {
    await page.clock.setFixedTime(date);
    await page.setViewportSize(mobile);
    await page.route('**/api/chat', route => route.fulfill({ status, json: { error } }));
    await page.goto('/');
    const recommendation = page.getByRole('region', { name: 'AI 메뉴 추천' });
    const input = recommendation.getByRole('textbox');
    await input.fill('1원 이하');
    await recommendation.getByRole('button', { name: '추천받기' }).click();
    await expect(recommendation.getByText(message, { exact: false })).toBeVisible();
    await expect(recommendation.getByRole('link', { name: '길안내' })).toHaveCount(0);
    await expect(input).toBeEnabled();
    if (error === 'closed') {
      const daily = page.getByRole('article', { name: '계절밥상' });
      await expect(daily.getByText('오늘은 운영하지 않아요.')).toBeVisible();
      await expect(daily.getByRole('tablist')).toHaveCount(0);
      await page.screenshot({ path: `${screenshots}/weekend-closed.png`, fullPage: true });
    } else {
      await recommendation.screenshot({ path: `${screenshots}/recommendation-${error}.png` });
    }
  });
}

test('8초 동안 추천 응답이 없으면 가격 기반 추천으로 복구한다', async ({ page }) => {
  await page.clock.install({ time: testTime });
  await page.setViewportSize(mobile);
  let releaseRequest!: () => void;
  const pendingResponse = new Promise<void>(resolve => { releaseRequest = resolve; });
  await page.route('**/api/chat', async route => {
    await pendingResponse;
    await route.abort();
  });
  try {
    await page.goto('/');
    const recommendation = page.getByRole('region', { name: 'AI 메뉴 추천' });
    await recommendation.getByRole('textbox').fill('6천 원 이하');
    const request = page.waitForRequest('**/api/chat');
    await recommendation.getByRole('button', { name: '추천받기' }).click();
    await request;
    await expect(recommendation.getByText('메뉴를 고르는 중이에요.')).toBeVisible();
    await page.clock.fastForward(8000);
    await expect(recommendation.getByText('AI 추천을 불러오지 못했어요.', { exact: false })).toBeVisible();
    await expect(recommendation.getByRole('button', { name: '추천받기' })).toBeEnabled();
  } finally {
    releaseRequest();
  }
  await page.unrouteAll({ behavior: 'wait' });
});

test('도움됐어요를 누르면 선택 상태와 이벤트가 한 번만 기록된다', async ({ page }) => {
  await page.setViewportSize(mobile);
  await page.clock.setFixedTime(testTime);
  await page.addInitScript(() => {
    const events: string[] = [];
    localStorage.setItem('test-events', '[]');
    window.campusEvent = name => {
      events.push(name);
      localStorage.setItem('test-events', JSON.stringify(events));
    };
  });
  await page.goto('/');
  const feedback = page.getByRole('button', { name: '도움됐어요' });
  await expect(feedback).toHaveAttribute('aria-pressed', 'false');
  await feedback.click();
  await expect(feedback).toHaveAttribute('aria-pressed', 'true');
  await feedback.click();
  expect(await page.evaluate(() => localStorage.getItem('test-events'))).toBe('["helpful_click"]');
  await page.locator('.page-footer').screenshot({ path: `${screenshots}/feedback.png` });
});

test('모의 모바일 4G에서 첫 화면 LCP가 2.5초 이내다', async ({ page, context }) => {
  await page.setViewportSize(mobile);
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

test('홈에서 3D 입실 길안내를 시작해 승강기를 거쳐 PC 강의실까지 도착한다', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await page.getByRole('link', { name: '3D 입실 길안내' }).click();
  await expect(page).toHaveURL('/map/?from=exit&to=pc&mode=auto');
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
  await expect(page.locator('body')).toHaveAttribute('data-floor', '1');
  await expect(page.locator('#dest')).toHaveValue('pc');
  const guide = page.locator('#guide');
  await expect(guide).toHaveText('안내 멈추기');
  const position = await page.locator('body').getAttribute('data-x');
  await expect(page.locator('body')).not.toHaveAttribute('data-x', position ?? '');
  await page.screenshot({ path: `${screenshots}/map-auto.png` });
  await guide.click();
  await expect(guide).toHaveText('안내 따라 걷기');
  const speed = page.getByRole('button', { name: '안내 보행 배속' });
  await speed.click();
  await expect(speed).toHaveText('3×');
  await speed.click();
  await expect(speed).toHaveText('6×');
  await guide.click();
  await expect(page.locator('body')).toHaveAttribute('data-floor', '6', { timeout: 45_000 });
  await expect(page.locator('#distance')).toHaveText('도착', { timeout: 15_000 });
  await expect(page.locator('#instruction')).toHaveText('PC 강의실 도착');
  await page.screenshot({ path: `${screenshots}/map-classroom-arrival.png` });
  await page.getByRole('link', { name: '오늘 메뉴' }).click();
  await expect(page).toHaveURL('/');
});

for (const { name, target, lastStep } of [
  { name: '계절밥상', target: 'gunja', lastStep: '군자관 입구 도착 · 건물 안 엘리베이터로 6층' },
  { name: '산들푸드', target: 'student', lastStep: '학생회관 입구 도착 · 파리바게뜨 건물 지하 1층' },
  { name: '진관키친', target: 'jingwan', lastStep: '진관홀 입구 도착 · 건물 안에서 지하 1층' }
]) {
  test(`${name} 카드에서 3D로 건물 입구에 도착하면 마지막 구간을 안내한다`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize(mobile);
    await page.goto('/');
    await page.getByRole('link', { name: `${name} 길안내` }).click();
    await expect(page).toHaveURL(`/map/?from=foyer&to=${target}&mode=auto`);
    await expect(page.locator('body')).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
    await expect(page.locator('body')).toHaveAttribute('data-floor', '6');
    await expect(page.locator('#dest')).toHaveValue(target);
    await expect(page.locator('#guide')).toHaveText('안내 멈추기');
    const speed = page.getByRole('button', { name: '안내 보행 배속' });
    await speed.click();
    await speed.click();
    await expect(speed).toHaveText('6×');
    await expect(page.locator('#instruction')).toHaveText(lastStep, { timeout: 45_000 });
    await expect(page.locator('#distance')).toHaveText('도착');
    await page.screenshot({ path: `${screenshots}/map-arrival-${target}.png` });
  });
}

test.describe('모바일 터치로 3D 지도 조작', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: mobile });

  test('수동 모드에서 도움말을 열고 출발 위치를 바꾼 뒤 방향 버튼으로 걷는다', async ({ page, context }) => {
    await page.goto('/map/?from=foyer&to=gunja&mode=manual');
    const body = page.locator('body');
    await expect(body).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
    await expect(body).toHaveAttribute('data-floor', '6');
    await expect(page.locator('#dest')).toHaveValue('gunja');
    await expect(page.getByRole('button', { name: '안내 따라 걷기' })).toBeVisible();
    const help = page.getByRole('button', { name: '이용 안내' });
    await help.tap();
    await expect(help).toHaveAttribute('aria-expanded', 'true');
    await page.screenshot({ path: `${screenshots}/map-help.png` });
    await page.getByRole('button', { name: '5번 출구' }).tap();
    await expect(help).toHaveAttribute('aria-expanded', 'false');
    await expect(body).toHaveAttribute('data-floor', '1');
    await page.getByRole('button', { name: '1인칭 시점' }).tap();
    await expect(page.getByRole('button', { name: '3인칭 시점' })).toBeVisible();
    const position = await body.getAttribute('data-y');
    const forward = page.getByRole('button', { name: '▲' });
    await expect(forward).toBeVisible();
    const box = (await forward.boundingBox())!;
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }]
    });
    try {
      await expect(body).not.toHaveAttribute('data-y', position ?? '');
    } finally {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    await page.screenshot({ path: `${screenshots}/map-mobile-manual.png` });
  });
});

test('2D 지도는 모델을 요청하지 않고 3D 실패 시에도 동선을 표시한다', async ({ page }) => {
  await page.setViewportSize(mobile);
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await page.goto('/');
  await page.getByRole('link', { name: '2D 지도' }).click();
  await expect(page).toHaveURL('/map/?from=exit&to=pc&mode=auto&view=2d');
  await expect(page.getByRole('heading', { name: '2D 길안내' })).toBeVisible();
  await expect(page.getByText('김원관 엘리베이터로 6층 이동')).toBeVisible();
  expect(requests.some(url => url.endsWith('.glb'))).toBe(false);
  await page.screenshot({ path: `${screenshots}/map-2d.png` });
  await page.route('**/map/campus.glb', route => route.abort('failed'));
  await page.goto('/map/?from=foyer&to=student&mode=auto');
  await expect(page.getByRole('heading', { name: '2D 길안내' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('파리바게뜨 건물 지하 1층', { exact: false })).toBeVisible();
  await page.screenshot({ path: `${screenshots}/map-2d-fallback.png` });
  await page.unroute('**/map/campus.glb');
  await page.getByRole('link', { name: '3D 지도 열기' }).click();
  await expect(page).toHaveURL('/map/?from=foyer&to=student&mode=manual');
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
  await expect(page.locator('#dest')).toHaveValue('student');
  await expect(page.getByRole('button', { name: '안내 따라 걷기' })).toBeVisible();
});

test('Worker는 잘못된 입력을 거부하고 동시 요청도 하루 20회까지만 허용한다', async ({ request }) => {
  const invalid = await request.post('/api/chat', { data: { q: ' '.repeat(2) } });
  expect(invalid.status()).toBe(400);
  expect((await request.get('/api/chat')).status()).toBe(405);
  const replies = await Promise.all(Array.from({ length: 21 }, () =>
    request.post('/api/chat', { data: { q: '7천 원 이하' } })
  ));
  const limited = replies.filter(response => response.status() === 429);
  expect(limited).toHaveLength(1);
  expect(await limited[0].json()).toEqual({ error: 'rate_limit' });
  expect(Number(limited[0].headers()['retry-after'])).toBeGreaterThan(0);
  const accepted = replies.filter(response => response.status() !== 429);
  expect(accepted).toHaveLength(20);
  for (const response of accepted) {
    expect([200, 404]).toContain(response.status());
    if (response.status() === 200) {
      expect(await response.json()).toMatchObject({ fallback: true, price: expect.any(Number) });
    }
  }
});

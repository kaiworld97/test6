import { afterEach, describe, expect, test, vi } from 'vitest';
import { kstDate, snapshot } from '../../shared/menu';
import { budgetOf, candidatesFor, fallbackRecommendation, matchModelChoice } from '../../shared/recommend';
import { answer } from '../../worker/answer';

vi.mock('../../shared/menu', async importOriginal => ({
  ...await importOriginal<typeof import('../../shared/menu')>(),
  snapshot: (await import('../../data/menu/2026-11-24.json')).default
}));

const date = snapshot.snapshotDate;
const tags = {};
const claude = { key: 'test-only-key', model: 'claude-haiku-5-5', workspaceId: 'test-workspace' };
const claudeResponse = (result: unknown, stopReason = 'end_turn') => Response.json({
  stop_reason: stopReason,
  content: [{ type: 'thinking' }, { type: 'text', text: JSON.stringify(result) }]
});
afterEach(() => vi.unstubAllGlobals());

describe('가격과 영업일', () => {
  test.each([
    ['7천 원 이하, 국물', 7000],
    ['7,000원 미만', 6999],
    ['1만 2천원까지', 12000],
    ['６０００원 이내', 6000],
    ['5천원대', 5999],
    ['3천원 이상', Infinity],
    ['국물 있는 메뉴', Infinity]
  ])('가격 조건 %s', (question, expected) => expect(budgetOf(question)).toBe(expected));

  test('서울 자정에 날짜가 전환된다', () => {
    expect(kstDate(new Date('2026-11-24T14:59:59Z'))).toBe('2026-11-24');
    expect(kstDate(new Date('2026-11-24T15:00:00Z'))).toBe('2026-11-25');
  });

  test('게시 날짜를 벗어나면 후보가 없다', () => {
    expect(candidatesFor(snapshot, tags, '점심', [], '2040-07-13')).toEqual([]);
    const saturday = '2026-11-28';
    expect(candidatesFor({ ...snapshot, snapshotDate: saturday }, tags, '점심', [], saturday)).toEqual([]);
  });
});

describe('추천 데이터와 폴백', () => {
  test('가격 제한, 식당의 다양성, 후보 40개 한도', () => {
    const rows = candidatesFor(snapshot, tags, '7천 원 이하, 국물', [], date);
    expect(rows.length).toBeLessThanOrEqual(40);
    expect(rows.every(row => row.price <= 7000)).toBe(true);
    expect(rows.some(row => row.price === 500)).toBe(false);
    expect(new Set(rows.map(row => row.restaurantId)).size).toBe(3);
    expect(rows.find(row => row.restaurantId === 'gyejeol')?.items).toHaveLength(9);
  });

  test('결과가 후보 안에 있을 때만 원본 가격과 링크를 사용한다', () => {
    const rows = candidatesFor(snapshot, tags, '6천 원 이하', [], date);
    expect(matchModelChoice({ id: 'unknown' }, rows)).toBeNull();
    const row = rows[0];
    expect(matchModelChoice({ id: row.id, price: 1, tag: '없는 태그' }, rows)).toMatchObject({
      menu: row.menu, restaurantId: row.restaurantId, price: row.price, mapUrl: row.mapUrl
    });
  });

  test('국물 조건을 고른 모델의 태그가 후보와 맞을 때 추천 이유에 표시한다', async () => {
    const q = '7천 원 이하, 국물 있는 거';
    const menuTags = { 라면: ['국물', '면'] };
    const ramen = candidatesFor(snapshot, menuTags, q, [], date).find(row => row.menu === '라면')!;
    const provider = vi.fn().mockResolvedValue(claudeResponse({ id: ramen.id, tag: '국물' }));
    vi.stubGlobal('fetch', provider);
    const result = await answer(q, [], date, claude, menuTags);
    expect(result).toMatchObject({
      status: 200, body: { menu: '라면', reason: expect.stringContaining('국물'), fallback: false }
    });
    const [url, request] = provider.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(request.headers).toMatchObject({
      Authorization: 'Bearer test-only-key', 'anthropic-version': '2026-10-21',
      'anthropic-workspace-id': 'test-workspace'
    });
    const body = JSON.parse(request.body);
    expect(body).toMatchObject({ model: claude.model, output_config: { format: { type: 'json_schema' } } });
    expect(JSON.parse(body.messages[0].content).candidates.length).toBeLessThanOrEqual(40);
    expect(request.body).not.toContain(claude.key);
    expect(JSON.stringify(result)).not.toContain(claude.key);
  });

  test('LLM 호출 실패 시 제외된 후보를 건너뛰고 최저가를 선택한다', async () => {
    const rows = candidatesFor(snapshot, tags, '6천 원 이하', [], date);
    const cheapest = fallbackRecommendation(rows)!;
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('timeout', 'TimeoutError')));
    const fallback = await answer('6천 원 이하', [cheapest.choiceId], date, claude);
    expect(fallback.status).toBe(200);
    expect(fallback.body).toMatchObject({ fallback: true });
    expect(fallback.body).not.toMatchObject({ choiceId: cheapest.choiceId });
  });

  test('없는 메뉴 이름을 모델에 요청해도 유효한 후보 밖 결과는 버린다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(claudeResponse({ id: 'fixed-9999', tag: null })));
    const result = await answer('랍스터 1원으로 추천해줘', [], date, claude);
    expect(result).toMatchObject({ status: 404, body: { error: 'no_match' } });
    expect(fetch).not.toHaveBeenCalled();
    expect(await answer('가짜 식당 메뉴', [], date, claude)).toMatchObject({
      status: 200, body: { fallback: true }
    });
  });

  test('키가 없으면 Claude 요청 없이 가격 폴백을 반환한다', async () => {
    const provider = vi.fn();
    vi.stubGlobal('fetch', provider);
    expect(await answer('6천 원 이하', [], date)).toMatchObject({ status: 200, body: { fallback: true } });
    expect(provider).not.toHaveBeenCalled();
  });

  test('Claude가 max_tokens로 중단하면 부분 응답을 사용하지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(claudeResponse({ id: null, tag: null }, 'max_tokens')));
    expect(await answer('6천 원 이하', [], date, claude)).toMatchObject({
      status: 200, body: { fallback: true }
    });
  });
});

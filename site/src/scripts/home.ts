import { displayDate, kstDate, priceLabel, snapshot, weekend } from '../../../shared/menu';
import { candidatesFor, fallbackRecommendation, type Recommendation } from '../../../shared/recommend';

function refreshDate() {
  const day = kstDate();
  const date = document.querySelector<HTMLTimeElement>('[data-today]');
  if (date && date.dateTime !== day) {
    date.dateTime = day;
    date.textContent = displayDate(day);
  }
  const stale = document.querySelector<HTMLElement>('[data-stale]');
  const updated = document.querySelector<HTMLElement>('[data-updated]');
  const closed = document.querySelector<HTMLElement>('[data-daily-closed]');
  const menu = document.querySelector<HTMLElement>('[data-daily-content]');
  const off = weekend(day);
  if (stale) stale.hidden = snapshot.snapshotDate === day;
  if (updated) updated.hidden = snapshot.snapshotDate !== day;
  if (closed && menu) {
    const hasMeal = snapshot.daily.some(row => row.date === snapshot.snapshotDate);
    closed.hidden = hasMeal && !off;
    closed.textContent = off || snapshot.snapshotDate === day ? '오늘은 운영하지 않아요.' : '기준일에 게시된 식단이 없어요.';
    menu.hidden = off || !hasMeal;
  }
}

refreshDate();
window.setInterval(refreshDate, 60_000);

const form = document.querySelector<HTMLFormElement>('[data-recommend]');
const input = form?.querySelector<HTMLInputElement>('[name="q"]');
const submit = form?.querySelector<HTMLButtonElement>('button[type="submit"]');
const result = document.querySelector<HTMLElement>('[data-result]');
const examples = [...document.querySelectorAll<HTMLButtonElement>('[data-example]')];
const messages: Record<string, string> = {
  rate_limit: '오늘의 추천 횟수를 모두 사용했어요. 식당별 메뉴에서 직접 골라보세요.',
  closed: '주말에는 교내 식당이 쉬어요. 상시 메뉴는 아래에서 볼 수 있어요.',
  stale: '오늘 수집된 식단이 아직 없어요. 마지막 수집분과 학교 원문을 확인해 주세요.',
  no_match: '조건에 맞는 다른 메뉴가 없어요. 예산이나 식사 조건을 바꿔보세요.',
  no_preference_match: '조건에 맞는 메뉴를 찾지 못했어요. 조건을 조금 바꿔보세요.',
  invalid_input: '추천 조건을 200자 이내로 입력해 주세요.'
};

if (form && input && submit && result) {
  let question = '';
  let excluded: string[] = [];
  let busy = false;

  const element = <K extends keyof HTMLElementTagNameMap>(tag: K, content = '', className = '') => {
    const node = document.createElement(tag);
    node.textContent = content;
    node.className = className;
    return node;
  };

  function showResult(row: Recommendation) {
    const restaurant = snapshot.restaurants.find(item => item.id === row.restaurantId);
    if (!restaurant) return;
    const label = element('p', restaurant.name, 'result-label');
    const title = element('h3', row.menu);
    const price = element('p', priceLabel(row.price), 'result-price');
    const reason = element('p', row.reason);
    const route = element('a', '길안내', 'button primary-button');
    route.href = row.mapUrl;
    route.dataset.route = row.restaurantId;
    route.dataset.placement = 'recommendation';
    const next = element('button', '다른 추천', 'button secondary-button');
    next.type = 'button';
    next.addEventListener('click', () => void recommend(question, true));
    const actions = element('div', '', 'result-buttons');
    actions.append(route, next);
    result!.replaceChildren(label, title, price, reason);
    if (row.fallback) {
      result!.append(element('p', 'AI 추천을 불러오지 못했어요. 가격 조건으로 골랐어요.', 'fallback-note'));
    }
    result!.append(actions);
  }

  async function recommend(q: string, alternate = false) {
    if (busy || !q) return;
    if (!alternate || question !== q) excluded = [];
    question = q;
    busy = true;
    for (const control of [input!, submit!, ...examples]) control.disabled = true;
    result!.setAttribute('aria-busy', 'true');
    const line = () => {
      const node = element('div', '', 'loading-line');
      node.setAttribute('aria-hidden', 'true');
      return node;
    };
    result!.replaceChildren(element('p', '메뉴를 고르는 중이에요.'), line(), line());
    window.campusEvent?.('recommend_submit');

    let row: Recommendation | null = null;
    let message: string | undefined;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q, exclude: excluded }),
        signal: controller.signal
      });
      const body = await response.json();
      if (response.ok && body && typeof body.choiceId === 'string') row = body;
      else message = messages[body?.error];
    } catch {
      // The static menu also supports a price-only result when the API is unreachable.
    } finally {
      window.clearTimeout(timer);
    }
    if (!row && !message) {
      const day = kstDate();
      row = fallbackRecommendation(candidatesFor(snapshot, {}, q, excluded, day));
      if (!row) message = messages[weekend(day) ? 'closed' : day !== snapshot.snapshotDate ? 'stale' : 'no_match'];
    }
    if (row) {
      excluded = [...excluded, row.choiceId].slice(-40);
      showResult(row);
      window.campusEvent?.('recommend_result', { restaurant_id: row.restaurantId, fallback: row.fallback });
    } else {
      result!.replaceChildren(element('p', message ?? messages.no_match));
    }
    result!.removeAttribute('aria-busy');
    for (const control of [input!, submit!, ...examples]) control.disabled = false;
    busy = false;
    if (alternate) result!.querySelector<HTMLAnchorElement>('a')?.focus();
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    void recommend(input.value.trim());
  });
  examples.forEach(button => button.addEventListener('click', () => {
    input.value = button.dataset.example ?? '';
    input.focus();
  }));
}

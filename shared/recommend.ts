import { kstDate, priceLabel, routeUrl, weekend, type MenuSnapshot, type RestaurantId } from './menu';

export interface Candidate {
  id: string;
  restaurantId: RestaurantId;
  menu: string;
  price: number;
  tags: string[];
  items?: string[];
  mapUrl: string;
}

export interface Recommendation {
  choiceId: string;
  restaurantId: RestaurantId;
  menu: string;
  price: number;
  reason: string;
  mapUrl: string;
  fallback: boolean;
}

export const LIMIT = 40;
const tagWords: Record<string, RegExp> = {
  국물: /국물|찌개|수프|탕|국/, 매운맛: /매운|얼큰|매콤/, 고기: /고기|닭|돈까스|돈가스/,
  해산물: /해산물|생선|새우|오징어/, 면: /면|우동|파스타/, 밥: /밥|한식/,
  튀김: /튀김|튀긴|돈까스|돈가스/, 채식가능: /채식|비건/
};

export function budgetOf(q: string) {
  const pattern = /(?<![\d,])(?:(\d+(?:\.\d+)?)\s*만\s*(?:(\d+(?:\.\d+)?)\s*천\s*)?|(\d+(?:\.\d+)?)\s*천\s*|([\d,]+)\s*)(원|(?=이하|미만|이내|까지|이상|넘게))/g;
  const caps = [...q.normalize('NFKC').matchAll(pattern)].flatMap(match => {
    const after = q.normalize('NFKC').slice(match.index + match[0].length).trimStart();
    if (/^(이상|초과|넘게|부터)/.test(after)) return [];
    const amount = match[1] ? Number(match[1]) * 10_000 + Number(match[2] ?? 0) * 1000
      : match[3] ? Number(match[3]) * 1000 : Number(match[4].replaceAll(',', ''));
    return Number.isSafeInteger(amount) ? [amount + (/^대/.test(after) ? 999 : /^미만/.test(after) ? -1 : 0)] : [];
  });
  return caps.length ? Math.min(...caps) : Infinity;
}

export function candidatesFor(
  data: MenuSnapshot, tags: Record<string, string[]>, q: string, exclude: string[], date = kstDate()
): Candidate[] {
  if (data.snapshotDate !== date || weekend(date)) return [];
  const restaurant = new Map(data.restaurants.map(row => [row.id, row]));
  const meal = /저녁|석식/.test(q) && !/점심|중식/.test(q) ? '석식' : '중식';
  const daily: Candidate[] = data.daily.filter(row => row.date === date && row.meal === meal).map(row => ({
    id: `daily-${meal}`,
    restaurantId: 'gyejeol',
    menu: `${row.items[0]}${row.items[1] ? ` · ${row.items[1]}` : ''} ${meal} 정식`,
    items: row.items,
    price: row.price,
    tags: [...new Set(row.items.flatMap(item => tags[item] ?? []).filter(tag => tag !== '채식가능'))],
    mapUrl: routeUrl(restaurant.get('gyejeol')!.mapTarget)
  }));
  const fixed: Candidate[] = data.fixed.flatMap((row, index) => {
    if (/^※.+추가|^[가-힣\s]+추가$/.test(row.name)) return [];
    return [{
      id: `fixed-${index}`,
      restaurantId: row.restaurant,
      menu: row.name,
      price: row.price,
      tags: tags[row.name] ?? [],
      mapUrl: routeUrl(restaurant.get(row.restaurant)!.mapTarget)
    }];
  });
  const cap = budgetOf(q);
  const eligible = [...daily, ...fixed].filter(row => row.price <= cap && !exclude.includes(row.id));
  const selectedTags = Object.entries(tagWords).filter(([, words]) => words.test(q)).map(([tag]) => tag);
  const score = (row: Candidate) => selectedTags.reduce((sum, tag) => {
    const match = row.tags.includes(tag) ? 4 : tagWords[tag].test(row.items?.join(' ') ?? row.menu) ? 1 : 0;
    return sum + match;
  }, 0) + (q.includes(restaurant.get(row.restaurantId)!.name) ? 6 : 0);
  // Keep each dining hall represented even when a preference is absent from its menu.
  const sorted = eligible.toSorted((a, b) => score(b) - score(a) || a.price - b.price);
  const firstByRestaurant = [...restaurant.keys()].flatMap(id => {
    const best = sorted.find(row => row.restaurantId === id);
    return best ? [best] : [];
  });
  const cheapest = eligible.toSorted((a, b) => a.price - b.price)[0];
  return cheapest ? [...new Set([...firstByRestaurant, cheapest, ...sorted])].slice(0, LIMIT) : [];
}

export function buildRecommendation(row: Candidate, fallback: boolean, tag?: unknown): Recommendation {
  let reason = `${priceLabel(row.price)}에 먹을 수 있는 메뉴예요.`;
  if (fallback) reason = `가격 조건에 맞는 메뉴 중 ${priceLabel(row.price)}으로 가장 저렴해요.`;
  else if (typeof tag === 'string' && row.tags.includes(tag)) {
    reason = `‘${tag}’ 태그가 붙은 ${priceLabel(row.price)} 메뉴예요.`;
  }
  return {
    choiceId: row.id, restaurantId: row.restaurantId, menu: row.menu, price: row.price,
    reason, mapUrl: row.mapUrl, fallback
  };
}

export function fallbackRecommendation(candidates: Candidate[]) {
  const cheapest = candidates.toSorted((a, b) => a.price - b.price)[0];
  return cheapest ? buildRecommendation(cheapest, true) : null;
}

export function matchModelChoice(choice: unknown, candidates: Candidate[]) {
  if (!choice || typeof choice !== 'object' || !('id' in choice)) return null;
  const row = candidates.find(candidate => candidate.id === choice.id);
  return row ? buildRecommendation(row, false, 'tag' in choice ? choice.tag : undefined) : null;
}

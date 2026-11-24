import current from '../data/menu/current.json';

export type RestaurantId = 'gyejeol' | 'sandeul' | 'jingwan';
export interface Restaurant {
  id: RestaurantId;
  name: string;
  place: string;
  mapTarget: 'gunja' | 'student' | 'jingwan';
  walkMin: number;
  lastLeg: string;
  color: string;
  corners: string[];
}

export interface MenuSnapshot {
  updatedAt: string;
  snapshotDate: string;
  source: string;
  restaurants: Restaurant[];
  daily: { restaurant: 'gyejeol'; date: string; meal: '중식' | '석식'; items: string[]; price: number }[];
  fixed: { restaurant: 'sandeul' | 'jingwan'; corner: string | null; name: string; price: number }[];
}

export const snapshot = current as MenuSnapshot;
export const priceLabel = (price: number) => `${price.toLocaleString('ko-KR')}원`;
export const routeUrl = (to: string, from = 'foyer') => `/map/?from=${from}&to=${to}&mode=auto`;

const seoulDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
});

export function kstDate(now = new Date()) {
  return seoulDate.format(now);
}

export function weekend(date: string) {
  return [0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay());
}

export function displayDate(date: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'long'
  }).format(new Date(`${date}T00:00:00+09:00`));
}

export const formatTime = (timestamp: string) => new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', hour: 'numeric', minute: '2-digit', hour12: false
}).format(new Date(timestamp));

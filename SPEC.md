# 디자인·구현 명세 (PRD 부록)

PRD v1.1의 8장(디자인)과 9장(구현)을 자세히 적은 문서다. PRD 2쪽 제한 때문에 따로 둔다.

## 1. 화면 구성

| 경로 | 화면 | 구성 요소(위 → 아래) |
| --- | --- | --- |
| `/` | 홈(오늘의 메뉴) | 날짜·요일 헤더 → 입실 길안내 배너("5번 출구 → 김원관 6층") → AI 추천 입력창 + 예시 칩 → 식당 카드 3장 → 원문 링크·"메뉴는 변동될 수 있음" |
| `/` (추천 후) | 추천 결과 | 입력창 아래 결과 카드: 식당명, 메뉴, 가격, 이유 1문장, [길안내] [다른 추천] |
| `/posts/YYYY-MM-DD/` | 날짜별 메뉴 글 | 자동 생성된 글 본문 + 식당 카드(그날 데이터) + 이전·다음 날 이동 |
| `/map/?from=&to=&mode=` | 3D 길안내 | 기존 3D 맵 + 좌상단 "← 오늘 메뉴" 버튼 |

### 식당 카드

| 식당 | 카드 내용 | 길안내 링크 |
| --- | --- | --- |
| 계절밥상(군자관 6층) | 중식·석식 탭, 반찬 목록(" · " 분리), 7,000원, "군자관 엘리베이터로 6층" | `/map/?from=foyer&to=gunja&mode=auto` |
| 산들푸드(학생회관 B1) | 나루또·아지오·김밥천국 코너 탭, 메뉴·가격 목록(가격순), "파리바게뜨 건물 지하 1층" | `/map/?from=foyer&to=student&mode=auto` |
| 진관키친(진관홀 B1) | 가격대 요약 + 메뉴 목록(가격순) | `/map/?from=foyer&to=jingwan&mode=auto` |

상시 메뉴(산들푸드·진관키친)는 목록이 길다(22–50건). 카드에는 5개만 보여 주고 [전체 보기]로 펼친다.

### 상태별 화면

| 상태 | 처리 |
| --- | --- |
| 추천 생성 중 | 결과 카드 자리에 스켈레톤, 입력창 비활성 |
| 추천 실패·시간 초과(8초) | 규칙 기반 폴백 결과(가격 조건만 적용) + "AI 추천을 불러오지 못했어요" 표시 |
| 주말·휴무(계절밥상 데이터 없음) | 계절밥상 카드에 "오늘은 운영하지 않아요", 추천 후보에서 제외 |
| 수집 실패(오늘 데이터 없음) | 마지막 정상 데이터 + 기준 날짜 표시 + 원문 링크 강조 |
| 3D 미지원·로딩 실패 | 맵 자체 오류 문구 + 블로그로 돌아가기 |

## 2. 디자인 기준

- **레이아웃:** 모바일 우선, 본문 폭 최대 640px, 카드 1열(데스크톱도 1열 유지)
- **색:** 바탕·헤더 남색, 강조(버튼·현재 탭) 주황. 멀티캠퍼스 안내문 색을 따른다. 정확한 값은 안내문에서 추출해 CSS 변수(`--navy`, `--accent`)로 둔다
- **식당 색:** 3D 맵 데이터에 정의된 색을 그대로 쓴다. 계절밥상 `#f1a84e`, 산들푸드 `#58c4ad`, 진관키친 `#9ca9f7`. 카드 좌측 띠와 맵 목적지 표시가 같은 색이 된다
- **글꼴:** 3D 맵과 같은 시스템 글꼴 스택(`-apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`), 본문 15px
- **터치:** 버튼·탭 높이 44px 이상, [길안내]는 카드 오른쪽 아래 고정 위치
- **접근성:** 본문 대비 4.5:1 이상, 아이콘 단독 버튼 금지, 추천 결과 영역 `aria-live="polite"`

## 3. 기술 스택

| 영역 | 선택 | 이유 |
| --- | --- | --- |
| 블로그 | Astro(정적 출력), 추천 위젯만 클라이언트 스크립트 | 마크다운 글 목록 기본 제공, 정적 파일로 배포 |
| 서버 | Cloudflare Worker(TypeScript) + Static Assets | 정적 파일과 `/api/chat`을 한 프로젝트로 배포, API 키 보관 |
| 수집·생성 | Python 3 스크립트 + GitHub Actions | 매일 결과가 커밋으로 남음(제출 요건) |
| AI | 경량 LLM 1종, JSON 출력 강제 | 태깅·추천 모두 짧은 입출력. 모델명은 decision-log에 기록 |
| 테스트 | pytest, Vitest, Playwright | 스크립트·Worker·화면 스크린샷 |
| 측정 | GA4 | KR 측정 |

## 4. 데이터 파이프라인

```
GitHub Actions (평일 06:30 KST, cron '30 21 * * 0-4' + 수동 실행)
 1. fetch_menu.py   식당 API 호출 → data/raw/YYYY-MM-DD.json 저장
 2. normalize.py    data/menu/current.json 생성 + 스키마 검증
 3. tag_menu.py     태그 없는 메뉴명만 LLM 태깅 → data/tags.json 캐시
 4. make_post.py    오늘 글 site/src/content/posts/YYYY-MM-DD.md 생성
 5. pytest          실패 시 커밋하지 않음
 6. 변경 있으면 커밋·푸시 → Cloudflare 자동 빌드·배포
 실패 시: GitHub Issue 자동 생성, docs/run-log.md에 한 줄 기록
```

- **수집 대상:** `https://www.sejong.ac.kr/kor/unilife/cafeteria-info.do?mode=getMenuList&placeId={1,3,4,5,6}`. 하루 1회만 호출하고 독자 요청은 학교 서버로 보내지 않는다.
- **태깅 비용 절감:** 상시 메뉴 약 130개는 첫 실행에 한 번만 태깅하고, 이후에는 새 메뉴명만 LLM에 보낸다.
- **태그 목록(고정):** `국물`, `매운맛`, `고기`, `해산물`, `면`, `밥`, `튀김`, `채식가능`. 목록 밖의 태그는 버린다.

### current.json 스키마

```json
{
  "updatedAt": "2026-11-24T21:30:00Z",
  "source": "https://www.sejong.ac.kr/kor/unilife/cafeteria-info.do",
  "restaurants": [
    { "id": "gyejeol", "name": "계절밥상", "place": "군자관 6층", "mapTarget": "gunja",
      "walkMin": 5, "lastLeg": "군자관 엘리베이터로 6층" },
    { "id": "sandeul", "name": "산들푸드", "place": "학생회관 B1", "mapTarget": "student",
      "walkMin": 5, "lastLeg": "파리바게뜨 건물 지하 1층" },
    { "id": "jingwan", "name": "진관키친", "place": "진관홀 B1", "mapTarget": "jingwan",
      "walkMin": 6, "lastLeg": "건물 안에서 지하 1층" }
  ],
  "daily": [
    { "restaurant": "gyejeol", "date": "2026-11-25", "meal": "중식",
      "items": ["…", "…"], "price": 7000 }
  ],
  "fixed": [
    { "restaurant": "sandeul", "corner": "나루또", "name": "등심돈까스", "price": 5000 },
    { "restaurant": "jingwan", "corner": null, "name": "라면", "price": 3300 }
  ]
}
```

검증 규칙: `price`는 양의 정수, `daily.date`는 ISO 날짜이고 API 원본의 `day`(요일)와 일치, `fixed`는 식당별 1건 이상. 하나라도 어기면 저장하지 않는다.

## 5. AI 메뉴 추천 API

`POST /api/chat` (Worker)

| 항목 | 내용 |
| --- | --- |
| 요청 | `{ "q": "7천 원 이하, 국물 있는 거" }` (1–200자) |
| 응답 | `{ "restaurantId": "gyejeol", "menu": "김치콩나물국 정식", "price": 7000, "reason": "…", "mapUrl": "/map/?from=foyer&to=gunja&mode=auto", "fallback": false }` |
| 처리 | ① `current.json`에서 오늘 후보 추출 → ② 질문 속 가격 상한을 규칙으로 먼저 걸러 후보를 40개 이하로 축소 → ③ 후보 목록 + 질문을 LLM에 보내 JSON 하나를 받음 → ④ `menu`가 후보에 있는지, `restaurantId`가 3개 중 하나인지 검증 |
| 실패 처리 | 검증 실패·8초 초과·LLM 오류 → 규칙 기반 폴백(조건에 맞는 최저가 메뉴), `fallback: true` |
| 제한 | IP당 하루 20회(KV 카운터), 초과 시 429 |
| 비밀값 | LLM API 키는 `wrangler secret`으로만 등록 |

시스템 프롬프트 요지: "너는 세종대 근처 식당 메뉴 추천기다. 아래 후보 목록에 있는 메뉴만 고른다. 목록에 없으면 restaurantId를 null로 답한다. 이유는 한 문장, 가격과 태그를 근거로 쓴다."

## 6. 3D 맵 연결

- 첨부된 3D 맵(index.html 0.8 MB, campus.glb 19.8 MB, visitor.glb 0.5 MB)을 `site/public/map/`에 그대로 둔다. 모든 파일이 Cloudflare 파일당 한도(25 MiB) 안이다.
- 맵 `index.html` 끝에 딥링크 스크립트를 추가한다. 맵이 로딩을 마치면 남기는 `body.dataset.ready === "true"`를 기다렸다가 출발 버튼(`[data-start]`), 목적지 선택(`#dest`), 안내 버튼(`#guide`)을 차례로 실행한다.
- 파라미터: `from` = `exit`·`lift1`·`foyer`, `to` = `pc`·`booths`·`lounge`·`gunja`·`student`·`jingwan`·`exit`, `mode=auto`면 자동 보행. 목록 밖의 값은 무시한다.
- 같은 스크립트에서 "← 오늘 메뉴" 버튼을 띄우고 GA4 `route_start`를 보낸다.

## 7. 저장소 구조

```text
repo/
├─ PRD.md  TEST_REPORT.md  AGENTS.md
├─ docs/SPEC.md  docs/decision-log.md  docs/run-log.md
├─ data/raw/  data/menu/current.json  data/tags.json
├─ scripts/fetch_menu.py  normalize.py  tag_menu.py  make_post.py
├─ site/                      # Astro
│  ├─ src/pages/index.astro
│  ├─ src/content/posts/*.md
│  └─ public/map/             # 3D 맵 + 딥링크 스크립트
├─ worker/index.ts            # /api/chat
├─ tests/                     # pytest, Vitest, Playwright
├─ wrangler.jsonc             # assets: site/dist, main: worker/index.ts
└─ .github/workflows/daily.yml
```

## 8. 측정 이벤트(GA4)

| 이벤트 | 시점 | 연결 지표 |
| --- | --- | --- |
| `view_today` | 홈 진입 | KR1 방문 |
| `recommend_submit` / `recommend_result` | 추천 요청·응답(`fallback` 포함) | 추천 사용률, 폴백 비율 |
| `route_click` | [길안내] 클릭(식당 ID 포함) | 추천 → 길안내 전환율 |
| `route_start` | 맵 딥링크 진입 | KR2 길안내 실행 |
| `helpful_click` | "도움됐어요" | H1 |

# 블로그 구성

| 구성 | 역할 |
| --- | --- |
| `scripts/make_post.py` | 학교 API의 다섯 응답을 수집한다. 날짜·요일·가격 검증이 완료되면 원본, 식단 스냅숏, 마크다운을 저장한다. |
| `site/` | Astro가 홈, 날짜별 글, GA4 설정 파일을 미리 빌드한다. 사이트는 방문 시 서울 날짜를 비교해 현재 식단 또는 마지막 수집분을 표시한다. |
| `worker/` | `POST /api/chat`에서 일일 한도와 메뉴 후보를 적용해 Claude에 추천을 요청한다. 예약 실행에서는 Claude에 새 메뉴 태깅을 요청한다. 정적 페이지는 Cloudflare Static Assets에서 제공한다. |
| `site/public/map/` | 첨부 ZIP의 Three.js 뷰어와 두 모델을 제공한다. 모델을 읽을 수 없거나 독자가 2D를 고르면 같은 경로 데이터로 동선을 그린다. |

## 데이터 계약

`data/menu/current.json`은 최신 정상 수집 기록이다. 날짜별 스냅숏에는 별도로 보관한 당시 상시 메뉴와 일일 메뉴가 들어간다. `snapshotDate`는 서울 기준 수집 날짜이며 `updatedAt`은 UTC 수집 시각이다. 학교 응답이 검증에 실패하면 운영 브랜치에 식단을 커밋하지 않는다.

Claude 키는 Worker 런타임의 `ANTHROPIC_API_KEY` Secret에서 읽는다. 새 메뉴명만 Claude에 보내고 태그는 Durable Object에서 재사용한다. 태깅에 실패하면 기존 태그와 식단은 계속 제공하며 다음 예약 실행에서 빠진 메뉴를 다시 처리한다.

`POST /api/chat`은 `q`(1~200자), 선택 항목인 `exclude`(이미 본 추천 ID)를 받는다. 성공 응답은 `choiceId`, `restaurantId`, `menu`, `price`, `reason`, `mapUrl`, `fallback`을 포함한다. 입력 형식 오류는 400, 유효 후보 없음은 404, 일일 한도는 429로 응답한다. 한도는 서울 자정에 초기화된다.

`/map/`은 `from`과 `to`를 검증한 뒤 초기화 완료 시 기존 뷰어의 시작 위치와 목적지에 전달한다. `mode=auto`는 캐릭터 자동 보행을 시작하고 `view=2d`는 경로 요약 그림과 층별 안내를 연다.

요구사항과 화면 기준은 저장소 루트의 [PRD](../PRD.md), [SPEC](../SPEC.md)에 있다.

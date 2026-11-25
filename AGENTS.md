# 세종 캠퍼스 가이드 개발 지침

## 저장소 구조

- `site/`는 Astro 정적 사이트다. `site/src/pages/`에서 홈과 날짜별 식단 경로를, `site/src/scripts/`에서 추천과 메뉴 상호작용을 관리한다. `site/public/map/`에는 3D 뷰어, 모델과 2D 길안내가 있다.
- `worker/`는 Cloudflare Worker의 `/api/chat`, 추천 한도, Claude 연동과 예약 태깅을 담당한다. `shared/`의 식단 타입, 서울 날짜, 추천 후보 로직은 사이트와 Worker가 함께 사용한다.
- `scripts/`는 학교 응답을 수집·검증하고 `data/raw/`, `data/menu/`, `site/src/content/posts/`에 게시 파일을 생성한다. 자동 게시 설정은 `.github/workflows/daily.yml`, Worker 빌드·바인딩·예약 설정은 `wrangler.jsonc`에 있다.
- 루트 `index.html`과 `_config.yml`은 별도 GitHub Pages 사이트에 쓰인다. 캠퍼스 가이드 화면은 `site/`에서 수정한다.
- 설정과 배포는 [README.md](README.md), 요구사항과 화면 기준은 [PRD.md](PRD.md)와 [SPEC.md](SPEC.md), 데이터 계약은 [docs/architecture.md](docs/architecture.md)를 참고한다.

## 로컬 실행

저장소 루트에서 Node.js 22.20 이상과 Python 3.13을 사용한다.

```sh
npm ci
python -m pip install -r requirements-dev.txt
npm run dev
```

- `npm run dev`는 Astro를 빌드한 뒤 로컬 Worker를 `http://127.0.0.1:8787/`에서 실행한다. 홈, `/api/chat`, 길안내를 함께 확인할 때 사용한다.
- `npm run dev:site`는 Astro 화면과 스타일을 빠르게 수정할 때 사용한다. Worker API 동작은 `npm run dev` 또는 Playwright에서 확인한다.

## 변경 시 지킬 계약

- 식단 기준일과 추천 일일 한도는 `Asia/Seoul` 기준이다. `snapshotDate`에는 서울 날짜, `updatedAt`에는 UTC 수집 시각을 사용한다.
- 게시 파일은 `scripts/make_post.py`를 통해 함께 생성한다. 날짜별 식단 JSON과 마크다운 글의 날짜를 맞추고, 데이터 검증 실패 시 마지막 정상 게시분을 보존한다. 파이프라인 변경은 우선 `tests/python/`의 저장 응답과 임시 출력 경로에서 확인한다. `python scripts/make_post.py`는 학교 API를 호출하고 작업 트리의 게시 파일을 갱신한다.
- 추천은 당일 식단 후보로 제한한다. 모델의 선택 ID를 후보와 대조하고 메뉴명, 가격과 길안내 링크는 해당 후보에서 가져온다. Claude 호출 실패 시 가격 기준 결과로 복구하며, 지난 식단이나 주말에는 추천 후보를 만들지 않는다.
- Claude 키는 운영 Worker Secret 또는 로컬 `.dev.vars`에 둔다. 키를 소스, 브라우저 산출물이나 로그에 기록하지 않는다. GA4 이벤트에는 추천 입력 문장과 요청자 IP를 포함하지 않는다.
- 홈과 2D 지도에서는 3D 모델 요청을 발생시키지 않는다. `/map/`의 `from`, `to`, `mode`, `view=2d` 딥링크와 3D 실패 시 2D 대체 경로를 함께 확인한다.

## 검증과 완료 기준

| 변경 범위 | 확인 명령 |
| --- | --- |
| Python 수집·정규화·게시 | `python -m pytest -q` |
| 공유 추천 로직, Claude 요청, 태그 캐시 | `npm test` |
| Worker·사이트 TypeScript와 바인딩 | `npm run check` |
| 정적 페이지·게시 글·빌드 설정 | `npm run build` |
| 홈·추천 API·지도 사용자 흐름 | `npm run test:e2e` |

- E2E는 `npx playwright install chromium`으로 브라우저를 준비한다. 테스트가 포트 `8787`에서 자체 Worker를 시작하므로 기존 로컬 개발 서버를 종료한 상태에서 실행한다. 설치된 Chrome과 하드웨어 WebGL로 검증하려면 `TEST_BROWSER_CHANNEL=chrome`, `TEST_BROWSER_GPU=1`을 설정한다. 캡처는 `test-results/screenshots/`에 생성된다. [검증 기록과 PowerShell 예시](TEST_REPORT.md)
- 변경 범위에 해당하는 검사를 실행하고 통과 여부와 미검증 범위를 알린다. `site/dist/`, `worker-configuration.d.ts`, `.local/`, `test-results/`의 생성 파일은 Git에 추가하지 않는다.

## 운영 범위

평일 GitHub Actions 식단 수집·게시는 06:30 KST, Worker 태깅 예약은 07:10 및 11:10 KST로 구성되어 있다. 자동 게시와 태그 갱신의 실제 성공 여부는 운영 실행 기록에서 확인한다. `npm run deploy`와 워크플로 수동 실행, Secret 변경은 해당 운영 작업이 요청 범위에 있을 때 사용한다.

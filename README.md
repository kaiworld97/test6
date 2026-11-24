# 세종 캠퍼스 가이드

어린이대공원역 5번 출구에서 김원관 6층까지 길을 찾고, 세종대학교 교내 식당 세 곳의 메뉴를 비교하는 블로그입니다.

## 로컬 실행

Node.js 22.20 이상과 Python 3.13을 사용합니다.

```sh
npm ci
npm run dev
```

`http://127.0.0.1:8787/`에서 홈, 날짜별 식단, 추천 API와 맵을 확인할 수 있습니다. `npm run dev:site`는 Astro 파일 변경을 바로 확인할 때 사용합니다.

초기 식단은 2026년 11월 24일에 학교가 제공한 API 응답으로 만들었습니다. 서울 날짜가 지나면 홈에서 마지막 수집 기준일과 원문 링크를 표시합니다. 실제 추천용 키를 등록하기 전에는 같은 날의 식단에서 가격 조건을 적용한 폴백을 확인할 수 있습니다.

## Cloudflare 배포와 Claude 연결

GitHub 연결 없이 작업 폴더에서 Worker를 배포할 수 있습니다. 아래 명령은 로그인한 Cloudflare 계정에 현재 식단과 블로그를 배포합니다.

```sh
python scripts/make_post.py
npm run deploy
```

직접 배포 방식에서는 식단을 갱신할 때 같은 명령을 다시 실행합니다. 평일 자동 수집과 게시를 켜려면 아래의 GitHub 연동을 사용합니다.

Cloudflare 대시보드에서 **Workers & Pages → sejong-campus-guide → Settings → Variables and Secrets**로 이동합니다. **Secret** 유형으로 이름은 `ANTHROPIC_API_KEY`, 값은 Claude Console에서 만든 API 키를 입력하고 **Deploy**를 누릅니다. **Settings → Builds**의 변수는 빌드 과정에만 제공됩니다. CLI에서는 `npx wrangler secret put ANTHROPIC_API_KEY`를 실행한 뒤 표시되는 입력창에 키를 입력합니다. [Cloudflare Worker Secret](https://developers.cloudflare.com/workers/configuration/secrets/)

Claude Console의 워크스페이스에 범위가 지정된 API 키를 사용하면 Secret 하나면 됩니다. 워크스페이스에 범위가 지정되지 않은 키라면 `wrangler.jsonc`의 `CLAUDE_WORKSPACE_ID`에 사용할 워크스페이스 ID를 지정합니다. 추천과 메뉴 태깅의 기본 모델은 `claude-haiku-5-5`입니다. 로컬에서 실제 호출이 필요할 때만 저장소의 Git 제외 대상인 `.dev.vars`에 `ANTHROPIC_API_KEY`를 설정합니다. [Claude API 인증](https://platform.claude.com/docs/en/manage-claude/authentication)

브라우저는 `POST /api/chat`으로 조건을 보내며, Claude로의 요청과 Secret 접근은 Worker에서 처리합니다. 실제 키는 Cloudflare의 Worker Secret이나 로컬 `.dev.vars`에서만 관리합니다.

### 자동 수집과 측정

- GitHub를 연결하는 경우 Actions가 한국시간 평일 06:30에 식단을 수집해 기본 브랜치에 게시합니다. Workers Builds의 루트는 저장소 최상위이며 빌드 명령은 `npm run build`, 배포 명령은 `npx wrangler deploy`입니다. GitHub Actions는 Claude 인증 없이 수집과 게시를 수행합니다. [Workers Builds GitHub 연동](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/)
- Cloudflare Worker가 한국시간 평일 07:10과 11:10에 그날 배포된 메뉴의 새 항목에 태그를 붙입니다. 추천에는 완료된 태그 캐시를 사용합니다.
- GA4를 연결할 때 빌드 변수에 `PUBLIC_GA4_ID`를 지정합니다. 추천 입력 문장과 요청자 IP는 GA4 이벤트에 포함하지 않습니다.

## 확인

```sh
python -m pip install -r requirements-dev.txt
python -m pytest -q
npm run check
npm test
npx playwright install chromium
npm run test:e2e
```

[설계](docs/architecture.md) · [기술 결정](docs/decision-log.md) · [검증 기록](TEST_REPORT.md) · [운영 확인 항목](docs/todo.md)

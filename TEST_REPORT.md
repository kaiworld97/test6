# 검증 기록

2026년 11월 24일 · Windows, Node.js 22.20, Python 3.13, Chrome, Wrangler 로컬 런타임

| 범위 | 확인 내용 |
| --- | --- |
| 학교 API | 식당 ID 1·3·4·5·6에서 JSON을 받았다. 초기 스냅숏에 일일 식단 12건과 상시 메뉴 144건을 저장했다. [세종대학교 식당안내](https://www.sejong.ac.kr/kor/unilife/cafeteria-info.do) |
| pytest | 7개 통과. 날짜·요일·가격 등 원본 검증과 실패 시 기존 게시 파일 보존을 확인했다. |
| Vitest | 18개 통과. 한국어 예산 표현, 서울 자정, 후보 검증, Claude 요청 형식과 인증 헤더, 키 누락·호출 실패 시 폴백, 태그 캐시를 확인했다. Claude 응답은 테스트용으로 대체했다. |
| 빌드·타입 | Astro 정적 빌드, Worker·사이트 TypeScript 검사, Wrangler 배포 사전 검사를 통과했다. |
| 비밀값 | 빌드 환경에 테스트용 Claude 키를 설정하고 생성된 브라우저용 HTML·JS에서 값, 키 변수명, Claude API 주소가 포함되지 않았음을 확인했다. 로컬 `.dev.vars`·`.env` 계열은 Git 제외 대상이다. |
| 모델 파일 | ZIP에 포함된 `campus.glb`·`visitor.glb`와 배포 입력 파일의 SHA-256이 일치한다. |

## 브라우저 흐름

Playwright 8개가 통과했다. 모바일 홈, 키보드 탭, 전체 메뉴 펼치기, 날짜별 기록, 추천 결과에서 길안내 이동, 추천 실패 폴백, 오래된 식단 표시를 확인했다. 3D 자동 보행에서는 실제 캐릭터 좌표가 움직였다. 2D로 직접 열 때와 홈에서는 3D 모델 요청이 없었으며, 3D 모델 요청 실패 시 2D 길안내가 표시됐다. 로컬 Worker에서 같은 IP의 동시 요청 21개 중 20개를 허용하고 한 개에 429를 응답했다.

로컬 Worker와 Chrome에서 지연 150ms, 다운로드 1.6Mbps, CPU 4배 감속으로 설정했을 때 첫 화면 LCP는 748ms였다. 화면 캡처는 로컬 `test-results/screenshots/`에 저장했다.

## 운영 검증 범위

실제 Claude 호출과 예약 태깅, GA4 수신, GitHub Actions의 평일 실행과 Cloudflare 운영 배포는 운영 환경에서 확인할 항목이다. 계정별 설정은 [README](README.md)에 정리했다.

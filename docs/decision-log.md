# 기술 결정

## 2026-11-24

- 추천과 태깅의 기본 모델은 `claude-haiku-5-5`다. 추천 모델은 후보 ID와 근거 태그를 고른다. Worker가 후보에서 메뉴명, 가격, 안내 링크를 꺼내고 기존 태그로 설명을 구성한다. [Claude Haiku 5.5](https://platform.claude.com/docs/en/models/haiku-5-5/overview)
- Claude 인증이 필요한 작업은 Cloudflare Worker 런타임에 둔다. GitHub Actions는 인증 키 없이 학교에서 공개한 식단을 수집하고, Worker는 예약 실행으로 신규 메뉴 태그를 보관한다. [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- IP당 20회는 IP 해시로 분리한 SQLite 기반 Durable Object의 KV 트랜잭션으로 집계한다. 동시 요청도 한도에 포함된다. [Durable Objects 저장소 문서](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)
- 학교 API에 표시된 단품 추가 옵션은 메뉴 카드에 유지한다. 별도 식사로 주문할 수 없는 추가 옵션을 추천 후보에서 제외한다.
- 첨부 자료에 안내문 PDF가 없어 남색 `#101b2e`와 주황 `#ffb86c`를 적용했다. 식당별 색과 경로 좌표는 첨부 3D 맵의 값을 사용했다.

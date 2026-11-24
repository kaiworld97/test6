import argparse
from datetime import date, datetime, timezone
from html import escape
import json
import os
from pathlib import Path
from tempfile import NamedTemporaryFile

from fetch_menu import KST, ROOT, capture_from_files, capture_from_school
from normalize import normalize


def post_content(menu):
    day = menu["snapshotDate"]
    meals = [meal for meal in menu["daily"] if meal["date"] == day]
    summary = "\n".join(
        f"- **{meal['meal']}** · {escape(' · '.join(meal['items']), quote=False)} · {meal['price']:,}원"
        for meal in meals
    ) or "이 날짜에 계절밥상 식단이 게시되지 않았습니다."
    return (
        f'---\ntitle: "{day} 캠퍼스 식단"\ndate: "{day}"\n---\n\n'
        f"### 계절밥상 일일 식단\n\n{summary}\n\n"
        "산들푸드와 진관키친의 상시 메뉴는 아래 식당 카드에서 확인할 수 있습니다.\n"
    )


def write_atomic(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(mode="w", encoding="utf-8", newline="\n",
                            dir=path.parent, delete=False) as temp:
        temp.write(content)
    try:
        os.replace(temp.name, path)
    finally:
        Path(temp.name).unlink(missing_ok=True)


def as_json(value):
    return json.dumps(value, ensure_ascii=False, indent=2) + "\n"


def publish(capture, day, retrieved_at, *, root=ROOT):
    menu = normalize(capture, day, retrieved_at)
    current = root / "data/menu/current.json"
    if current.exists():
        previous = json.loads(current.read_text(encoding="utf-8"))
        if previous["snapshotDate"] > menu["snapshotDate"]:
            raise ValueError("이미 게시한 식단보다 과거 날짜로 현재 식단을 갱신할 수 없습니다")
        if previous == {**menu, "updatedAt": previous["updatedAt"]}:
            menu["updatedAt"] = previous["updatedAt"]
    post = post_content(menu)
    write_atomic(root / f"data/raw/{day}.json", as_json(capture))
    write_atomic(root / f"data/menu/{day}.json", as_json(menu))
    write_atomic(root / f"site/src/content/posts/{day}.md", post)
    write_atomic(current, as_json(menu))
    return menu


def main():
    parser = argparse.ArgumentParser(description="세종대 식단 수집·검증·게시")
    parser.add_argument("--from-capture", type=Path, help="검증용 placeId별 JSON 디렉터리")
    parser.add_argument("--date", type=date.fromisoformat, help="저장한 응답의 서울 기준 날짜")
    parser.add_argument("--captured-at", type=datetime.fromisoformat, help="저장한 응답의 수집 시각")
    args = parser.parse_args()
    if not args.from_capture and (args.date or args.captured_at):
        parser.error("저장한 응답에만 날짜와 수집 시각을 적용할 수 있습니다")
    retrieved_at = args.captured_at or datetime.now(timezone.utc)
    if retrieved_at.tzinfo is None:
        parser.error("수집 시각에는 시간대를 지정하세요")
    kst_day = retrieved_at.astimezone(KST).date()
    day = args.date or kst_day
    if day != kst_day:
        parser.error("수집 시각과 게시 날짜는 서울 기준으로 일치해야 합니다")
    capture = capture_from_files(args.from_capture) if args.from_capture else capture_from_school()
    menu = publish(capture, day, retrieved_at.astimezone(timezone.utc))
    print(f"{day} 게시 완료 | 일일 {len(menu['daily'])}건 · 상시 {len(menu['fixed'])}건")


if __name__ == "__main__":
    main()

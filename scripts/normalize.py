from datetime import date
import json
import re

from fetch_menu import KST, PLACE_IDS, ROOT, SOURCE

WEEK = "월화수목금토일"
FIXED_PLACES = {3: ("jingwan", None), 4: ("sandeul", "나루또"),
                5: ("sandeul", "아지오"), 6: ("sandeul", "김밥천국")}


def menu_rows(payload, place_id):
    if not isinstance(payload, dict) or not isinstance(payload.get("items"), list):
        raise ValueError(f"메뉴 목록 형식 오류 (placeId={place_id})")
    for row in payload["items"]:
        if not isinstance(row, dict) or row.get("placeId") != place_id:
            raise ValueError(f"식당 ID 형식 오류 (placeId={place_id})")
        if type(row.get("price")) is not int or row["price"] <= 0:
            raise ValueError(f"메뉴 가격 오류 (placeId={place_id})")
        if not isinstance(row.get("menuName"), str) or not row["menuName"].strip():
            raise ValueError(f"메뉴명 오류 (placeId={place_id})")
        yield row


def normalize(capture, snapshot_date, fetched_at):
    if set(capture) != set(PLACE_IDS):
        raise ValueError("식당 응답이 누락되었습니다")
    restaurants = json.loads((ROOT / "data/restaurants.json").read_text(encoding="utf-8"))
    daily, fixed = [], []
    seen_meals, seen_items = set(), set()

    for row in menu_rows(capture[1], 1):
        raw_date = row.get("menuDate")
        if not isinstance(raw_date, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw_date):
            raise ValueError("계절밥상 날짜 형식 오류")
        day = date.fromisoformat(raw_date)
        if row.get("day") != WEEK[day.weekday()]:
            raise ValueError(f"계절밥상 날짜 및 요일 불일치 ({day})")
        meal = row.get("mealName")
        if meal not in ("중식", "석식") or (raw_date, meal) in seen_meals:
            raise ValueError(f"계절밥상 식사 구분 오류 ({day})")
        seen_meals.add((raw_date, meal))
        items = [item.strip() for item in row["menuName"].split("·") if item.strip()]
        if not items:
            raise ValueError(f"계절밥상 반찬 목록 오류 ({day})")
        daily.append({"restaurant": "gyejeol", "date": raw_date, "meal": meal,
                      "items": items, "price": row["price"]})

    if (snapshot_date.weekday() < 5 and daily
            and max(row["date"] for row in daily) < snapshot_date.isoformat()):
        raise ValueError(f"계절밥상 일정이 갱신되지 않았습니다 ({snapshot_date})")

    for place_id, (restaurant, corner) in FIXED_PLACES.items():
        rows = list(menu_rows(capture[place_id], place_id))
        if not rows:
            raise ValueError(f"상시 메뉴가 비어 있습니다 (placeId={place_id})")
        for row in rows:
            if row.get("menuDate") is not None or row.get("day") is not None:
                raise ValueError(f"상시 메뉴 날짜 형식 오류 (placeId={place_id})")
            name = row["menuName"].strip()
            entry = (restaurant, corner, name, row["price"])
            if entry not in seen_items:
                seen_items.add(entry)
                fixed.append(dict(zip(("restaurant", "corner", "name", "price"), entry, strict=True)))

    return {
        "updatedAt": fetched_at.isoformat(timespec="seconds").replace("+00:00", "Z"),
        "snapshotDate": snapshot_date.isoformat(),
        "source": SOURCE,
        "restaurants": restaurants,
        "daily": sorted(daily, key=lambda row: (row["date"], row["meal"] == "석식")),
        "fixed": sorted(fixed, key=lambda row: (row["restaurant"], row["corner"] or "",
                                               row["price"], row["name"])),
    }

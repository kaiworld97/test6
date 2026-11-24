from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
KST = timezone(timedelta(hours=9))
SOURCE = "https://www.sejong.ac.kr/kor/unilife/cafeteria-info.do"
PLACE_IDS = (1, 3, 4, 5, 6)


def fetch_place(place_id):
    query = urlencode({"mode": "getMenuList", "placeId": place_id})
    request = Request(f"{SOURCE}?{query}", headers={"Accept": "application/json"})
    try:
        with urlopen(request, timeout=15) as response:
            body = response.read(1_000_001)
        if len(body) > 1_000_000:
            raise ValueError("응답 크기 초과")
        return json.loads(body)
    except (OSError, ValueError) as error:
        raise ValueError(f"식당 API 응답 오류 (placeId={place_id})") from error


def capture_from_school():
    with ThreadPoolExecutor(max_workers=5) as pool:
        return dict(zip(PLACE_IDS, pool.map(fetch_place, PLACE_IDS), strict=True))


def capture_from_files(directory):
    return {
        place_id: json.loads((directory / f"{place_id}.json").read_text(encoding="utf-8"))
        for place_id in PLACE_IDS
    }


if __name__ == "__main__":
    print(json.dumps(capture_from_school(), ensure_ascii=False, indent=2))

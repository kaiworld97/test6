from copy import deepcopy
from datetime import date, datetime, timezone
import json

import pytest

from fetch_menu import ROOT
from make_post import publish
from normalize import normalize

DAY = date(2026, 11, 24)
WHEN = datetime(2026, 11, 24, 6, 44, 43, tzinfo=timezone.utc)


@pytest.fixture()
def capture():
    raw = json.loads((ROOT / f"data/raw/{DAY}.json").read_text(encoding="utf-8"))
    return {int(place): data for place, data in raw.items()}


def test_normalizes_live_contract(capture):
    menu = normalize(capture, DAY, WHEN)
    assert menu["snapshotDate"] == DAY.isoformat()
    assert {row["meal"] for row in menu["daily"] if row["date"] == DAY.isoformat()} == {"중식", "석식"}
    assert {row["corner"] for row in menu["fixed"] if row["restaurant"] == "sandeul"} == {"나루또", "아지오", "김밥천국"}
    assert all(row["price"] > 0 for row in menu["fixed"])


@pytest.mark.parametrize("place, field, value", [(1, "day", "일"), (1, "menuDate", "2026-02-30"),
                                                (3, "price", "3300"), (6, "menuName", "")])
def test_rejects_malformed_row(capture, place, field, value):
    capture[place]["items"][0][field] = value
    with pytest.raises(ValueError):
        normalize(capture, DAY, WHEN)


def test_distinguishes_closed_from_stale(capture):
    weekday_later = date(2026, 11, 30)
    with pytest.raises(ValueError, match="갱신되지 않았습니다"):
        normalize(capture, weekday_later, WHEN)
    capture[1]["items"] = []
    assert not normalize(capture, DAY, WHEN)["daily"]


def test_publication_keeps_previous_files_on_failure(capture, tmp_path):
    publish(capture, DAY, WHEN, root=tmp_path)
    files = {path: path.read_bytes() for path in tmp_path.rglob("*") if path.is_file()}
    broken = deepcopy(capture)
    broken[5]["items"] = []
    with pytest.raises(ValueError):
        publish(broken, DAY, WHEN, root=tmp_path)
    assert files == {path: path.read_bytes() for path in tmp_path.rglob("*") if path.is_file()}
    assert (tmp_path / f"site/src/content/posts/{DAY}.md").is_file()

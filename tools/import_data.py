#!/usr/bin/env python3
"""카드 공방 내보내기 JSON → assets/dat/data/GameData.js
쓰는 법: python3 tools/import_data.py 내보낸파일.json [변환한파일.json]
비용은 costs 목록(비용의 경우들)으로 맞춘다. 옛 형식 cost {energy:1, mana:1}은 자원마다 한 경우로 쪼갠다 (기력 1짜리 · 마나 1짜리).
두 번째 인자를 주면 변환한 JSON도 따로 저장한다 (카드 공방 가져오기용).
새 카드·적 id가 생기면 알려 준다 (그 id의 동작은 data/CardImpl.js / data/EnemyImpl.js에 짜 넣어야 한다)."""
import json, re, sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
src = pathlib.Path(sys.argv[1])
d = json.load(open(src, encoding="utf-8"))
RES = ["energy", "mana", "hp", "gold"]
def fix_costs(x):
    if "costs" not in x: x["costs"] = [{k: x["cost"][k]} for k in RES if x.get("cost", {}).get(k)]
    x["costs"] = [{k: c[k] for k in RES if c.get(k)} for c in x["costs"]]
    x.pop("cost", None)
for c in d.get("cards", []):
    fix_costs(c)
    for u in c.get("upgrades", []): fix_costs(u)
if len(sys.argv) > 2: pathlib.Path(sys.argv[2]).write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
for k in ("cards", "materials", "enemies", "tags"):
    assert k in d, "없는 항목: " + k
head = "// 카드 공방에서 내보낸 데이터. 이 파일만 갈아 끼우면 카드·적·재료가 바뀐다.\n// 갈아 끼우는 법: python3 tools/import_data.py 내보낸파일.json\n"
(root / "assets/dat/data/GameData.js").write_text(head + "const GAME_DATA = " + json.dumps(d, ensure_ascii=False, indent=1) + ";\n", encoding="utf-8")
impl = (root / "assets/dat/data/CardImpl.js").read_text(encoding="utf-8") + (root / "assets/dat/data/EnemyImpl.js").read_text(encoding="utf-8")
def known(kind, i): return re.search(r'\b' + re.escape(i) + r'\b', impl) is not None
missing = [("카드", c["id"]) for c in d["cards"] if not known("card", c["id"])] + [("적", e["id"]) for e in d["enemies"] if not known("enemy", e["id"])]
print("카드 %d · 장비 %d · 재료 %d · 적 %d · 태그 %d" % (len(d["cards"]), len(d.get("equipment", [])), len(d["materials"]), len(d["enemies"]), len(d["tags"])))
if d.get("equipment"): print("장비는 아직 게임에 동작이 없다 (GameData.js에는 들어간다)")
if missing:
    print("동작이 아직 없는 것 (CardImpl.js / EnemyImpl.js에 추가 필요):")
    for k, i in missing: print("  -", k, i)
else:
    print("모든 카드·적의 동작이 이미 있다.")

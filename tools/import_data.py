#!/usr/bin/env python3
"""카드 공방 내보내기 JSON → assets/dat/data/GameData.js
쓰는 법: python3 tools/import_data.py 내보낸파일.json
새 카드·적 id가 생기면 알려 준다 (그 id의 동작은 data/CardImpl.js / data/EnemyImpl.js에 짜 넣어야 한다)."""
import json, re, sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
src = pathlib.Path(sys.argv[1])
d = json.load(open(src, encoding="utf-8"))
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

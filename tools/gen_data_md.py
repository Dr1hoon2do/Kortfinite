#!/usr/bin/env python3
"""assets/dat/data/GameData.js → DATA.md (데이터 표). 손으로 고치지 말고 이 스크립트로 다시 만든다.
쓰는 법: python3 tools/gen_data_md.py"""
import json, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
t = (root / "assets/dat/data/GameData.js").read_text(encoding="utf-8")
D = json.loads(t[t.index("{"):t.rindex("}") + 1])
COST = {"energy": "기력", "mana": "마나", "hp": "체력", "gold": "골드"}
KIND = {"basic": "기본(시작 덱)", "reward": "보상", "special": "특수"}
tag = {x["id"]: x["name"] for x in D["tags"]}
mat = {x["id"]: x["name"] for x in D["materials"]}
def cost(c): return " + ".join("%s %s" % (COST.get(k, k), v) for k, v in (c or {}).items() if v) or "없음"
def tags(l): return ", ".join(tag.get(i, i) for i in l or []) or "-"
def cell(s): return str(s or "").replace("|", "\\|").replace("\n", "<br>")
o = ["# Kortfinite 데이터 표", "",
     "`assets/dat/data/GameData.js`(카드 공방 내보내기)에서 뽑은 표다. 직접 고치지 말고 공방에서 고친 뒤 `tools/import_data.py`로 갈아 끼우고, 이 표는 `python3 tools/gen_data_md.py`로 다시 만든다.",
     "수치 규칙: 피해·방어도 %는 공격력·방어력 기준(능력치 비례 값은 내림, 최소 1), 이동속도 비례 값(칸·장수)은 반올림(최소 1).", ""]
o += ["## 1. 카드 (%d장)" % len(D["cards"]), "", "| id | 이름 | 분류 | 비용 | 효과 | 태그 | 강화 |", "|---|---|---|---|---|---|---|"]
for c in D["cards"]:
    o.append("| %s | %s | %s | %s | %s | %s | %s |" % (c["id"], c["name"], KIND.get(c.get("kind"), c.get("kind")), cost(c.get("cost")), cell(c.get("effect")), tags(c.get("tags")), ", ".join(u["key"] for u in c.get("upgrades", [])) or "-"))
o += ["", "### 강화(변형)", "", "| 카드 | 강화 | 이름 | 강화 전 | 비용 | 효과 | 재료 | 태그 |", "|---|---|---|---|---|---|---|---|"]
for c in D["cards"]:
    for u in c.get("upgrades", []):
        o.append("| %s | %s | %s | %s | %s | %s | %s | %s |" % (c["id"], u["key"], u["name"], u.get("from", "default"), cost(u.get("cost")), cell(u.get("effect")), ", ".join("%s×%s" % (mat.get(m["id"], m["id"]), m.get("count", 1)) for m in u.get("materials", [])) or "-", tags(u.get("tags"))))
o += ["", "## 2. 적 (%d종)" % len(D["enemies"]), "", "| id | 이름 | 층 | 체력 | 공격 | 방어 | 이동 | 드랍 | 패턴 |", "|---|---|---|---|---|---|---|---|---|"]
for e in D["enemies"]:
    o.append("| %s | %s | %s | %s | %s | %s | %s | %s | %s |" % (e["id"], e["name"], e.get("floors", ""), e.get("hp"), e.get("atk"), e.get("def"), e.get("speed"), ", ".join("%s×%s(%s%%)" % (mat.get(d["id"], d["id"]), d.get("count", 1), d.get("chance", 100)) for d in e.get("drops", [])) or "-", cell(e.get("pattern"))))
SLOT = {"hand": "손", "head": "머리", "body": "몸", "waist": "허리", "back": "등", "trinket": "장신구"}
RAR = {"common": "흔함", "uncommon": "드묾", "rare": "희귀", "boss": "우두머리"}
eq = D.get("equipment", [])
o += ["", "## 2-1. 장비 (%d개)" % len(eq), "", "소지품 패에서 장착해야 효과가 나는 유물형 장비 (공방 '장비' 탭). 게임 동작은 아직 없다.", "",
      "| id | 이름 | 부위 | 희귀도 | 값 | 효과 | 태그 |", "|---|---|---|---|---|---|---|"]
for e in eq: o.append("| %s | %s | %s | %s | %s | %s | %s |" % (e["id"], e["name"], SLOT.get(e.get("slot"), "-"), RAR.get(e.get("rarity"), "-"), e.get("price", "-"), cell(e.get("effect")), tags(e.get("tags"))))
o += ["", "## 3. 재료 (%d개)" % len(D["materials"]), "", "| id | 이름 | 얻는 곳 | 비고 |", "|---|---|---|---|"]
for m in D["materials"]: o.append("| %s | %s | %s | %s |" % (m["id"], m["name"], cell(m.get("source")), cell(m.get("note"))))
o += ["", "## 4. 태그 (%d개)" % len(D["tags"]), "", "| id | 이름 | 설명 | 소속 |", "|---|---|---|---|"]
for x in D["tags"]: o.append("| %s | %s | %s | %s |" % (x["id"], x["name"], cell(x.get("note")), tags([i for i in x.get("tags", []) if i != x["id"]])))
o += ["", "## 5. 상태 이상 (코드: `rules/Status.js`의 `Status.DEFS`)", "",
      "| id | 이름 | 종류 | 효과 |", "|---|---|---|---|",
      "| poison | 독 | 턴마다 피해 | 방어도로 못 막는다 |", "| burn | 화상 | 수치·턴 | 턴 시작시 수치만큼 피해 |",
      "| ice | 빙결 | 수치·턴 | 피해를 입을 때 수치만큼 추가 피해 |", "| lethargy | 무기력 | 수치·턴 | 턴 시작시 얻는 기력이 수치만큼 감소 (최대 9) |",
      "| harden | 경질화 | 버프 | 수치만큼 방어력 증가 |", "| slow | 둔화 | 수치·턴 | 이동속도가 수치(%)만큼 감소 |",
      "| str | 힘 | 버프 | 수치만큼 공격력 증가 |", "| root | 속박 | 턴 | 움직이지 못한다 |",
      "| stun | 기절 | 턴 | 행동할 수 없다 |", "| taunt | 도발 | 턴 | 공격 대상이 도발한 쪽이 된다 |", "",
      "## 6. 게임 규칙 상수", "",
      "| 항목 | 값 | 위치 |", "|---|---|---|",
      "| 플레이어 기본 | 체력 40 · 공격력 5 · 방어력 5 · 이동속도 3 · 기력 3 · 마나 20 | `player/Player.js` |",
      "| 패 크기 | 행동 패 4 · 인벤토리 패 4 (장비로 늘어남) | `card/Card.js` `CardSystem` |",
      "| 방 시작 | 처음 패 3장 · 마나 +5 | `run/Run.js` |",
      "| 지도 | 15층 + 우두머리, 한 층 4~5칸, 갈래길 1개 20% · 2개 40% · 3개 40% | `run/RunMap.js` |",
      "| 고정 층 | 1층 전투 · 9층 보물 · 15층 휴식 | `RunMap.FIXED` |",
      "| 방 종류 | 전투 · 정예 · 상점 · 휴식 · 보물 · 우두머리 | `RunMap.TYPES` |",
      "| 정예·우두머리 | 정예 체력×1.8 공격+2 · 우두머리 체력×3.5 공격+3 | `entity/Monster.js` `RANKS` |",
      "| 방 위험도 예산 | 전투 40(+4/층) · 정예 22(+2/층), 한 방 최대 5마리 | `run/RoomGen.js` |", ""]
(root / "DATA.md").write_text("\n".join(o), encoding="utf-8")
print("DATA.md 생성:", len(D["cards"]), "카드", len(D["enemies"]), "적")

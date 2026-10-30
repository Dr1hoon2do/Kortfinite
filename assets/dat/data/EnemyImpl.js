// 카드 공방 데이터(GameData.js)의 적을 게임 몬스터로 만든다.
//   - 체력·공격·방어·이동속도·드랍·층·태그·"무리지어 다닌다 (2~3마리)" 같은 말은 데이터에서 읽는다.
//   - 행동(패턴)은 이 파일의 SPECS[적 id]에 데이터의 pattern 글을 읽고 짜 둔 것이다 (EnemyAI.js 머리말 참고).
//     새 적이 데이터에 생기면 SPECS에 한 덩어리를 추가한다 (tools/import_data.py가 빠진 id를 알려 준다). 없으면 그냥 다가와서 친다.
// 규칙: 피해 = 공격력(또는 방어력) × %, 방어력은 피해를 줄이지 않는다 (방어도만 막는다). "N턴" 방어도는 자기 턴이 N번 시작될 때까지.
const ATK = (pct = 100, extra = {}) => ({ kind: "approach", pct, stat: "atk", ...extra });

EnemyMoves.SPECS = {
    basic: { brain: () => ATK() },

    // 들쥐: A 반복
    rat: { brain: () => ATK() },

    // 늑대: A(달려들어 물고 피해 절반 회복) / B(쉬기) / C(울부짖어 힘 +1 영구)
    //   사거리 5 안이면 항상 A. 밖에 3턴 이상 있으면 C, 이후 안으로 들어올 때까지 A를 5회 반복. 4번 행동하면 다음은 B
    wolf: {
        brain(ai, ctx, e, foe) {
            const m = ai.mem;
            m.acts ??= 0;
            m.far ??= 0;
            m.forceA ??= 0;
            const bite = ATK(100, { lifesteal: 0.5 });
            if (m.acts >= 4) {
                m.acts = 0;
                return { kind: "idle" };
            }
            m.acts++;
            if (EnemyMoves.dist(e, foe) <= 5) {
                m.far = 0;
                m.forceA = 0;
                return bite;
            }
            if (m.forceA > 0) {
                m.forceA--;
                return bite;
            }
            m.far++;
            if (m.far >= 3) {
                m.far = 0;
                m.forceA = 5;
                return { kind: "howl", n: 1 };
            }
            return bite;
        }
    },

    // 고블린: A(같은 줄이면 끝없이 돌진, 공격력 250%) 뒤에는 항상 B(쉬기). A를 못 하면 C(거리 3 이상 두기)·D(A를 할 수 있게 자리 잡기)를 번갈아
    goblin: {
        brain(ai, ctx, e, foe) {
            const m = ai.mem;
            const w = ctx.world;
            if (m.rest) {
                m.rest = false;
                return { kind: "idle" };
            }
            if (EnemyMoves.canCharge(w, e, foe)) {
                m.rest = true;
                return EnemyMoves.chargeIntent(ctx, e, foe, 250);
            }
            m.cd = !m.cd;
            const n = e.speedNow;
            const tiles = EnemyMoves.reach(w, e, n);
            if (m.cd) {
                // C: 가능한 한 멀어진다 (3칸 이상이 되도록)
                let best = null;
                for (const t of tiles) {
                    const d = EnemyMoves.dist(t, foe);
                    if (!best || d > best.d) best = { ...t, d };
                }
                if (best && best.d > EnemyMoves.dist(e, foe)) return { kind: "move", to: { x: best.x, y: best.y }, name: "거리 두기" };
                return { kind: "idle" };
            }
            // D: A를 할 수 있는 칸(같은 줄 · 사이가 빔)으로, 가장 적게 걷는 곳
            let best = null;
            for (const t of tiles) {
                if (!(t.x === foe.x || t.y === foe.y) || (t.x === foe.x && t.y === foe.y)) continue;
                if (!EnemyMoves.clearBetween(w, t, foe)) continue;
                const d = EnemyMoves.dist(t, foe);
                if (!best || t.path.length < best.len || (t.path.length === best.len && d > best.d)) best = { ...t, len: t.path.length, d };
            }
            if (best) return { kind: "move", to: { x: best.x, y: best.y }, name: "자리 잡기" };
            return ATK();
        }
    },

    // 미니 돌 골렘: [ABC] 로테이션
    //   A 다가가거나 옆칸이면 방어력 100% 피해 / B 방어력 100% 방어도 1턴 / C 쉼
    mini_stone_golem: {
        rotations: ["ABC"],
        actions: {
            A: () => ATK(100, { stat: "def", name: "박치기" }),
            B: () => ({ kind: "block", pct: 100, turns: 1 }),
            C: () => ({ kind: "idle" })
        }
    },

    // 오우거: [AABCD, ABACD] 중 하나
    //   A 다가가거나 옆칸이면 공격력 100% / B 이동속도 300% 이내로 도약해 주변 2칸 공격력 100% (벽이 막으면 못 쓴다, 한가운데 플레이어는 밀어낸다)
    //   C 쉼 / D 음식을 먹어 방어력 100%만큼 회복
    ogre: {
        rotations: ["AABCD", "ABACD"],
        fallback: { B: "A" },
        actions: {
            A: () => ATK(),
            B(ai, ctx, e, foe) {
                const w = ctx.world;
                const range = e.speedNow * 3;
                const d = EnemyMoves.dist(e, foe);
                let to;
                if (d <= range) to = { x: foe.x, y: foe.y };
                else {
                    to = { x: Math.round(e.x + (foe.x - e.x) * range / d), y: Math.round(e.y + (foe.y - e.y) * range / d) };
                    if (!w.isWalkable(to.x, to.y)) return null;
                }
                if (!EnemyMoves.sightLine(w, e, to)) return null; // 벽이 있으면 못 쓴다
                return { kind: "leap", to, tiles: EnemyMoves.around(w, to.x, to.y, 2), r: 2, dmg: EnemyMoves.val(e, "atk", 100), name: "도약" };
            },
            C: () => ({ kind: "idle" }),
            D: () => ({ kind: "eat", pct: 100 })
        }
    },

    // 해골: [AADBC, AACBD, ACADAB] 중 하나
    //   A 다가가거나 옆칸이면 공격력 100% / B 사거리 5, 플레이어 칸 + 3거리 안 무작위 두 칸에 뼈 3개 (각 공격력 80%) — 사거리 밖이면 이전과 같은 행동
    //   C 방어력 100% 방어도 1턴 / D 쉼
    skeleton: {
        rotations: ["AADBC", "AACBD", "ACADAB"],
        fallback: { B: "prev" },
        actions: {
            A: () => ATK(),
            B(ai, ctx, e, foe) {
                if (EnemyMoves.dist(e, foe) > 5) return null;
                const w = ctx.world;
                const near = EnemyMoves.around(w, foe.x, foe.y, 3).filter(([x, y]) => x !== foe.x || y !== foe.y);
                const extra = Rng.shuffle(EnemyMoves.rng(ctx), near).slice(0, 2);
                return { kind: "area", name: "뼈 던지기", tiles: [[foe.x, foe.y], ...extra], dmg: EnemyMoves.val(e, "atk", 80), thrown: true, color: "#e8e0c0" };
            },
            C: () => ({ kind: "block", pct: 100, turns: 1 }),
            D: () => ({ kind: "idle" })
        }
    },

    // 슬라임: [AABCD, ABACD, AAACDB] 중 하나
    //   A 다가가거나 옆칸이면 공격력 100% / B 방어력 100% 방어도 1턴 / C 쉼
    //   D 사거리 5 (벽에 막힌다), 플레이어 칸 + 1칸 거리에 점액: 공격력 80% + 둔화(50%, 2턴) — 못 쓰면 A
    slime: {
        rotations: ["AABCD", "ABACD", "AAACDB"],
        fallback: { D: "A" },
        actions: {
            A: () => ATK(),
            B: () => ({ kind: "block", pct: 100, turns: 1 }),
            C: () => ({ kind: "idle" }),
            D(ai, ctx, e, foe) {
                if (EnemyMoves.dist(e, foe) > 5 || !EnemyMoves.sightLine(ctx.world, e, foe)) return null;
                return { kind: "area", name: "점액 던지기", tiles: EnemyMoves.around(ctx.world, foe.x, foe.y, 1), dmg: EnemyMoves.val(e, "atk", 80), slow: { v: 50, t: 2 }, thrown: true, color: "#7cd47c" };
            }
        }
    },

    // 거미: [BBCA, BCBA] 중 하나
    //   A 사거리 5 (벽에 막힌다) 실을 쏴 맞으면 방어력 50%턴 속박 — 못 닿으면 B / B 다가가거나 옆칸이면 공격력 100%의 독 / C 쉼
    spider: {
        rotations: ["BBCA", "BCBA"],
        fallback: { A: "B" },
        actions: {
            A(ai, ctx, e, foe) {
                if (EnemyMoves.dist(e, foe) > 5 || !EnemyMoves.sightLine(ctx.world, e, foe)) return null;
                return { kind: "area", name: "거미줄", tiles: [[foe.x, foe.y]], dmg: 0, root: Math.floor(e.stats.defense * 0.5 + 1e-9), thrown: true, color: "#e8e8f0" };
            },
            B: () => ATK(100, { poison: 100, name: "독니" }),
            C: () => ({ kind: "idle" })
        }
    },

    // 돌 골렘: [ABCDBD, ADCBDB] 중 하나
    //   A 사거리 5, 플레이어 칸에 돌 공격력 100% — 안 닿으면 D / B 다가가거나 옆칸이면 방어력 100% 피해
    //   C 경질화(방어력 20%) + 방어력 100% 방어도 2턴 / D 쉼
    stone_golem: {
        rotations: ["ABCDBD", "ADCBDB"],
        fallback: { A: "D" },
        actions: {
            A(ai, ctx, e, foe) {
                if (EnemyMoves.dist(e, foe) > 5) return null;
                return { kind: "area", name: "돌 던지기", tiles: [[foe.x, foe.y]], dmg: EnemyMoves.val(e, "atk", 100), thrown: true, color: "#a89878" };
            },
            B: () => ATK(100, { stat: "def", name: "내려치기" }),
            C: () => ({ kind: "block", pct: 100, turns: 2, harden: 20 }),
            D: () => ({ kind: "idle" })
        }
    }
};

// ---------- 데이터 → 몬스터 종류 ----------
class EnemyData {
    static rooms = []; // 방에 나올 수 있는 적 { id, min, max, floors:[a,b], threat, group:[min,max] }

    // "1-..." → [1, Infinity], "3-8" → [3, 8], "5" → [5, 5]
    static floors(text) {
        const m = String(text ?? "1-...").trim().match(/^(\d+)\s*(?:-\s*(\d+|\.{2,}|…))?$/);
        if (!m) return [1, Infinity];
        const a = +m[1];
        if (m[2] === undefined) return [a, a];
        return [a, /^\d+$/.test(m[2]) ? +m[2] : Infinity];
    }

    // 설명(note)의 "(2~3마리)" / "(2마리)"
    static group(note) {
        const m = String(note ?? "").match(/\((\d+)\s*(?:~\s*(\d+))?\s*마리\)/);
        if (!m) return [1, 1];
        return [+m[1], +(m[2] ?? m[1])];
    }

    static load() {
        EnemyData.rooms = [];
        for (const e of GAME_DATA.enemies) {
            if (!EnemyMoves.SPECS[e.id]) console.warn("적 패턴이 아직 없다 (data/EnemyImpl.js에 추가, 지금은 그냥 다가와서 친다):", e.id);
            Monster.KINDS[e.id] = {
                name: e.name, hp: e.hp, attack: e.atk, defense: e.def, moves: e.speed ?? 1,
                drops: (e.drops ?? []).map((d) => ({ id: d.id, chance: +d.chance || 0, count: d.count ?? 1 })),
                tags: e.tags ?? [], pattern: e.pattern ?? "", note: e.note ?? ""
            };
            EntityTypes.register(e.id, (x, y, d) => new Monster(x, y, e.id, d));
            EnemyData.rooms.push({
                id: e.id, floors: EnemyData.floors(e.floors), group: EnemyData.group(e.note),
                threat: e.hp + e.atk * 2 + e.def
            });
        }
    }

    // 이 층(1부터)에 나올 수 있는 적들
    static at(floor) {
        return EnemyData.rooms.filter((r) => floor >= r.floors[0] && floor <= r.floors[1]);
    }
}

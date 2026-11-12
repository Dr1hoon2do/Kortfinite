// 슬라임퀸 (공방 데이터 slime_queen, 2x2). 로테이션 [ABCDEF, ABCFDE] 중 하나, 시작 위치 무작위.
//   점액 함정 — 밟으면 점액 카드 1장 + 속박 1턴 (밟으면 사라진다. 방이 끝날 때까지 남는다)
//   A 함정 설치 — 플레이어 위치 2칸 범위 테두리에 점액 함정, 방어력 100% 방어도 2턴
//   B 점액 손 — 플레이어 위치 2칸 범위. 공격력 60%, 점액 카드(이동속도), 퀸 옆으로 당겨온다
//   C 끌어당기기 — 이동속도 200% 거리 안이면 당겨오고 둔화 100%(이동속도 200% 턴) + 점액 카드(이동속도), 멀면 다가온다
//   D 소멸 제거 — 다가가거나 옆이면 패·덱·묘지 모든 점액 카드의 [소멸]을 없앤다 (쓰면 묘지로 가서 다시 돈다)
//   E 흡수 — 플레이어의 점액 카드 1장마다 퀸은 방어력 33%(최소 1) 회복, 플레이어는 공격력 33%(최소 1) 피해
//   F 공격 — 다가가거나 옆이면 공격력 100% + 점액 카드(이동속도)
class SlimeQueen {
    static COLOR = "#7cd47c";

    // ---------- 점액 카드 ----------
    static give(p, n) {
        if (n <= 0 || p !== Player.current) return [];
        for (let i = 0; i < n; i++) {
            const c = new Card("slime");
            c.ensureData().temp = true;
            if (!p.cards.addToHand(c)) p.cards.addToDeck(c);
        }
        MessageLog.add(`점액 카드 ${n}장이 끼어들었다`, SlimeQueen.COLOR);
        return [new PopupAnim(p, `점액 카드 +${n}`, SlimeQueen.COLOR)];
    }

    static slimes(p) {
        const z = p.cards;
        return [...z.hand, ...z.deck, ...z.graveyard].filter((c) => c.defId === "slime");
    }

    static bySpeed(e, pct = 100) {
        return Math.floor(e.speedNow * pct / 100 + 1e-9);
    }

    // ---------- 점액 함정 ----------
    // 플레이어가 (x, y)에 섰다 (Pickups.stepped가 부른다)
    static trapStepped(p, w) {
        for (const o of w.entitiesAt(p.x, p.y)) {
            if (o.kind !== "slimetrap" || !o.world) continue;
            o.remove(w);
            MessageLog.add("점액 함정을 밟았다! 속박 1턴", SlimeQueen.COLOR);
            Status.add(p, "root", 1);
            p._trapStop = true; // 이동 카드는 여기서 멈춘다
            const anims = [EnemyMoves.inflict(p, "root", 1), ...SlimeQueen.give(p, 1)];
            if (Game && Game.turns && Game.turns.queue) Game.turns.queue.enqueue(anims);
        }
    }

    // ---------- 움직임 ----------
    static advance(ai, ctx, n) {
        const e = ai.entity;
        const w = ctx.world;
        const t = w.tileSize;
        const foe = ai.focus(ctx);
        const anims = [];
        let moved = 0;
        if (Status.get(e, "root") > 0) {
            if (EnemyMoves.dist(e, foe) > 1) anims.push(new PopupAnim(e, "속박", "#e8e8f0"));
            return { anims, moved };
        }
        while (moved < n && e.alive && foe.alive && EnemyMoves.dist(e, foe) > 1) {
            const dir = SlimeKing.stepToward(w, e, foe);
            if (!dir) break;
            const fx = e.x;
            const fy = e.y;
            if (!w.moveEntity(e, dir[0], dir[1])) break;
            anims.push(new MoveAnim(e, new Vector(fx * t, fy * t), new Vector(e.x * t, e.y * t)));
            moved++;
        }
        return { anims, moved };
    }

    // 다가가거나, 이동을 다 쓰지 않고 닿았으면 o.effect를 한다 (o.dmg가 있으면 먼저 친다)
    static approach(ai, ctx, o) {
        const e = ai.entity;
        const w = ctx.world;
        const p = ctx.player;
        const foe = ai.focus(ctx);
        const adv = SlimeQueen.advance(ai, ctx, e.speedNow);
        const anims = adv.anims;
        let hitPlayer = false;
        if (e.alive && foe.alive && EnemyMoves.dist(e, foe) <= 1 && adv.moved < e.speedNow) {
            if (o.dmg) {
                anims.push(...Combat.strike(e, foe, w, EnemyMoves.val(e, "atk", o.dmg), o.name));
                if (foe === p) {
                    hitPlayer = true;
                    if (o.cards && p.alive) anims.push(...SlimeQueen.give(p, SlimeQueen.bySpeed(e, o.cards)));
                }
            }
            if (o.effect) anims.push(...o.effect(e, p, w));
        }
        return { anims, hitPlayer };
    }

    static approachView(ai, p, e, dmg) {
        const f = ai.focus({ world: e.world, player: p });
        const d = EnemyMoves.dist(e, f);
        if (Status.get(e, "root") > 0 && d > 1) return { kind: "idle" };
        if (d > e.speedNow) return { kind: "chase" };
        return dmg ? { kind: "attack", v: Status.modify(EnemyMoves.val(e, "atk", dmg), e, f) } : { kind: "buff", name: "소멸 제거" };
    }

    // ---------- A 함정 설치 ----------
    // (cx, cy) 둘레 2칸 사각 테두리 중 설치할 수 있는 칸
    static ringTiles(w, cx, cy) {
        const out = [];
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== 2) continue;
            const x = cx + dx;
            const y = cy + dy;
            if (w.getChunkAt(x, y) && EnemyMoves.walkableTile(w, x, y)) out.push([x, y]);
        }
        return out;
    }

    static trapIntent(ctx, e, foe) {
        const tiles = SlimeQueen.ringTiles(ctx.world, foe.x, foe.y);
        const guard = EnemyMoves.val(e, "def", 100);
        return {
            kind: "custom", name: "함정 설치", tiles, color: SlimeQueen.COLOR,
            view: () => ({ kind: "area", name: "함정 설치" }),
            text: () => `함정 설치: 표시한 칸(지금 위치 둘레 2칸 테두리)에 점액 함정을 깐다 (밟으면 점액 카드 1장 + 속박 1턴) · 방어도 ${guard} (2턴)`,
            run: (ai, c) => {
                const w = c.world;
                const made = [];
                for (const [x, y] of tiles) {
                    if (w.entitiesAt(x, y).some((o) => o.kind === "slimetrap" || o.solid)) continue;
                    w.spawn(new Hazard(x, y, "slimetrap", {}));
                    made.push([x, y]);
                }
                if (e.addGuard) e.addGuard(guard, 2);
                MessageLog.add(`${josa(e.displayName, "이가")} 점액 함정을 깔았다 (${made.length}곳, 방어도 ${guard})`, SlimeQueen.COLOR);
                return { anims: [new AreaFlashAnim(w, made, SlimeQueen.COLOR, 0.35, false), new PopupAnim(e, "+" + guard, "#8cc8f0")], hitPlayer: false };
            }
        };
    }

    // ---------- B 점액 손 ----------
    static handIntent(ctx, e, foe) {
        return {
            kind: "area", name: "점액 손", tiles: EnemyMoves.around(ctx.world, foe.x, foe.y, 2), dmg: EnemyMoves.val(e, "atk", 60),
            thrown: true, color: SlimeQueen.COLOR, cards: { pct: 100 }, pull: true
        };
    }

    // ---------- C 끌어당기기 ----------
    static pullIntent(ctx, e) {
        const reach = () => SlimeQueen.bySpeed(e, 200);
        return {
            kind: "custom", name: "끌어당기기",
            view: (ai, p) => {
                const f = ai.focus({ world: e.world, player: p });
                return EnemyMoves.dist(e, f) <= reach() ? { kind: "area", name: "끌어당기기" } : { kind: "chase" };
            },
            text: () => `이동속도 200%(${reach()}칸) 안이면 당겨와 둔화 100% ${reach()}턴 + 점액 카드 ${SlimeQueen.bySpeed(e)}장 · 멀면 다가온다 (한 턴에 ${e.speedNow}칸)`,
            run: (ai, c) => {
                const w = c.world;
                const p = c.player;
                const foe = ai.focus(c);
                if (EnemyMoves.dist(e, foe) > reach()) return SlimeQueen.approach(ai, c, {});
                const anims = [...SlimeKingPull.pull(w, e, foe)];
                MessageLog.add(`${josa(e.displayName, "이가")} 점액으로 끌어당겼다!`, SlimeQueen.COLOR);
                if (foe === p) {
                    anims.push(EnemyMoves.inflict(p, "slow", 100, reach()));
                    anims.push(...SlimeQueen.give(p, SlimeQueen.bySpeed(e)));
                }
                return { anims, hitPlayer: foe === p };
            }
        };
    }

    // ---------- D 소멸 제거 ----------
    static unvanishIntent(ctx, e) {
        return {
            kind: "custom", name: "소멸 제거",
            view: (ai, p) => SlimeQueen.approachView(ai, p, e, 0),
            text: () => `다가온다 (한 턴에 ${e.speedNow}칸) · 닿으면 패·덱·묘지 모든 점액 카드의 [소멸]을 없앤다 (써도 묘지로 돌아가 다시 돈다)`,
            run: (ai, c) => SlimeQueen.approach(ai, c, {
                effect: (q, p) => {
                    const list = SlimeQueen.slimes(p);
                    for (const card of list) card.ensureData().noVanish = true;
                    p.cards._changed();
                    MessageLog.add(`${josa(q.displayName, "이가")} 점액 카드를 끈적하게 만들었다 (${list.length}장, 이제 써도 사라지지 않는다)`, SlimeQueen.COLOR);
                    return [new PopupAnim(q, "소멸 제거", SlimeQueen.COLOR)];
                }
            })
        };
    }

    // ---------- E 흡수 ----------
    static drainIntent(ctx, e, foe) {
        const heal = Math.max(1, EnemyMoves.val(e, "def", 33));
        const dmg = Math.max(1, EnemyMoves.val(e, "atk", 33));
        return {
            kind: "custom", name: "흡수", color: SlimeQueen.COLOR,
            view: (ai, p) => {
                const n = SlimeQueen.slimes(p).length;
                return n ? { kind: "attack", v: n * dmg, name: "흡수" } : { kind: "idle" };
            },
            text: () => `흡수: 당신의 패·덱·묘지 점액 카드 1장마다 퀸은 체력 ${heal} 회복, 당신은 ${dmg} 피해`,
            run: (ai, c) => {
                const p = c.player;
                const n = SlimeQueen.slimes(p).length;
                if (!n) return { anims: [new PopupAnim(e, "쉼", "#a89878")], hitPlayer: false };
                const got = Math.min(e.stats.maxHp - e.stats.hp, n * heal);
                e.stats.hp += got;
                MessageLog.add(`${josa(e.displayName, "이가")} 점액 카드 ${n}장을 빨아들였다 (체력 +${got})`, SlimeQueen.COLOR);
                const anims = [new PopupAnim(e, "+" + got, "#7cd47c")];
                anims.push(...EnemyMoves.hurt(e, p, n * dmg, "흡수", c.world));
                return { anims, hitPlayer: true };
            }
        };
    }

    // ---------- F 공격 ----------
    static biteIntent(ctx, e) {
        return {
            kind: "custom", name: "공격",
            view: (ai, p) => SlimeQueen.approachView(ai, p, e, 100),
            text: () => `다가온다 (한 턴에 ${e.speedNow}칸) · 닿으면 ${EnemyMoves.val(e, "atk", 100)} 피해 + 점액 카드 ${SlimeQueen.bySpeed(e)}장`,
            run: (ai, c) => SlimeQueen.approach(ai, c, { dmg: 100, name: "공격", cards: 100 })
        };
    }
}

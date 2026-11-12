// 슬라임퀸 (공방 데이터 slime_queen, 2x2). 로테이션 [ABCDEFG], 시작 위치 무작위.
//   A 점액 뒤덮기 — 방의 모든 칸에 점액 장판(3턴). 그 전 플레이어 턴에 공격으로 피해를 입었으면 하지 않고 쉰다
//   B 점액 손 — 플레이어 위치 1칸 범위. 공격력 60%, 점액 카드(이동속도), 속박(이동속도 100% 턴), 자기 옆으로 당겨온다
//   C 유혹 — 이동속도 200%만큼 다가가거나, 옆칸이면 매료(2칸, 이동속도 200% 턴) + 공격력 100%
//   D 공격 — 이동속도만큼 다가가거나, 옆칸이면 공격력 100% + 점액 카드(이동속도)
//   E 기 모으기
//   F 연타 — 다가가거나 옆칸이면 공격력 60% + 점액 카드(이동속도). 기를 모았으면 이 행동을 이동속도 300%번 되풀이
//   G 가두기 — 플레이어가 점액 장판 위에 있거나 패에 점액 카드가 있을 때만. 아니면 바로 다음 행동을 한다
// 가두기: 플레이어를 자기 몸 안(2x2 중 한 칸)에 넣는다.
//   - 패에 점액 카드가 있는 동안 둔화 66% + 속박 (점액 카드를 다 치우면 풀려서 걸어 나올 수 있다)
//   - 플레이어 턴 시작마다 퀸 방어력 33%만큼 점액 카드가 끼어들고, 패·덱·묘지의 점액 카드 1장당 공격력 30%(최소 1) 피해
//   - 퀸은 가둔 대상에게서 피해를 입지 않고, 가둔 대상은 퀸이 아닌 상대에게서 피해를 입지 않는다
//   - 몸 밖 칸으로 나가거나 퀸이 쓰러지면 풀린다
class SlimeQueen {
    static COLOR = "#7cd47c";
    static HOLD_SLOW = 66;

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

    static isSlime(c) {
        return c.defId === "slime";
    }

    static inHand(p) {
        return p.cards.hand.filter(SlimeQueen.isSlime).length;
    }

    static total(p) {
        const z = p.cards;
        return [...z.hand, ...z.deck, ...z.graveyard].filter(SlimeQueen.isSlime).length;
    }

    static cardsBySpeed(e, pct = 100) {
        return Math.floor(e.speedNow * pct / 100 + 1e-9);
    }

    // ---------- 가두기 상태 ----------
    // p를 가두고 있는 퀸 (없으면 null). 몸 밖으로 나갔거나 퀸이 쓰러졌으면 여기서 풀린다
    static holder(p) {
        const q = p && p.heldBy;
        if (!q) return null;
        if (q.alive && q.world && p.alive && q.tilesOf().some(([x, y]) => x === p.x && y === p.y)) return q;
        p.heldBy = null;
        SlimeQueen.dropFx(p);
        if (p.alive) MessageLog.add(`${q.displayName}의 몸에서 빠져나왔다`, "#a0d0a0");
        return null;
    }

    static dropFx(p) {
        if (!p.holdFx) return;
        p.holdFx = false;
        Status.set(p, "root", 0);
        Status.set(p, "slow", 0);
    }

    // 갇힌 동안: 패에 점액 카드가 있으면 둔화 66% + 속박, 없으면 풀린다. 패가 바뀔 때마다 부른다 (Card.js _changed)
    static refresh(p) {
        if (!p || !p.heldBy && !p.holdFx) return;
        const q = SlimeQueen.holder(p);
        if (q && SlimeQueen.inHand(p) > 0) {
            if (Status.get(p, "root") < 1) Status.set(p, "root", 1);
            if (Status.get(p, "slow") < SlimeQueen.HOLD_SLOW) Status.set(p, "slow", SlimeQueen.HOLD_SLOW, 1);
            p.holdFx = true;
        } else SlimeQueen.dropFx(p);
    }

    // 피해 막기 (Combat.hit): 퀸은 가둔 대상에게서, 가둔 대상은 퀸이 아닌 상대에게서 피해를 입지 않는다
    static blocks(target, source) {
        if (!source) return false;
        if (source.heldBy && SlimeQueen.holder(source) === target) return true;
        if (target.heldBy) {
            const q = SlimeQueen.holder(target);
            if (q && source !== q) return true;
        }
        return false;
    }

    // 플레이어 새 턴 (TurnManager): 점액 카드가 끼어들고, 가진 점액 카드만큼 피해
    static turnStart(p, w) {
        const q = SlimeQueen.holder(p);
        if (!q) return [];
        const anims = [];
        anims.push(...SlimeQueen.give(p, EnemyMoves.val(q, "def", 33)));
        const n = SlimeQueen.total(p);
        const per = Math.max(1, EnemyMoves.val(q, "atk", 30));
        if (n > 0) {
            MessageLog.add(`${q.displayName}의 몸 안에서 녹아내린다 (점액 카드 ${n}장 × ${per})`, "#f0a0a0");
            anims.push(...EnemyMoves.hurt(q, p, n * per, "소화", w));
        }
        SlimeQueen.refresh(p);
        return anims;
    }

    // ---------- 움직임 ----------
    // foe 쪽으로 n칸까지 다가간다. { anims, moved }
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

    // 다가가거나, 닿아 있으면(이동을 다 쓰지 않았을 때) 친다. o: { moves, pct, name, cards(이동속도 %), charm: { n, turns } }
    static approach(ai, ctx, o) {
        const e = ai.entity;
        const w = ctx.world;
        const p = ctx.player;
        const foe = ai.focus(ctx);
        const adv = SlimeQueen.advance(ai, ctx, o.moves);
        const anims = adv.anims;
        let hitPlayer = false;
        if (e.alive && foe.alive && EnemyMoves.dist(e, foe) <= 1 && adv.moved < o.moves) {
            if (o.charm && foe === p) {
                Status.charm(e, foe, o.charm.n, o.charm.turns);
                MessageLog.add(`${josa(e.displayName, "이가")} 당신을 홀렸다 (매료 ${o.charm.n}칸, ${o.charm.turns}턴)`, Status.DEFS.charm.color);
                anims.push(new PopupAnim(foe, "매료", Status.DEFS.charm.color));
            }
            anims.push(...Combat.strike(e, foe, w, EnemyMoves.val(e, "atk", o.pct), o.name));
            if (foe === p) {
                hitPlayer = true;
                if (o.cards && p.alive) anims.push(...SlimeQueen.give(p, SlimeQueen.cardsBySpeed(e, o.cards)));
            }
        }
        return { anims, hitPlayer };
    }

    static approachView(ai, p, e, moves, pct) {
        const f = ai.focus({ world: e.world, player: p });
        const d = EnemyMoves.dist(e, f);
        if (Status.get(e, "root") > 0 && d > 1) return { kind: "idle" };
        return d <= moves ? { kind: "attack", v: Status.modify(EnemyMoves.val(e, "atk", pct), e, f) } : { kind: "chase" };
    }

    // ---------- A 점액 뒤덮기 ----------
    // 퀸이 있는 방의 걸을 수 있는 칸 전부
    static roomTiles(w, e) {
        const seen = new Set();
        const queue = [];
        for (const [x, y] of e.tilesOf()) { seen.add(x + "," + y); queue.push([x, y]); }
        for (let i = 0; i < queue.length && queue.length < 4000; i++) {
            const [x, y] = queue[i];
            for (const [dx, dy] of Entity.DIRS) {
                const k = (x + dx) + "," + (y + dy);
                if (seen.has(k) || !w.getChunkAt(x + dx, y + dy) || !EnemyMoves.walkableTile(w, x + dx, y + dy)) continue;
                seen.add(k);
                queue.push([x + dx, y + dy]);
            }
        }
        return queue;
    }

    static floodIntent(ctx, e) {
        return {
            kind: "custom", name: "점액 뒤덮기", color: SlimeQueen.COLOR,
            view: () => ({ kind: "area", name: "점액 뒤덮기" }),
            text: () => "점액 뒤덮기: 방의 모든 칸에 점액 장판(3턴)을 깐다. 그 전에 공격으로 피해를 입히면 하지 않고 쉰다",
            run: SlimeQueen.runFlood
        };
    }

    static runFlood(ai, ctx) {
        const e = ai.entity;
        const w = ctx.world;
        if (ai.mem.hurtAt !== undefined && ai.mem.hurtAt === ctx.player.turnNo) {
            MessageLog.add(`${josa(e.displayName, "은는")} 얻어맞아 점액을 퍼뜨리지 못했다`, "#a0d0a0");
            return { anims: [new PopupAnim(e, "움찔", "#c8b890")], hitPlayer: false };
        }
        const tiles = SlimeQueen.roomTiles(w, e);
        for (const [x, y] of tiles) Goo.lay(w, x, y, 3);
        MessageLog.add(`${josa(e.displayName, "이가")} 방 전체를 점액으로 뒤덮었다 (3턴)`, SlimeQueen.COLOR);
        return { anims: [new PopupAnim(e, "점액 뒤덮기", SlimeQueen.COLOR), new AreaFlashAnim(w, tiles, SlimeQueen.COLOR, 0.35, false)], hitPlayer: false };
    }

    // ---------- B 점액 손 ----------
    static handIntent(ctx, e, foe) {
        return {
            kind: "area", name: "점액 손", tiles: EnemyMoves.around(ctx.world, foe.x, foe.y, 1), dmg: EnemyMoves.val(e, "atk", 60),
            thrown: true, color: SlimeQueen.COLOR, cards: { pct: 100 }, pull: true, root: Math.max(1, SlimeQueen.cardsBySpeed(e, 100))
        };
    }

    // ---------- C 유혹 ----------
    static charmIntent(ctx, e) {
        const moves = () => SlimeQueen.cardsBySpeed(e, 200);
        const turns = () => Math.max(1, SlimeQueen.cardsBySpeed(e, 200));
        return {
            kind: "custom", name: "유혹",
            view: (ai, p) => SlimeQueen.approachView(ai, p, e, moves(), 100),
            text: () => `유혹: 다가온다 (한 턴에 ${moves()}칸) · 닿으면 매료 2칸 ${turns()}턴 + ${EnemyMoves.val(e, "atk", 100)} 피해`,
            run: (ai, c) => SlimeQueen.approach(ai, c, { moves: moves(), pct: 100, name: "유혹", charm: { n: 2, turns: turns() } })
        };
    }

    // ---------- D 공격 ----------
    static biteIntent(ctx, e) {
        return {
            kind: "custom", name: "공격",
            view: (ai, p) => SlimeQueen.approachView(ai, p, e, e.speedNow, 100),
            text: () => `다가온다 (한 턴에 ${e.speedNow}칸) · 닿으면 ${EnemyMoves.val(e, "atk", 100)} 피해 + 점액 카드 ${SlimeQueen.cardsBySpeed(e)}장`,
            run: (ai, c) => SlimeQueen.approach(ai, c, { moves: e.speedNow, pct: 100, name: "공격", cards: 100 })
        };
    }

    // ---------- E 기 모으기 ----------
    static focusIntent(ctx, e) {
        return {
            kind: "custom", name: "기 모으기",
            view: () => ({ kind: "buff", name: "기 모으기" }),
            text: () => `기를 모은다: 다음 연타를 ${Math.max(1, SlimeQueen.cardsBySpeed(e, 300))}번 되풀이한다`,
            run: (ai) => {
                ai.mem.charged = true;
                MessageLog.add(`${josa(e.displayName, "이가")} 기를 모은다`, "#f0c060");
                return { anims: [new PopupAnim(e, "기 모으기", "#f0c060")], hitPlayer: false };
            }
        };
    }

    // ---------- F 연타 ----------
    static flurryIntent(ctx, e) {
        const reps = (ai) => ai.mem.charged ? Math.max(1, SlimeQueen.cardsBySpeed(e, 300)) : 1;
        return {
            kind: "custom", name: "연타",
            view: (ai, p) => SlimeQueen.approachView(ai, p, e, e.speedNow * reps(ai), 60),
            text: () => `연타: 다가오거나 닿으면 ${EnemyMoves.val(e, "atk", 60)} 피해 + 점액 카드 ${SlimeQueen.cardsBySpeed(e)}장${e.ai.mem.charged ? ` · 기를 모아서 ${reps(e.ai)}번 되풀이한다` : ""}`,
            run: (ai, c) => {
                const n = reps(ai);
                ai.mem.charged = false;
                const out = { anims: [], hitPlayer: false };
                const steps = [];
                for (let i = 0; i < n && e.alive && c.player.alive; i++) {
                    const r = SlimeQueen.approach(ai, c, { moves: e.speedNow, pct: 60, name: "연타", cards: 100 });
                    steps.push(r.anims);
                    out.hitPlayer = out.hitPlayer || r.hitPlayer;
                }
                out.anims = steps.length > 1 ? [new SeqAnim(steps)] : (steps[0] ?? []);
                return out;
            }
        };
    }

    // ---------- G 가두기 ----------
    static canHold(e, p) {
        return !!p && p === Player.current && p.alive && !SlimeQueen.holder(p) && (Goo.on(p) || SlimeQueen.inHand(p) > 0);
    }

    static holdIntent(ctx, e, foe) {
        if (foe !== ctx.player || !SlimeQueen.canHold(e, foe)) return null; // 못 하면 바로 다음 행동 (fallback "next")
        return {
            kind: "custom", name: "가두기", color: SlimeQueen.COLOR,
            view: () => ({ kind: "area", name: "가두기" }),
            text: () => "가두기: 당신이 점액 장판 위에 있거나 패에 점액 카드가 있으면 몸 안에 가둔다. 갇히면 턴마다 점액 카드가 끼어들고 점액 카드 수만큼 피해 · 패의 점액 카드를 다 치우면 걸어 나올 수 있다",
            run: SlimeQueen.runHold
        };
    }

    static runHold(ai, ctx) {
        const e = ai.entity;
        const w = ctx.world;
        const p = ctx.player;
        const t = w.tileSize;
        if (!SlimeQueen.canHold(e, p)) {
            MessageLog.add(`${josa(e.displayName, "의")} 가두기를 피했다`, "#a0d0a0");
            return { anims: [new PopupAnim(e, "놓쳤다", "#c8b890")], hitPlayer: false };
        }
        // 몸 안 칸 중 플레이어에게 가장 가까운 칸으로 끌어 넣는다
        let best = null;
        let bd = Infinity;
        for (const [x, y] of e.tilesOf()) {
            const d = Math.abs(x - p.x) + Math.abs(y - p.y);
            if (d < bd) { bd = d; best = [x, y]; }
        }
        const fx = p.x;
        const fy = p.y;
        w.removeEntity(p);
        p.x = best[0];
        p.y = best[1];
        w.addEntity(p);
        p.heldBy = e;
        MessageLog.add(`${josa(e.displayName, "이가")} 당신을 몸 안에 가뒀다! 패의 점액 카드를 다 치워야 걸어 나올 수 있다`, "#f0a0a0");
        SlimeQueen.refresh(p);
        return { anims: [new MoveAnim(p, new Vector(fx * t, fy * t), new Vector(p.x * t, p.y * t), 0.18), new PopupAnim(p, "갇힘", SlimeQueen.COLOR)], hitPlayer: true };
    }
}

// A: 퀸이 공격으로 피해를 입은 플레이어 턴을 적어 둔다
Events.on(GameEvent.DAMAGED, ({ target, dealt, source }) => {
    if (target && target.kind === "slime_queen" && source && dealt > 0 && target.ai && target.ai.mem && Player.current) target.ai.mem.hurtAt = Player.current.turnNo;
});

// 슬라임킹 (공방 데이터 slime_king, 2x2). 행동 하나하나가 의도(intent)를 만들고, kind "custom"은 run/view/describe를 스스로 가진다.
//   A 점액 돌진 — 플레이어 쪽으로 벽·무언가에 부딪힐 때까지 돌진. 충돌 공격력 160% + 점액 카드 (이동속도 200%)
//   B 점액 던지기 — 플레이어 자리와 그 주변 무작위 6곳에 한 칸씩. 공격력 80%, 맞으면 점액 카드(이동속도 100%), 떨어진 칸마다 점액 장판 2턴
//   C 다가가기 — 이동속도만큼 다가가거나 옆이면 공격력 100%. 맞히면 점액 카드
//   D 방어 — 방어력 100% 방어도 1턴
//   E 슬라임 소환 — 현재 체력 15%를 체력으로, 공격·방어는 킹의 40%인 슬라임을 곁에
//   F 점액 손 — entity/SlimeKingPull.js
//   G 휴식 — 1턴 쉬며 체력 5 회복
// 킹이 움직여 지나간 자리(발자국 2x2 전체)에는 점액 장판(2턴)이 생긴다 (돌진·다가가기).
// 점액 카드 수는 자기 이동속도 비례 (돌진 200%, 던지기·공격 100%).
class SlimeKing {
    // ---------- 도우미 ----------
    // 점액 카드를 플레이어 패에 끼운다 (전투가 끝나면 사라지는 임시 카드). 패가 가득하면 덱으로
    static giveSlime(e, p, pct) {
        const n = Math.floor(e.speedNow * pct / 100 + 1e-9);
        if (n <= 0 || p !== Player.current) return [];
        for (let i = 0; i < n; i++) {
            const c = new Card("slime");
            c.ensureData().temp = true;
            if (!p.cards.addToHand(c)) p.cards.addToDeck(c);
        }
        MessageLog.add(`점액 카드 ${n}장이 끼어들었다`, "#7cd47c");
        return [new PopupAnim(p, `점액 카드 +${n}`, "#7cd47c")];
    }

    static center(e) {
        return { x: e.x + (e.size - 1) / 2, y: e.y + (e.size - 1) / 2 };
    }

    // 킹의 칸(왼쪽 아래 anchor)을 (x, y)에 놓았을 때 foe와 붙어 있나
    static touches(e, x, y, foe) {
        for (const [ax, ay] of e.tilesOf(x, y)) for (const [bx, by] of foe.tilesOf()) if (Math.abs(ax - bx) + Math.abs(ay - by) === 1) return true;
        return false;
    }

    // foe 쪽으로 가는 첫 걸음 방향 (큰 몸이 지나갈 수 있는 길만). 없으면 null
    static stepToward(w, e, foe) {
        const key = (x, y) => x + "," + y;
        const prev = new Map([[key(e.x, e.y), null]]);
        const queue = [[e.x, e.y]];
        for (let qi = 0; qi < queue.length && qi < 600; qi++) {
            const [x, y] = queue[qi];
            if (SlimeKing.touches(e, x, y, foe)) {
                let k = key(x, y);
                let dir = null;
                while (prev.get(k)) {
                    const [from, dx, dy] = prev.get(k);
                    dir = [dx, dy];
                    k = from;
                }
                return dir;
            }
            for (const [dx, dy] of Entity.DIRS) {
                const nx = x + dx;
                const ny = y + dy;
                const k = key(nx, ny);
                if (prev.has(k) || !w.getChunkAt(nx, ny) || !w.canEnter(e, nx, ny)) continue;
                prev.set(k, [key(x, y), dx, dy]);
                queue.push([nx, ny]);
            }
        }
        return null;
    }

    // 킹이 움직일 때마다 새로 차지한 칸들(발자국 전체)에 점액 장판을 깐다. (fx, fy)는 움직이기 전 왼쪽 아래 칸
    static trail(w, e, life = 2, fx = e.x, fy = e.y) {
        const before = new Set(e.tilesOf(fx, fy).map(([x, y]) => x + "," + y));
        for (const [x, y] of e.tilesOf()) if (!before.has(x + "," + y)) Goo.lay(w, x, y, life);
    }

    // ---------- A 점액 돌진 ----------
    static dirTo(e, foe) {
        const c = SlimeKing.center(e);
        const fx = foe.x + (foe.size - 1) / 2;
        const fy = foe.y + (foe.size - 1) / 2;
        const dx = fx - c.x;
        const dy = fy - c.y;
        if (Math.abs(dx) > Math.abs(dy)) return [Math.sign(dx), 0];
        return [0, Math.sign(dy) || Math.sign(dx) || 1];
    }

    // dir로 돌진하면: { steps, x, y(멈춘 왼쪽 아래 칸), tiles(지나간 칸), hit(부딪힌 것) }
    static sim(w, e, dir) {
        let x = e.x;
        let y = e.y;
        const tiles = [];
        const seen = new Set();
        let steps = 0;
        let hit = null;
        for (let guard = 0; guard < 60; guard++) {
            const nx = x + dir[0];
            const ny = y + dir[1];
            if (w.canEnter(e, nx, ny)) {
                x = nx;
                y = ny;
                steps++;
                for (const [tx, ty] of e.tilesOf(x, y)) if (!seen.has(tx + "," + ty)) { seen.add(tx + "," + ty); tiles.push([tx, ty]); }
                continue;
            }
            for (const [tx, ty] of e.tilesOf(nx, ny)) {
                const o = w.entityAt(tx, ty);
                if (o && o !== e) { hit = o; break; }
            }
            break;
        }
        return { steps, x, y, tiles, hit };
    }

    static chargeIntent(ctx, e, foe) {
        const dir = SlimeKing.dirTo(e, foe);
        const r = SlimeKing.sim(ctx.world, e, dir);
        if (r.steps < 1) return null;
        const dmg = EnemyMoves.val(e, "atk", 160);
        return {
            kind: "custom", name: "점액 돌진", dir, dmg, tiles: r.tiles, color: "#f08030",
            view: () => ({ kind: "charge", v: dmg }),
            text: () => `점액 돌진: 주황 칸을 따라 벽에 부딪힐 때까지 돌진. 부딪힌 상대에게 ${dmg} 피해 + 점액 카드 ${Math.floor(e.speedNow * 2)}장. 슬라임킹이 지나간 자리엔 점액 장판(2턴)이 생성된다`,
            run: SlimeKing.runCharge
        };
    }

    static runCharge(ai, ctx, turns, intent) {
        const e = ai.entity;
        const w = ctx.world;
        const p = ctx.player;
        const t = w.tileSize;
        const anims = [];
        let hitPlayer = false;
        if (Status.get(e, "root") > 0) return { anims: [new PopupAnim(e, "속박", "#e8e8f0")], hitPlayer };
        const r = SlimeKing.sim(w, e, intent.dir);
        if (r.steps < 1) return { anims: [new PopupAnim(e, "…", "#c8b890")], hitPlayer };
        const fx = e.x;
        const fy = e.y;
        for (let i = 0; i < r.steps; i++) {
            const bx = e.x;
            const by = e.y;
            w.moveEntity(e, intent.dir[0], intent.dir[1]);
            SlimeKing.trail(w, e, 2, bx, by); // 지나간 자리에 점액 장판
        }
        anims.push(new MoveAnim(e, new Vector(fx * t, fy * t), new Vector(e.x * t, e.y * t), 0.06 * r.steps + 0.06));
        anims.push(new AreaFlashAnim(w, r.tiles, "#7cd47c", 0.35, false));
        MessageLog.add(`${josa(e.displayName, "이가")} 점액을 흩뿌리며 돌진했다!`, "#7cd47c");
        const foe = r.hit;
        if (foe && foe.alive && (foe === p || foe instanceof Ally)) {
            MessageLog.add(`${josa(e.displayName, "이가")} ${foe === p ? "당신" : foe.displayName}을 들이받았다!`, "#f0a0a0");
            anims.push(...Combat.strike(e, foe, w, intent.dmg, "점액 돌진"));
            if (foe === p) {
                hitPlayer = true;
                anims.push(...SlimeKing.giveSlime(e, p, 200));
            }
        }
        return { anims, hitPlayer };
    }

    // ---------- B 점액 던지기 ----------
    static throwIntent(ctx, e, foe) {
        const w = ctx.world;
        const rng = EnemyMoves.rng(ctx);
        const near = [];
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
            if (!dx && !dy || Math.abs(dx) + Math.abs(dy) > 2) continue;
            if (EnemyMoves.walkableTile(w, foe.x + dx, foe.y + dy)) near.push([foe.x + dx, foe.y + dy]);
        }
        for (let i = near.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [near[i], near[j]] = [near[j], near[i]]; }
        const centers = [[foe.x, foe.y], ...near.slice(0, 6)]; // 플레이어 칸 + 주변 무작위 6곳 (모자라면 있는 만큼)
        return {
            kind: "area", name: "점액 던지기", tiles: centers.map(([x, y]) => [x, y]), centers, dmg: EnemyMoves.val(e, "atk", 80), thrown: true, color: "#7cd47c",
            cards: { pct: 100 }, goo: 2
        };
    }

    // ---------- C 다가가기 / 공격 ----------
    static biteIntent(ctx, e, foe) {
        const pct = 100;
        return {
            kind: "custom", name: "공격", pct,
            view: (ai, p) => {
                const f = ai.focus({ world: e.world, player: p });
                const d = EnemyMoves.dist(e, f);
                if (Status.get(e, "root") > 0 && d > 1) return { kind: "idle" };
                return d <= e.speedNow ? { kind: "attack", v: Status.modify(EnemyMoves.val(e, "atk", pct), e, f) } : { kind: "chase" };
            },
            text: () => `다가온다 (한 턴에 ${e.speedNow}칸) · 닿으면 ${EnemyMoves.val(e, "atk", pct)} 피해, 맞히면 점액 카드 ${Math.floor(e.speedNow)}장`,
            run: SlimeKing.runBite
        };
    }

    static runBite(ai, ctx, turns, intent) {
        const e = ai.entity;
        const w = ctx.world;
        const p = ctx.player;
        const t = w.tileSize;
        const foe = ai.focus(ctx);
        const anims = [];
        let hitPlayer = false;
        const n = e.speedNow;
        let moved = 0;
        const rooted = Status.get(e, "root") > 0;
        while (moved < n && e.alive && foe.alive && EnemyMoves.dist(e, foe) > 1 && !rooted) {
            const dir = SlimeKing.stepToward(w, e, foe);
            if (!dir) break;
            const fx = e.x;
            const fy = e.y;
            if (!w.moveEntity(e, dir[0], dir[1])) break;
            SlimeKing.trail(w, e, 2, fx, fy); // 다가가는 걸음에도 점액 장판
            anims.push(new MoveAnim(e, new Vector(fx * t, fy * t), new Vector(e.x * t, e.y * t)));
            moved++;
        }
        if (e.alive && foe.alive && EnemyMoves.dist(e, foe) === 1 && moved < n) {
            const dmg = EnemyMoves.val(e, "atk", intent.pct);
            anims.push(...Combat.strike(e, foe, w, dmg, "공격"));
            if (foe === p) {
                hitPlayer = true;
                if ((Combat.last?.dealt ?? 0) > 0) anims.push(...SlimeKing.giveSlime(e, p, 100));
            }
        }
        return { anims, hitPlayer };
    }

    // ---------- E 슬라임 소환 ----------
    // 킹 둘레의 비어 있는 칸들
    static ringTiles(w, e) {
        const out = [];
        for (let dy = -1; dy <= e.size; dy++) for (let dx = -1; dx <= e.size; dx++) {
            const inside = dx >= 0 && dx < e.size && dy >= 0 && dy < e.size;
            const corner = (dx < 0 || dx >= e.size) && (dy < 0 || dy >= e.size);
            if (inside || corner) continue;
            const x = e.x + dx;
            const y = e.y + dy;
            if (w.getChunkAt(x, y) && w.isWalkable(x, y)) out.push([x, y]);
        }
        return out;
    }

    static summonIntent(ctx, e) {
        const w = ctx.world;
        const rng = EnemyMoves.rng(ctx);
        const ring = SlimeKing.ringTiles(w, e);
        if (!ring.length) return null;
        const spot = ring[Math.floor(rng() * ring.length)];
        const hp = Math.max(1, Math.floor(e.stats.hp * 15 / 100 + 1e-9));
        return {
            kind: "custom", name: "슬라임 소환", tiles: [spot], color: "#8a50c8", spot,
            view: () => ({ kind: "summon" }),
            text: () => `슬라임 소환: 현재 체력의 15%(${hp})를 체력으로, 공격·방어는 자기의 40%인 슬라임을 곁에 부른다`,
            run: SlimeKing.runSummon
        };
    }

    static runSummon(ai, ctx, turns, intent) {
        const e = ai.entity;
        const w = ctx.world;
        const anims = [];
        let spot = intent.spot;
        if (!w.isWalkable(spot[0], spot[1])) {
            const ring = SlimeKing.ringTiles(w, e);
            spot = ring.length ? ring[0] : null;
        }
        if (!spot) return { anims: [new PopupAnim(e, "…", "#c8b890")], hitPlayer: false };
        const stats = {
            hp: Math.max(1, Math.floor(e.stats.hp * 15 / 100 + 1e-9)),
            atk: Math.floor(e.stats.attack * 40 / 100 + 1e-9),
            def: Math.floor(e.stats.defense * 40 / 100 + 1e-9)
        };
        const m = EntityTypes.create("slime", spot[0], spot[1], { lv: 1, stats });
        w.spawn(m);
        MessageLog.add(`${josa(e.displayName, "이가")} 슬라임을 뱉어 냈다 (체력 ${stats.hp}, 공격 ${stats.atk}, 방어 ${stats.def})`, "#b080e8");
        anims.push(new PopupAnim(e, "소환", "#b080e8"));
        return { anims, hitPlayer: false };
    }

    // ---------- G 휴식 ----------
    static restIntent(ctx, e) {
        const v = 5;
        return {
            kind: "custom", name: "휴식", color: "#7cd47c",
            view: () => ({ kind: "heal", v }),
            text: () => `휴식: 1턴 쉰다. 체력을 ${v} 회복한다`,
            run: SlimeKing.runRest
        };
    }

    static runRest(ai, ctx, turns, intent) {
        const e = ai.entity;
        const got = Math.max(0, Math.min(e.stats.maxHp - e.stats.hp, 5));
        e.stats.hp += got;
        MessageLog.add(`${josa(e.displayName, "이가")} 쉬면서 체력을 ${got} 회복했다`, "#7cd47c");
        return { anims: [new PopupAnim(e, "+" + got, "#7cd47c")], hitPlayer: false };
    }
}

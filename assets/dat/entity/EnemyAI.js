// 적의 패턴. 적은 턴이 끝날 때마다 다음 턴에 할 일(의도, intent)을 정해 머리 위에 보여 주고, 다음 턴이 지날 때 그대로 한다.
// 카드 쓰기는 턴이 안 들기 때문에, 플레이어는 의도를 보고 피하거나(이동 카드) 막거나(방어 카드) 먼저 잡을 수 있다.
//
// 의도 종류 (intent.kind):
//   approach — 이동속도만큼 다가가고, 닿아 있으면 친다. { pct, stat: "atk"|"def", lifesteal, poison(독만 건다) }
//              닿아 있는 채로(이동을 다 쓰지 않았을 때) 친다: 이동속도를 다 쓰고 닿았다면 그 턴은 치지 않는다
//   move     — 정해 둔 칸으로 간다 (거리 두기·자리 잡기)
//   charge   — 같은 줄로 벽·부딪히는 것까지 돌진, 부딪힌 상대에게 피해 (고블린)
//   leap     — 표시한 칸으로 도약해 주변을 친다. 착지 칸에 플레이어가 있으면 밀어낸다 (오우거)
//   rush     — 방어도를 얻고 달려가 (닿으면 충돌 피해) 주변 3x3을 휘두른다 (해골 기사). { to, path, block, col, swing, tiles }
//   area     — 표시한 칸들에 피해와 상태 이상: 뼈·점액·돌 던지기, 거미줄 (원거리·범위)
//   block    — 방어도를 얻는다 (+ 경질화)
//   eat      — 체력을 회복한다
//   howl     — 울부짖어 힘을 얻는다
//   idle     — 쉰다
// 표시한 칸(intent.tiles)은 땅에 빨갛게 그려진다 (IntentOverlay). 적을 탭하면 의도 설명이 메시지 창에 뜬다.
//
// 패턴은 공방 데이터의 적 설명(pattern)을 읽고 data/EnemyImpl.js에 짠다:
//   로테이션 적: SPECS[id] = { rotations: ["AAB…", …], actions: { A: (ai, ctx, e, foe) → intent | null, … }, fallback: { 글자: 대신 할 글자 | "prev" } }
//   그 밖의 적: SPECS[id] = { brain: (ai, ctx, e, foe) → intent }
//   ("어느 행동부터 시작할지는 무작위"는 로테이션 하나를 고르고 시작 위치를 무작위로 정한다)
class EnemyAI extends HostileAI {
    // options: { brain: 적 id (EnemyMoves.SPECS 키) }
    constructor(options = {}) {
        super({ sight: 99 });
        this.brainKey = options.brain;
        this.spec = EnemyMoves.SPECS[options.brain] ?? EnemyMoves.SPECS.basic;
        this.intent = undefined; // 아직 안 정했으면 undefined
        this.step = 0;           // 지금까지 한 턴 수
        this.tauntBy = null;     // 나를 도발한 쪽 (도발 상태일 때만 쓴다)
        this.mem = {};           // 패턴이 쓰는 기억 (로테이션 위치, 늑대의 연속 행동 수 …)
    }

    // 다음 턴 의도 정하기
    plan(ctx) {
        const e = this.entity;
        if (!e || !e.alive || !ctx.player.alive) {
            this.intent = null;
            return null;
        }
        if (Status.get(e, "stun")) {
            this.intent = { kind: "stunned" };
            return this.intent;
        }
        const foe = this.focus(ctx);
        let intent = null;
        if (this.spec.rotations) intent = EnemyMoves.rotate(this, this.spec, ctx, e, foe);
        else if (this.spec.brain) intent = this.spec.brain(this, ctx, e, foe);
        this.intent = intent ?? { kind: "approach", pct: 100, stat: "atk" };
        return this.intent;
    }

    // 정해 둔 의도를 한다. { anims, hitPlayer }
    takeTurn(ctx, turns) {
        const e = this.entity;
        if (e.tickGuard) e.tickGuard(); // 지난 턴에 얻은 방어도는 여기서 줄거나 사라진다
        const pre = Status.tickStart(e, ctx.world); // 화상
        if (!e.alive) return { anims: pre, hitPlayer: false };
        const intent = this.intent === undefined ? this.plan(ctx) : this.intent;
        this.intent = null;
        this.step++;
        let r = { anims: [], hitPlayer: false };
        if (Status.get(e, "stun")) r.anims.push(new PopupAnim(e, "기절", Status.DEFS.stun.color));
        else if (intent) r = EnemyMoves.run(this, ctx, turns, intent);
        if (e.alive) r.anims.push(...Status.tickPoison(e, ctx.world));
        Status.tickTurns(e);
        r.anims.unshift(...pre);
        return r;
    }

    // 노릴 대상: 도발당했으면 도발한 쪽, 아니면 플레이어
    focus(ctx) {
        const e = this.entity;
        const t = this.tauntBy;
        if (t && Status.get(e, "taunt") > 0 && t.alive && t.world) return t;
        return ctx.player;
    }

    // 도발당하기
    taunted(by, turns = 1) {
        Status.add(this.entity, "taunt", turns);
        this.tauntBy = by;
    }
}

class EnemyMoves {
    // 적 종류별 패턴표 (data/EnemyImpl.js가 채운다)
    static SPECS = { basic: { brain: () => ({ kind: "approach", pct: 100, stat: "atk" }) } };

    // ---------- 도우미 ----------
    static dist(a, b) {
        return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    }

    // 같은 줄(가로·세로)이면 방향 [dx, dy], 아니면 null
    static lineDir(a, b) {
        if (a.x === b.x && a.y !== b.y) return [0, Math.sign(b.y - a.y)];
        if (a.y === b.y && a.x !== b.x) return [Math.sign(b.x - a.x), 0];
        return null;
    }

    // a와 b 사이가 비어 있는가 (b 칸은 빼고)
    static clearBetween(world, a, b) {
        const d = EnemyMoves.lineDir(a, b);
        if (!d) return false;
        for (let x = a.x + d[0], y = a.y + d[1]; x !== b.x || y !== b.y; x += d[0], y += d[1]) {
            if (!world.isWalkable(x, y)) return false;
        }
        return true;
    }

    // a에서 b까지 직선(칸을 따라)에 벽이 없는가 (엔티티는 안 본다: 던지는 것은 몬스터 위로 넘는다)
    static sightLine(world, a, b) {
        const n = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
        for (let i = 1; i < n; i++) {
            const x = Math.round(a.x + (b.x - a.x) * i / n);
            const y = Math.round(a.y + (b.y - a.y) * i / n);
            if (!EnemyMoves.walkableTile(world, x, y)) return false;
        }
        return true;
    }

    static walkableTile(world, x, y) {
        return ChunkManager.tileOk(world.getTile(x, y));
    }

    // (x, y)와 그 주변 (diamond 반경 r) 중 벽이 아닌 칸
    static around(world, x, y, r) {
        const tiles = [];
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
            if (Math.abs(dx) + Math.abs(dy) > r) continue;
            if (EnemyMoves.walkableTile(world, x + dx, y + dy)) tiles.push([x + dx, y + dy]);
        }
        return tiles;
    }

    // 정사각형 반경 r
    static square(world, x, y, r) {
        const tiles = [];
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
            if (EnemyMoves.walkableTile(world, x + dx, y + dy)) tiles.push([x + dx, y + dy]);
        }
        return tiles;
    }

    static rng(ctx) {
        return ctx.world.rng ?? Math.random;
    }

    // e의 공격력/방어력 비례 값 
    static val(e, stat, pct) {
        const base = stat === "def" ? e.stats.defense : e.stats.attack;
        return Math.floor(base * pct / 100 + 1e-9);
    }

    // ---------- 로테이션 ----------
    // spec.rotations 중 하나를 고르고 시작 위치를 무작위로 정한 뒤, 한 턴에 한 글자씩 읽는다.
    // 글자의 행동이 지금 못 하는 상황이면 null이 와서 spec.fallback[글자] ("prev": 바로 전에 한 행동 / 다른 글자)로 대신한다
    static rotate(ai, spec, ctx, e, foe) {
        const m = ai.mem;
        if (!m.seq) {
            const rng = EnemyMoves.rng(ctx);
            m.seq = spec.rotations[Math.floor(rng() * spec.rotations.length)];
            m.idx = Math.floor(rng() * m.seq.length);
        }
        let letter = m.seq[m.idx % m.seq.length];
        m.idx++;
        let intent = spec.actions[letter](ai, ctx, e, foe);
        if (!intent) {
            let fb = spec.fallback?.[letter] ?? "A";
            if (fb === "prev") fb = m.prev ?? "A";
            letter = fb;
            intent = spec.actions[letter](ai, ctx, e, foe) ?? spec.actions.A(ai, ctx, e, foe) ?? { kind: "approach", pct: 100, stat: "atk" };
        }
        m.prev = letter;
        intent.letter = letter;
        return intent;
    }

    // 걸어서 n칸 안에 갈 수 있는 칸들 [{ x, y, path:[[dx,dy]…] }] (자기 칸 제외)
    static reach(world, e, n) {
        const out = [];
        for (const [k, path] of ActionCards.reachable(world, e, n)) {
            const [x, y] = k.split(",").map(Number);
            out.push({ x, y, path });
        }
        return out;
    }

    // 경로 [[dx,dy]…]를 칸 목록으로
    static pathTiles(e, path) {
        const out = [];
        let x = e.x;
        let y = e.y;
        for (const [dx, dy] of path) {
            x += dx;
            y += dy;
            out.push([x, y]);
        }
        return out;
    }

    // 같은 줄에서 foe를 향해 돌진할 수 있는가 (줄이 같고 사이가 비었다)
    static canCharge(world, e, foe) {
        return !!EnemyMoves.lineDir(e, foe) && EnemyMoves.clearBetween(world, e, foe);
    }

    // 돌진 의도: 줄을 따라 벽·무엇이든 부딪힐 때까지 (최대 maxLen칸)
    static chargeIntent(ctx, e, foe, pct, maxLen = Infinity) {
        const dir = EnemyMoves.lineDir(e, foe);
        const tiles = [];
        for (let x = e.x + dir[0], y = e.y + dir[1]; tiles.length < maxLen && EnemyMoves.walkableTile(ctx.world, x, y); x += dir[0], y += dir[1]) {
            tiles.push([x, y]);
            if (ctx.world.entityAt(x, y)) break;
        }
        return { kind: "charge", dir, tiles, len: tiles.length, max: maxLen, dmg: EnemyMoves.val(e, "atk", pct), name: "돌진" };
    }

    // ---------- 하기 ----------
    // { anims, hitPlayer }
    static run(ai, ctx, turns, intent) {
        const e = ai.entity;
        const w = ctx.world;
        const p = ctx.player;
        const anims = [];
        let hitPlayer = false;
        const hpBefore = p.stats.hp + p.block;
        const t = w.tileSize;
        switch (intent.kind) {
            case "approach": {
                const n = e.speedNow;
                const foe = ai.focus(ctx);
                const rooted = Status.get(e, "root") > 0;
                let moved = 0;
                let bumped = false;
                while (moved < n && e.alive && foe.alive && EnemyMoves.dist(e, foe) > 1 && !rooted) {
                    const dir = ai.stepToward(foe);
                    const res = dir ? turns.perform(e, dir) : null;
                    if (!res) break;
                    anims.push(...res);
                    if (turns.lastWasAttack) {
                        bumped = true;
                        if (turns.lastTarget === p) hitPlayer = true;
                        break;
                    }
                    moved++;
                }
                if (!bumped && e.alive && foe.alive && EnemyMoves.dist(e, foe) === 1 && moved < n) {
                    if (e.x !== foe.x) e.flipX = foe.x < e.x;
                    e.applyFlip();
                    if (intent.charm) {
                        // 서큐버스: 상대에게 걸린 매료가 자기 것이 아니면 (다른 서큐버스 것이거나 없으면) 매료를 건다. 자기 매료가 걸려 있으면 피해, 피해를 입혔다면 체력 회복·힘·경질화
                        const c = intent.charm;
                        if (!Status.charmedBy(foe, e)) {
                            anims.push(new AttackAnim(e, foe, t));
                            Status.charm(e, foe, c.n ?? 2, c.turns ?? 3);
                            MessageLog.add(`${josa(e.displayName, "이가")} ${foe.displayName}을 매료했다 (${c.n ?? 2}칸, ${c.turns ?? 3}턴)`, Status.DEFS.charm.color);
                            anims.push(new PopupAnim(foe, `매료 ${c.n ?? 2}`, Status.DEFS.charm.color));
                        } else {
                            const dmg = EnemyMoves.val(e, "atk", intent.pct ?? 100);
                            anims.push(...Combat.strike(e, foe, w, dmg, intent.name ?? null));
                            const dealt = Combat.last?.dealt ?? 0;
                            if (dealt > 0 && e.alive) {
                                const heal = Math.min(e.stats.maxHp - e.stats.hp, EnemyMoves.val(e, "def", c.heal ?? 100));
                                if (heal > 0) {
                                    e.stats.hp += heal;
                                    anims.push(new PopupAnim(e, "+" + heal, "#7cd47c"));
                                }
                                Status.add(e, "str", c.str ?? 1, Status.ENDLESS);
                                Status.add(e, "harden", c.harden ?? 1, Status.ENDLESS);
                                Status.add(e, "growth", c.growth ?? 1, Status.ENDLESS);
                                MessageLog.add(`${josa(e.displayName, "이가")} 기운을 빨아들였다 (체력 +${heal}, 힘 +${c.str ?? 1}, 경질화 +${c.harden ?? 1}, 성장 +${c.growth ?? 1})`, "#f0a0c8");
                                anims.push(new PopupAnim(e, "흡수", "#f080c0"));
                            }
                        }
                    } else if (intent.poison) {
                        anims.push(new AttackAnim(e, foe, t));
                        const v = EnemyMoves.val(e, intent.stat ?? "atk", intent.poison);
                        MessageLog.add(`${josa(e.displayName, "이가")} ${foe.displayName}에게 독을 걸었다 (독 ${v})`, "#9ce05c");
                        anims.push(EnemyMoves.inflict(foe, "poison", v));
                    } else {
                        const dmg = EnemyMoves.val(e, intent.stat ?? "atk", intent.pct ?? 100);
                        anims.push(...Combat.strike(e, foe, w, dmg, intent.name ?? null));
                        const dealt = Combat.last?.dealt ?? 0;
                        if (intent.lifesteal && dealt > 0 && e.alive) {
                            const heal = Math.min(e.stats.maxHp - e.stats.hp, Math.floor(dealt * intent.lifesteal));
                            if (heal > 0) {
                                e.stats.hp += heal;
                                MessageLog.add(`${josa(e.displayName, "이가")} 체력을 ${heal} 회복했다`, "#7cd47c");
                                anims.push(new PopupAnim(e, "+" + heal, "#7cd47c"));
                            }
                        }
                    }
                    if (foe === p) hitPlayer = true;
                }
                break;
            }
            case "idle":
                anims.push(new PopupAnim(e, "쉼", "#a89878"));
                break;
            case "stunned":
                break;
            case "move": {
                if (Status.get(e, "root")) {
                    anims.push(new PopupAnim(e, "속박", "#e8e8f0"));
                    break;
                }
                const goal = intent.to;
                const path = Pathfinder.find(w, e.x, e.y, goal.x, goal.y, { maxNodes: 800 }) ?? [];
                let n = 0;
                for (const [dx, dy] of path) {
                    if (n >= e.speedNow) break;
                    const fx = e.x;
                    const fy = e.y;
                    if (!w.moveEntity(e, dx, dy)) break;
                    if (dx) e.flipX = dx < 0;
                    anims.push(new MoveAnim(e, new Vector(fx * t, fy * t), new Vector(e.x * t, e.y * t)));
                    n++;
                }
                e.applyFlip();
                break;
            }
            case "block": {
                const v = EnemyMoves.val(e, "def", intent.pct ?? 100);
                if (e.addGuard) e.addGuard(v, intent.turns ?? 1);
                MessageLog.add(`${josa(e.displayName, "이가")} 몸을 웅크렸다 (방어도 ${v}, ${intent.turns ?? 1}턴)`, "#8cc8f0");
                anims.push(new PopupAnim(e, "+" + v, "#8cc8f0"));
                if (intent.harden) {
                    const h = EnemyMoves.val(e, "def", intent.harden);
                    Status.add(e, "harden", h, Status.ENDLESS);
                    anims.push(new PopupAnim(e, `경질화 ${h}`, Status.DEFS.harden.color));
                    MessageLog.add(`${josa(e.displayName, "이가")} 단단해졌다 (경질화 ${h})`, "#9ad0e8");
                }
                break;
            }
            case "eat": {
                const v = Math.min(e.stats.maxHp - e.stats.hp, EnemyMoves.val(e, "def", intent.pct ?? 100));
                e.stats.hp += v;
                MessageLog.add(`${josa(e.displayName, "이가")} 음식을 먹고 체력을 ${v} 회복했다`, "#7cd47c");
                anims.push(new PopupAnim(e, "+" + v, "#7cd47c"));
                break;
            }
            case "howl": {
                Status.add(e, "str", intent.n ?? 1, Status.ENDLESS);
                MessageLog.add(`${josa(e.displayName, "이가")} 울부짖었다! 힘이 영구히 ${Status.get(e, "str")}이 됐다`, "#f0a0a0");
                anims.push(new PopupAnim(e, "힘+" + (intent.n ?? 1), Status.DEFS.str.color));
                break;
            }
            case "area": {
                const name = intent.name ?? "공격";
                const center = intent.tiles[0];
                if (intent.thrown && center) anims.push(new ProjectileAnim(w, "cards", 70, new Vector(e.x * t, e.y * t), new Vector(center[0] * t, center[1] * t)));
                anims.push(new AreaFlashAnim(w, intent.tiles, intent.color ?? "#e05040", 0.3, !!intent.dmg));
                const victims = EnemyMoves.victims(w, p, intent.tiles);
                if (!victims.length) MessageLog.add(`${josa(e.displayName, "의")} ${name}을(를) 피했다`, "#a0d0a0");
                for (const v of victims) {
                    if (intent.dmg > 0) {
                        MessageLog.add(`${josa(e.displayName, "의")} ${name}!`, "#f0a0a0");
                        anims.push(...EnemyMoves.hurt(e, v, intent.dmg, name, w));
                    }
                    if (v.alive) {
                        if (intent.root) anims.push(EnemyMoves.inflict(v, "root", intent.root));
                        if (intent.slow) anims.push(EnemyMoves.inflict(v, "slow", intent.slow.v, intent.slow.t));
                    }
                    if (v === p) hitPlayer = true;
                }
                break;
            }
            case "charge": {
                if (Status.get(e, "root")) {
                    anims.push(new PopupAnim(e, "속박", "#e8e8f0"));
                    break;
                }
                const [dx, dy] = intent.dir;
                const fx = e.x;
                const fy = e.y;
                let moved = 0;
                let hit = null;
                for (let i = 0; i < (intent.max ?? 99); i++) {
                    const nx = e.x + dx;
                    const ny = e.y + dy;
                    const block = w.entityAt(nx, ny);
                    if (block) {
                        if (block === p || block instanceof Ally) hit = block;
                        break;
                    }
                    if (!w.moveEntity(e, dx, dy)) break;
                    moved++;
                }
                if (dx) e.flipX = dx < 0;
                e.applyFlip();
                if (moved) anims.push(new MoveAnim(e, new Vector(fx * t, fy * t), new Vector(e.x * t, e.y * t), 0.06 * moved + 0.06));
                if (hit) {
                    MessageLog.add(`${josa(e.displayName, "이가")} 돌진해 들이받았다!`, "#f0a0a0");
                    anims.push(...EnemyMoves.hurt(e, hit, intent.dmg, "돌진", w));
                    if (hit === p) hitPlayer = true;
                } else MessageLog.add(`${josa(e.displayName, "의")} 돌진은 아무것도 맞히지 못했다`, "#a0d0a0");
                break;
            }
            case "rush": {
                const b = intent.block;
                if (b) {
                    const v = EnemyMoves.val(e, "def", b.pct ?? 100);
                    if (e.addGuard) e.addGuard(v, b.turns ?? 1);
                    MessageLog.add(`${josa(e.displayName, "이가")} 방패를 들었다 (방어도 ${v}, ${b.turns ?? 1}턴)`, "#8cc8f0");
                    anims.push(new PopupAnim(e, "+" + v, "#8cc8f0"));
                }
                if (Status.get(e, "root")) {
                    anims.push(new PopupAnim(e, "속박", "#e8e8f0"));
                    break;
                }
                const fx = e.x;
                const fy = e.y;
                let moved = 0;
                for (const [dx, dy] of intent.path) {
                    if (!w.moveEntity(e, dx, dy)) break;
                    if (dx) e.flipX = dx < 0;
                    moved++;
                }
                e.applyFlip();
                if (moved) anims.push(new MoveAnim(e, new Vector(fx * t, fy * t), new Vector(e.x * t, e.y * t), 0.06 * moved + 0.06));
                const foe = ai.focus(ctx);
                if (foe.alive && EnemyMoves.dist(e, foe) === 1) {
                    MessageLog.add(`${josa(e.displayName, "이가")} 돌진해 들이받았다!`, "#f0a0a0");
                    anims.push(...EnemyMoves.hurt(e, foe, intent.col, "돌진", w));
                    if (foe === p) hitPlayer = true;
                }
                const swing = EnemyMoves.square(w, e.x, e.y, 1).filter(([x, y]) => x !== e.x || y !== e.y);
                anims.push(new AreaFlashAnim(w, swing, "#c8c8d8", 0.3, true));
                const hits = EnemyMoves.victims(w, p, swing);
                if (!hits.length) MessageLog.add(`${josa(e.displayName, "의")} 검은 아무도 맞히지 못했다`, "#a0d0a0");
                for (const v of hits) {
                    anims.push(...EnemyMoves.hurt(e, v, intent.swing, "휘두르기", w));
                    if (v === p) hitPlayer = true;
                }
                break;
            }
            case "leap": {
                if (Status.get(e, "root")) {
                    anims.push(new PopupAnim(e, "속박", "#e8e8f0"));
                    break;
                }
                const fx = e.x;
                const fy = e.y;
                const to = intent.to;
                const foe = ai.focus(ctx);
                // 정중앙에 있는 상대는 1칸 밀쳐낸다
                for (const v of EnemyMoves.victims(w, p, [[to.x, to.y]])) {
                    const dx = Math.abs(to.x - fx) >= Math.abs(to.y - fy) ? Math.sign(to.x - fx) : 0;
                    const dy = dx ? 0 : Math.sign(to.y - fy);
                    const vx = v.x;
                    const vy = v.y;
                    if ((dx || dy) && w.moveEntity(v, dx, dy)) {
                        anims.push(new MoveAnim(v, new Vector(vx * t, vy * t), new Vector(v.x * t, v.y * t), 0.12));
                        MessageLog.add(`${josa(v.displayName, "이가")} 밀려났다!`, "#f0a0a0");
                    }
                }
                const spot = EnemyMoves.landing(w, e, to);
                if (spot) {
                    w.removeEntity(e);
                    e.x = spot.x;
                    e.y = spot.y;
                    w.addEntity(e);
                    anims.push(new MoveAnim(e, new Vector(fx * t, fy * t), new Vector(e.x * t, e.y * t), 0.22));
                }
                const tiles = EnemyMoves.around(w, e.x, e.y, intent.r ?? 2).filter(([x, y]) => x !== e.x || y !== e.y);
                anims.push(new AreaFlashAnim(w, tiles, "#c89050", 0.3, true));
                const victims = EnemyMoves.victims(w, p, tiles);
                if (!victims.length) MessageLog.add(`${josa(e.displayName, "의")} 도약은 아무도 맞히지 못했다`, "#a0d0a0");
                for (const v of victims) {
                    MessageLog.add(`${josa(e.displayName, "이가")} 쿵! 내려앉았다`, "#f0a0a0");
                    anims.push(...EnemyMoves.hurt(e, v, intent.dmg, "도약", w));
                    if (v === p) hitPlayer = true;
                }
                break;
            }
        }
        if (!hitPlayer && p.stats.hp + p.block < hpBefore) hitPlayer = true;
        return { anims, hitPlayer };
    }

    // 표시한 칸에 서 있는 공격받을 것들 (플레이어 · 플레이어 편 소환수)
    static victims(w, p, tiles) {
        const out = [];
        for (const [x, y] of tiles) for (const o of w.entitiesAt(x, y)) {
            if (o.alive && (o === p || o instanceof Ally) && !out.includes(o)) out.push(o);
        }
        return out;
    }

    static onTiles(p, tiles) {
        return tiles.some(([x, y]) => x === p.x && y === p.y);
    }

    // 맞히기 (피해 계산·방어도·메시지). 플레이어든 소환수든
    static hurt(e, target, dmg, name, w) {
        dmg = Status.modify(dmg, e, target);
        MessageLog.add(`${josa(e.displayName, "이가")} ${target instanceof Player ? "당신" : target.displayName}에게 ${dmg} 피해 (${name})`, "#f0a0a0");
        const list = [];
        if (EnemyMoves.dist(e, target) <= 1) list.push(new AttackAnim(e, target, w.tileSize));
        list.push(...Combat.hit(target, dmg, e, w, "physical", false));
        return list;
    }

    // 상태 이상 걸기 (연출 하나)
    static inflict(target, key, n, turns = null) {
        Status.add(target, key, n, turns);
        const d = Status.DEFS[Status.key(key)];
        const label = d.kind === "turns" ? d.name + " " + (turns ?? n) + "턴" : d.name + " " + n;
        if (target instanceof Player) MessageLog.add(`${d.name}에 걸렸다 (${label})`, d.color);
        return new PopupAnim(target, label, d.color);
    }

    // 도약 착지 자리: 목표 칸이 비었으면 거기, 아니면 그 옆 빈칸 중 가까운 곳
    static landing(w, e, to) {
        if (w.isWalkable(to.x, to.y)) return to;
        let best = null;
        let bd = Infinity;
        for (const [dx, dy] of Entity.DIRS) {
            const x = to.x + dx;
            const y = to.y + dy;
            if (!w.isWalkable(x, y) && !(x === e.x && y === e.y)) continue;
            const d = Math.abs(x - e.x) + Math.abs(y - e.y);
            if (d < bd) {
                bd = d;
                best = { x, y };
            }
        }
        return best && (best.x !== e.x || best.y !== e.y) ? best : null;
    }

    static freeNear(w, x, y, r) {
        const list = [];
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
            if ((dx || dy) && w.isWalkable(x + dx, y + dy)) list.push({ x: x + dx, y: y + dy, d: Math.abs(dx) + Math.abs(dy) });
        }
        list.sort((a, b) => a.d - b.d);
        return list[0] ?? null;
    }

    // 방의 모든 적이 다음 턴 의도를 정한다
    static planAll(world, player, turn) {
        const ctx = { world, player, turn };
        for (const e of world.actors ?? []) if (e !== player && e.alive && e.ai && e.ai.plan) e.ai.plan(ctx);
    }

    // ---------- 보이기 ----------
    // 다음 턴 움직임 미리 보기 (땅에 화살표로 그린다)
    //   { path: 지나갈 칸들(출발 칸 제외), hit: 칠 칸 또는 null, rush: 움직인 뒤 치거나 돌진·도약 (주황 화살표) }
    // 길찾기가 무거워서 위치·의도가 그대로면 0.3초 동안 다시 계산하지 않는다
    static preview(ai, p) {
        const e = ai.entity;
        const it = ai.intent;
        if (!it || !e.world || !e.alive) return null;
        const foe = ai.focus({ world: e.world, player: p });
        const key = `${it.kind}|${e.x},${e.y}|${foe.x},${foe.y}`;
        const now = performance.now();
        if (ai._pv && ai._pv.key === key && ai._pv.it === it && now - ai._pv.t < 300) return ai._pv.v;
        let v = null;
        const rooted = Status.get(e, "root") > 0;
        if (it.kind === "approach") v = EnemyMoves.walkPreview(e, foe, rooted ? 0 : e.speedNow);
        else if (it.kind === "leap" && !rooted) {
            const spot = EnemyMoves.landing(e.world, e, it.to) ?? it.to;
            v = { path: [[spot.x, spot.y]], hit: null, rush: true, jump: true };
        } else if (it.kind === "charge" && !rooted) v = { path: it.tiles.slice(), hit: null, rush: true };
        else if (it.kind === "rush" && !rooted) v = it.pathTiles.length ? { path: it.pathTiles.slice(), hit: null, rush: true } : null;
        else if (it.kind === "move" && !rooted) {
            const path = Pathfinder.find(e.world, e.x, e.y, it.to.x, it.to.y, { maxNodes: 800 }) ?? [];
            const tiles = EnemyMoves.pathTiles(e, path.slice(0, e.speedNow));
            v = tiles.length ? { path: tiles, hit: null, rush: false } : null;
        }
        ai._pv = { key, it, t: now, v };
        return v;
    }

    // 한 턴에 n칸 다가가고, 붙어 있으면 친다 (run의 approach와 같은 순서)
    static walkPreview(e, foe, n) {
        const w = e.world;
        const steps = Pathfinder.find(w, e.x, e.y, foe.x, foe.y, { maxNodes: 1500 })
            ?? Pathfinder.find(w, e.x, e.y, foe.x, foe.y, { maxNodes: 1500, ignoreEntities: true }) ?? [];
        const path = [];
        let x = e.x;
        let y = e.y;
        for (let i = 0; i < Math.max(n, 1); i++) {
            if (Math.abs(foe.x - x) + Math.abs(foe.y - y) === 1) return { path, hit: { x: foe.x, y: foe.y }, rush: true };
            if (i >= n) break;
            const s = steps[i];
            if (!s) break;
            x += s[0];
            y += s[1];
            if (x === foe.x && y === foe.y) break;
            path.push([x, y]);
        }
        return { path, hit: null, rush: false };
    }

    // 머리 위 표시 { kind: 아이콘, v: 숫자 }
    static view(ai, p) {
        const e = ai.entity;
        let it = ai.intent;
        if (it === undefined && e.world) it = ai.plan({ world: e.world, player: p, turn: 0 });
        if (!it) return null;
        switch (it.kind) {
            case "approach": {
                const foe = ai.focus({ world: e.world, player: p });
                const d = EnemyMoves.dist(e, foe);
                if (Status.get(e, "root") && d > 1) return { kind: "idle" };
                if (it.charm && foe === p && !Status.charmedBy(foe, e) && d <= e.speedNow) return { kind: "area", name: "매료" };
                if (d <= 1) {
                    if (it.poison) return { kind: "attack", v: EnemyMoves.val(e, it.stat ?? "atk", it.poison), poison: EnemyMoves.val(e, it.stat ?? "atk", it.poison) };
                    return { kind: "attack", v: Status.modify(EnemyMoves.val(e, it.stat ?? "atk", it.pct ?? 100), e, foe) };
                }
                return d <= e.speedNow ? { kind: "attack", v: Status.modify(EnemyMoves.val(e, it.stat ?? "atk", it.pct ?? 100), e, foe) } : { kind: "chase" };
            }
            case "charge": return { kind: "charge", v: it.dmg };
            case "leap": return { kind: "leap", v: it.dmg };
            case "rush": return { kind: "charge", v: it.col + it.swing };
            case "area": return { kind: "area", v: it.dmg || undefined, name: it.name };
            case "move": return { kind: "chase" };
            case "howl": return { kind: "buff" };
            case "block": return { kind: "block", v: EnemyMoves.val(e, "def", it.pct ?? 100) };
            case "eat": return { kind: "heal", v: EnemyMoves.val(e, "def", it.pct ?? 100) };
            case "idle": return { kind: "idle" };
            case "stunned": return { kind: "stunned" };
        }
        return null;
    }

    // 적을 탭했을 때 메시지 창에 뜨는 설명
    static describe(e, p) {
        const ai = e.ai;
        const it = ai.intent === undefined ? ai.plan({ world: e.world, player: p, turn: 0 }) : ai.intent;
        const st = Status.text(e);
        const head = `${e.displayName} (체력 ${e.stats.hp}/${e.stats.maxHp}, 공격 ${e.stats.attack}, 방어 ${e.stats.defense}${e.guard ? `, 방어도 ${e.guard}` : ""}${st ? `, ${st}` : ""})`;
        if (!it) return head;
        const n = e.speedNow;
        const foe = ai.focus({ world: e.world, player: p });
        const text = {
            approach: () => {
                const dmg = EnemyMoves.val(e, it.stat ?? "atk", it.poison ?? it.pct ?? 100);
                const what = it.charm ? (Status.charmedBy(foe, e) ? `${dmg} 피해 (피해를 입히면 체력 회복·힘·경질화)` : `매료 ${it.charm.n ?? 2}칸 ${it.charm.turns ?? 3}턴을 건다`) : it.poison ? `독 ${dmg}을 건다` : `${dmg} 피해${it.lifesteal ? " (준 만큼 절반 회복)" : ""}`;
                return EnemyMoves.dist(e, foe) <= 1 ? `닿으면 친다: ${what}` : `다가온다 (한 턴에 ${n}칸) · 이동을 다 쓰지 않고 닿으면 친다`;
            },
            charge: () => `돌진 준비: 빨간 줄을 따라 돌진, 부딪히면 ${it.dmg} 피해`,
            rush: () => `돌진 준비: 방어도 ${EnemyMoves.val(e, "def", it.block.pct ?? 100)} (${it.block.turns ?? 1}턴) · 달려가 부딪히면 ${it.col} 피해 · 주변 3x3을 휘둘러 ${it.swing} 피해`,
            leap: () => `도약 준비: 표시한 칸으로 뛰어올라 주변 2칸에 ${it.dmg} 피해 (한가운데에 있으면 밀려난다)`,
            area: () => `${it.name}: 표시한 칸에 ${it.dmg ? it.dmg + " 피해" : ""}${it.root ? ` 속박 ${it.root}턴` : ""}${it.slow ? ` 둔화 ${it.slow.v}% ${it.slow.t}턴` : ""}`,
            move: () => "자리를 옮긴다",
            howl: () => "울부짖는다: 힘이 영구히 +1",
            block: () => `몸을 웅크린다: 방어도 ${EnemyMoves.val(e, "def", it.pct ?? 100)} (${it.turns ?? 1}턴)${it.harden ? ` · 경질화 ${EnemyMoves.val(e, "def", it.harden)}` : ""}`,
            eat: () => `음식을 먹는다: 체력 ${EnemyMoves.val(e, "def", it.pct ?? 100)} 회복`,
            idle: () => "쉰다: 이번 턴은 아무것도 안 한다",
            stunned: () => "기절: 이번 턴은 아무것도 못 한다"
        }[it.kind];
        return `${head} · ${text ? text() : ""}`;
    }
}

// 땅에 그리는 적의 예고
//   맞는 칸: 빨강 (돌진 줄은 주황, 거미줄은 흰색)
//   움직임: 그냥 다가오기는 얇은 흰 화살표, 다가와서 치기·돌진·덮치기는 굵은 주황 화살표
class IntentOverlay extends Renderer {
    static MOVE = "#f2ead2";
    static RUSH = "#f08030";

    constructor(run) {
        super();
        this.run = run;
        this.sortingLayer = "Default";
        this.orderInLayer = 1; // 청크(0) 위, 엔티티(2) 아래
    }

    getBounds() {
        return null;
    }

    render(ctx, camera) {
        const room = this.run.room;
        const p = this.run.player;
        if (!room || !p.alive || this.run.state !== "room") return;
        const t = room.tileSize;
        const m = camera.viewMatrix;
        const px = 1 / camera.effectiveZoom; // 화면 1픽셀
        ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 180);
        const enemies = [...room.actors].filter((e) => e !== p && e.alive && e.ai instanceof EnemyAI);
        for (const e of enemies) {
            let it = e.ai.intent;
            if (it === undefined) it = e.ai.plan({ world: room, player: p, turn: 0 });
            if (!it || !it.tiles) continue;
            const color = it.kind === "charge" ? IntentOverlay.RUSH : it.kind === "web" ? "#e8e8f0" : it.color ?? "#e04030";
            ctx.fillStyle = color;
            ctx.globalAlpha = 0.18 + 0.17 * pulse;
            for (const [x, y] of it.tiles) ctx.fillRect(x * t - t / 2, y * t - t / 2, t, t);
            ctx.globalAlpha = 0.85;
            ctx.strokeStyle = color;
            ctx.lineWidth = px * 2;
            for (const [x, y] of it.tiles) ctx.strokeRect(x * t - t / 2 + 1, y * t - t / 2 + 1, t - 2, t - 2);
        }
        // 움직임 화살표는 칸 표시 위에
        for (const e of enemies) {
            if (e.ai.intent === undefined) continue;
            const v = EnemyMoves.preview(e.ai, p);
            if (!v) continue;
            const pts = [[e.x * t, e.y * t], ...v.path.map(([x, y]) => [x * t, y * t])];
            if (v.hit) pts.push([v.hit.x * t, v.hit.y * t]);
            if (pts.length < 2) continue;
            this.arrow(ctx, pts, t, px, v.rush, !!v.hit, v.jump);
        }
        ctx.globalAlpha = 1;
    }

    // pts: 월드 좌표 점들 (첫 점 = 적). 끝은 화살촉. hit면 끝 칸 가장자리에서 멈춘다
    arrow(ctx, pts, t, px, rush, hit, jump) {
        pts = pts.map((q) => q.slice());
        const n = pts.length;
        // 시작은 적 몸에서 조금 떨어진 곳부터, 끝은 칠 칸이면 그 칸 가장자리까지
        const trim = (a, b, d) => {
            const dx = b[0] - a[0];
            const dy = b[1] - a[1];
            const len = Math.hypot(dx, dy) || 1;
            a[0] += dx / len * d;
            a[1] += dy / len * d;
        };
        trim(pts[0], pts[1], t * 0.3);
        if (hit) trim(pts[n - 1], pts[n - 2], t * 0.42);
        const w = rush ? px * 3 : px * 1.6;
        const head = rush ? t * 0.32 : t * 0.24;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        // 바깥선 (땅 색과 구분)
        for (const pass of [0, 1]) {
            ctx.globalAlpha = pass ? (rush ? 0.95 : 0.8) : 0.45;
            ctx.strokeStyle = pass ? (rush ? IntentOverlay.RUSH : IntentOverlay.MOVE) : "#140c08";
            ctx.lineWidth = pass ? w : w + px * 2;
            ctx.beginPath();
            ctx.moveTo(pts[0][0], pts[0][1]);
            if (jump) {
                // 덮치기: 위로 휘는 곡선 (월드 y는 위가 +)
                const [ax, ay] = pts[0];
                const [bx, by] = pts[n - 1];
                ctx.quadraticCurveTo((ax + bx) / 2, Math.max(ay, by) + t * 0.9, bx, by);
            } else for (let i = 1; i < n; i++) ctx.lineTo(pts[i][0], pts[i][1]);
            ctx.stroke();
        }
        // 화살촉
        const [bx, by] = pts[n - 1];
        let [ax, ay] = pts[n - 2];
        if (jump) [ax, ay] = [(pts[0][0] + bx) / 2, Math.max(pts[0][1], by) + t * 0.9];
        const ang = Math.atan2(by - ay, bx - ax);
        ctx.globalAlpha = rush ? 0.95 : 0.85;
        ctx.fillStyle = rush ? IntentOverlay.RUSH : IntentOverlay.MOVE;
        ctx.strokeStyle = "#140c08";
        ctx.lineWidth = px;
        ctx.beginPath();
        ctx.moveTo(bx + Math.cos(ang) * head * 0.4, by + Math.sin(ang) * head * 0.4);
        ctx.lineTo(bx - Math.cos(ang - 0.5) * head, by - Math.sin(ang - 0.5) * head);
        ctx.lineTo(bx - Math.cos(ang + 0.5) * head, by - Math.sin(ang + 0.5) * head);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }
}

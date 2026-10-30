// 플레이어 편 소환수 (카드로 만든다). 방을 나가면 방과 함께 사라진다.
// 소환수 (Ally): 적이 움직인 다음에 움직인다 (TurnManager). 데이터(소환 카드)가 체력·공격을 정해 넘긴다
//   soldier 해골병사 — 턴마다 가장 가까운 적에게 이동속도만큼 다가가 공격력 100% 피해를 주고 도발한다
//   totem  토템     — 움직이지 않는다. 턴마다 3칸 이내의 적을 도발한다. life턴 뒤 사라진다 (explode면 사라지거나 부서질 때 2칸 이내에 공격력 100%)
// 새 소환수: KINDS에 한 줄 + AllyAI.takeTurn에 동작
// 설치물 (Hazard): 적이 움직인 다음 tick
//   barrier 장벽 / mine 지뢰 / field 장판 (지금 카드에는 안 쓰지만 방 구조가 그대로 지원한다)
class Ally extends Entity {
    static KINDS = {
        soldier: { name: "해골병사", sprite: "skeleton", hp: 10, attack: 3, moves: 1 },
        totem: { name: "토템", sprite: "totem", hp: 10, attack: 0, moves: 0, life: 3 }
    };

    // data: { hp, attack, moves, life, defense, explode }
    constructor(x, y, kind, data = {}) {
        const k = Ally.KINDS[kind];
        super(x, y, k.sprite, {
            type: kind, name: k.name,
            // 소환수 체력은 최소 1 (소환하자마자 사라지지 않게). % 계산이 0이어도 1
            stats: { maxHp: Math.max(1, data.hp ?? k.hp), attack: data.attack ?? k.attack, defense: data.defense ?? 0 },
            tags: ["creature", "ally", kind],
            ai: new AllyAI()
        });
        this.kind = kind;
        this.moves = data.moves ?? k.moves;
        this.life = data.life ?? k.life ?? 0;
        this.explode = !!data.explode;
        this.ended = false;
    }

    get attitude() {
        return "friendly";
    }

    // 소환수에게도 방어도는 없다 (피해를 그대로 받는다)
    absorb(damage) {
        return damage;
    }

    // 사라지거나 부서질 때 (붉은 토템: 2칸 이내의 적에게 공격력 100% 피해). 연출 배열
    finish(world) {
        if (this.ended) return [];
        this.ended = true;
        const anims = [];
        if (this.explode && this.stats.attack > 0) {
            const tiles = EnemyMoves.around(world, this.x, this.y, 2);
            anims.push(new AreaFlashAnim(world, tiles, "#ff8a30", 0.3));
            MessageLog.add(`${josa(this.displayName, "이가")} 폭발했다!`, "#ff9a50");
            for (const [x, y] of tiles) for (const o of world.entitiesAt(x, y)) {
                if (o instanceof Monster && o.alive) anims.push(...Combat.hit(o, this.stats.attack, Player.current, world, "heat"));
            }
        }
        return anims;
    }
}

class AllyAI extends AI {
    get attitude() {
        return "friendly";
    }

    isHostileTo(other) {
        return other instanceof Monster || other.attitude === "hostile";
    }

    nearestEnemy(world) {
        let best = null;
        let bd = Infinity;
        for (const o of world.hostiles(Player.current)) {
            const d = this.distance(this.entity, o);
            if (d < bd) {
                bd = d;
                best = o;
            }
        }
        return best;
    }

    // 토템: 3칸 이내의 적을 도발한다. 도발한 적들 연출
    taunt(world, range = 3) {
        const e = this.entity;
        const anims = [];
        for (const o of world.hostiles(Player.current)) {
            if (this.distance(e, o) <= range && o.ai && o.ai.taunted) {
                o.ai.taunted(e, 1);
                anims.push(new PopupAnim(o, "도발", Status.DEFS.taunt.color));
            }
        }
        return anims;
    }

    // { anims } — TurnManager가 부른다
    takeTurn(ctx, turns) {
        const e = this.entity;
        const w = ctx.world;
        const anims = [];
        anims.push(...Status.tickStart(e, w));
        if (!e.alive) return { anims };
        if (e.kind === "totem") anims.push(...this.taunt(w));
        else if (e.kind === "soldier" && !Status.get(e, "stun")) {
            const foe = this.nearestEnemy(w);
            if (foe) {
                // 이동속도만큼 다가가 (막히면 멈춘다) 닿았으면 공격 + 도발
                const n = Status.speed(e, e.moves);
                for (let i = 0; i < n && e.alive && foe.alive && this.distance(e, foe) > 1; i++) {
                    const dir = this.stepToward(foe);
                    const res = dir ? turns.perform(e, dir) : null;
                    if (!res) break;
                    anims.push(...res);
                    if (turns.lastWasAttack) break;
                }
                if (e.alive && foe.alive && this.distance(e, foe) === 1) {
                    if (e.x !== foe.x) e.flipX = foe.x < e.x;
                    e.applyFlip();
                    anims.push(...Combat.strike(e, foe, w, e.stats.attack, null));
                    if (foe.alive && foe.ai && foe.ai.taunted) {
                        foe.ai.taunted(e, 1);
                        anims.push(new PopupAnim(foe, "도발", Status.DEFS.taunt.color));
                    }
                }
            }
        }
        Status.tickPoison(e, w).forEach((a) => anims.push(a));
        Status.tickTurns(e);
        if (e.alive && e.life > 0 && --e.life === 0) {
            MessageLog.add(`${josa(e.displayName, "이가")} 사라졌다`, "#a0b8e8");
            anims.push(...e.finish(w));
            e.stats.hp = 0;
            Combat.kill(e, null, w);
            anims.push(new HitAnim(e, 0, true));
        }
        return { anims };
    }
}

for (const kind of Object.keys(Ally.KINDS)) EntityTypes.register(kind, (x, y, d) => new Ally(x, y, kind, d));

// 부서진 토템도 터진다 (붉은 토템). 연출은 못 넣으니 효과만 바로 준다
Events.on(GameEvent.KILLED, ({ target, world }) => {
    if (target instanceof Ally && target.explode && !target.ended && world) {
        const anims = target.finish(world);
        const q = world.run ? world.run.queue : null;
        if (q) for (const a of anims) q.play(a);
    }
});

// ---------- 설치물 ----------
class Hazard extends Entity {
    // kind: barrier | mine | field. data: { life, dmg, status, n, color }
    constructor(x, y, kind, data = {}) {
        const barrier = kind === "barrier";
        super(x, y, barrier ? "barrier" : kind === "mine" ? "mine" : "field", {
            type: kind,
            name: { barrier: "장벽", mine: "지뢰", field: data.name ?? "장판" }[kind],
            stats: { maxHp: data.hp ?? 12, attack: 0, defense: 0 },
            solid: barrier,
            tags: ["hazard"]
        });
        this.kind = kind;
        this.life = data.life ?? 0;
        this.dmg = data.dmg ?? 0;
        this.statusKey = data.status ?? null;
        this.n = data.n ?? 1;
        this.color = data.color ?? "#9ce05c";
        this.invulnerable = !barrier;
        this.isHazard = true;
    }

    start() {
        super.start();
        if (this.kind === "field" && this.sr) this.sr.opacity = 0; // 장판은 HazardOverlay가 그린다
        if (this.sr) this.sr.orderInLayer = this.kind === "barrier" ? 2 : 1;
    }

    get attitude() {
        return "neutral";
    }

    // 적이 움직인 다음
    tick(ctx) {
        const w = ctx.world;
        const anims = [];
        if (this.kind === "mine") {
            // 그 칸이나 바로 옆(상하좌우)에 적이 오면 터진다
            const victim = [[0, 0], ...Entity.DIRS].map(([dx, dy]) => w.entityAt(this.x + dx, this.y + dy)).find((o) => o instanceof Monster && o.alive);
            if (victim) anims.push(...this.explode(w));
        } else if (this.kind === "field") {
            for (const o of w.entitiesAt(this.x, this.y)) {
                if (!(o instanceof Monster) || !o.alive) continue;
                if (this.statusKey) {
                    Status.add(o, this.statusKey, this.n);
                    anims.push(new PopupAnim(o, `${Status.DEFS[this.statusKey].name}+${this.n}`, Status.DEFS[this.statusKey].color));
                }
                if (this.dmg) anims.push(...Combat.hit(o, this.dmg, null, w, "heat"));
            }
        }
        if (this.alive && this.world && this.life > 0 && --this.life === 0) this.remove(w);
        return anims;
    }

    explode(w) {
        const tiles = EnemyMoves.square(w, this.x, this.y, 1);
        const anims = [new AreaFlashAnim(w, tiles, "#ff8a30")];
        MessageLog.add(`지뢰가 터졌다! ${this.dmg} 피해`, "#ff9a50");
        this.remove(w);
        for (const [x, y] of tiles) for (const o of w.entitiesAt(x, y)) if (o instanceof Monster && o.alive) anims.push(...Combat.hit(o, this.dmg, Player.current, w, "heat"));
        return anims;
    }

    remove(w) {
        if (!this.world) return;
        this.stats.hp = 0;
        w.removeEntity(this);
        if (this.gameObject) this.gameObject.destroy();
    }
}

EntityTypes.register("barrier", (x, y, d) => new Hazard(x, y, "barrier", d));
EntityTypes.register("mine", (x, y, d) => new Hazard(x, y, "mine", d));
EntityTypes.register("field", (x, y, d) => new Hazard(x, y, "field", d));

// 장판을 땅에 그린다 (반투명 색 칸)
class HazardOverlay extends Renderer {
    constructor(run) {
        super();
        this.run = run;
        this.sortingLayer = "Default";
        this.orderInLayer = 1;
    }

    getBounds() {
        return null;
    }

    render(ctx, camera) {
        const room = this.run.room;
        if (!room || this.run.state !== "room") return;
        const t = room.tileSize;
        const m = camera.viewMatrix;
        ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 300);
        for (const h of room.hazards ?? []) {
            if (h.kind !== "field" || !h.world) continue;
            ctx.globalAlpha = 0.25 + 0.1 * pulse;
            ctx.fillStyle = h.color;
            ctx.fillRect(h.x * t - t / 2, h.y * t - t / 2, t, t);
            ctx.globalAlpha = 0.6;
            ctx.fillRect(h.x * t - 3, h.y * t - 1 + pulse * 2, 2, 2);
            ctx.fillRect(h.x * t + 2, h.y * t + 3 - pulse * 2, 2, 2);
        }
        ctx.globalAlpha = 1;
    }
}

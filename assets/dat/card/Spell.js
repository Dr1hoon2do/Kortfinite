// 스킬 카드(주문) 체계. 주문 종류(파이어볼, 마법 화살 …)는 정해져 있고, 카드 한 장마다 비용이 다르다.
//
// 카드 한 장의 데이터 (card.data):
//   cost:    { r: 자원, n: 양 } — 카드마다 고정. 상점·던전에서 나올 때 무작위로 정해진다 (Spell.roll)
//   sockets: 젬 칸 수 0~3 (Gem.js). 1칸까지는 흔하고, 2칸은 드물고, 3칸은 아주 드물다
//   gems:    끼운 젬들 (젬 카드의 저장 형태 { d, x })
//
// 위력 계산 (모든 주문 공통):
//   포인트 P = 비용의 양 × 자원 가치(VALUE) + 증폭 젬
//     자원 가치: 마나 1, 체력 2, 쉼 1 (쉼 n = n턴 동안 카드를 못 뽑는다)
//       → "마나 6 = 체력 3 = 쉼 6"
//   효과 수치: 능력치를 쓰는 주문은 floor(능력치 × (base + k × P)), 아니면 floor(base + k × P) (calc로 정한다)
//     예) 파이어볼 = 공격력 × (40% + 15% × P) → 공격력 5, 마나 6이면 floor(5 × 1.3) = 6 피해
//   절약 젬은 내는 비용만 줄이고 위력(P)은 그대로 둔다.
// 주문은 기력을 쓰지 않는다 (비용은 카드에 적힌 자원만).
//
// 값: 주문 기본 값 × PRICE_GROWTH^P × 젬 칸 배수 + 끼운 젬 값. 포인트가 높을수록, 칸이 많을수록 지수로 오른다.
//
// 새 주문: Spell.register(id, spec)
//   spec: name, frame, price, resources(쓸 수 있는 자원들), points [최소, 최대], base, k, min?, max?, calc(P, user)?,
//         target(v) → { range, radius, taps?, verb? } | null, area(범위 피해인가), damage(피해 주문인가),
//         text(v, target) 긴 설명, short(v, target) 카드 위 짧은 설명, effect(ctx, v, target) → 연출 단계 | null,
//         legacy: 카드 데이터 없이 만든 카드(new Card(id))의 비용
class Spell {
    static RESOURCES = {
        mana: { name: "마나", value: 1 },
        hp: { name: "체력", value: 2 }, // 체력은 아껴야 하는 자원이라 체력 비용 카드는 위력이 크다
        rest: { name: "쉼", value: 1 }
    };
    // 카드를 굴릴 때 자원이 뽑힐 비중 (쉼은 드물게)
    static WEIGHT = { mana: 1.4, hp: 1, rest: 0.4 };
    static PRICE_GROWTH = 1.12;
    static SOCKET_ODDS = [0.5, 0.42, 0.07, 0.01]; // 젬 칸 0, 1, 2, 3칸이 나올 확률
    static SOCKET_PRICE = [1, 1.5, 3, 7];         // 젬 칸 수에 따른 값 배수
    static kinds = new Map();

    static register(id, spec) {
        const s = { min: 1, max: 99, base: 1, k: 1, area: false, damage: false, ...spec };
        Spell.kinds.set(id, s);
        CardDef.register(id, {
            type: "skill", name: s.name, spell: true, rarity: s.rarity ?? "uncommon",
            description: "", price: s.price, sprite: "cards", frame: s.frame,
            use: (ctx) => Spell.cast(ctx)
        });
    }

    static spec(card) {
        return Spell.kinds.get(card.defId);
    }

    // 카드 데이터 (데이터 없이 만든 카드는 그 주문의 기본 비용 legacy)
    static data(card) {
        const s = Spell.spec(card);
        const d = card.data ?? {};
        return { cost: d.cost ?? s.legacy, sockets: d.sockets ?? 0, gems: d.gems ?? [] };
    }

    // 끼운 젬들 [{ id, v }]
    static gems(card) {
        return Spell.data(card).gems.map((g) => ({ id: CardDef.resolve(g.d), v: Gem.valueOf(g) }));
    }

    static gemSum(card, id) {
        return Spell.gems(card).reduce((s, g) => s + (g.id === id ? g.v : 0), 0);
    }

    // 실제로 내는 비용 { r, n } (절약 젬 적용)
    static payCost(card) {
        const { cost } = Spell.data(card);
        const thrift = cost.r === "mana" ? Spell.gemSum(card, "gem_thrift") : 0; // 마나 젬은 마나 비용만 (0까지)
        return { r: cost.r, n: Math.max(0, cost.n - thrift) };
    }

    // Player.canPay / pay에 넘기는 형태 { mana: 5 } 등
    static costObject(card) {
        const c = Spell.payCost(card);
        return { [c.r]: c.n };
    }

    // 포인트: 원래 비용(절약 전) × 자원 가치 + 증폭 젬
    static points(card) {
        const { cost } = Spell.data(card);
        return cost.n * Spell.RESOURCES[cost.r].value + Spell.gemSum(card, "gem_power");
    }

    // 효과 수치 (피해, 회복량, 뽑는 장수, 거리 …). user의 능력치를 쓰는 주문은 user (기본: 지금 플레이어)
    static value(card, user = Player.current) {
        const s = Spell.spec(card);
        const P = Spell.points(card);
        const raw = s.calc ? s.calc(P, user ?? Spell.BASE_USER) : s.base + s.k * P;
        const v = Math.floor(raw + 1e-9);
        return Math.max(s.min, Math.min(s.max, v));
    }

    // 플레이어가 없을 때(카드 미리보기) 쓰는 기본 능력치
    static BASE_USER = { stats: { attack: 5, defense: 5 }, speed: 3 };

    // 칸을 고르는 주문이면 { range, radius, ... }
    static target(card, user = Player.current) {
        const s = Spell.spec(card);
        if (!s.target) return null;
        return { radius: 0, ...s.target(Spell.value(card, user), user ?? Spell.BASE_USER) };
    }

    // 범위 젬이 닿는 반경 (서리 폭발처럼 칸을 고르지 않는 범위 주문)
    static radius(card, base) {
        return base;
    }

    // 원거리 젬이 붙는가 (칸을 골라 멀리 쏘는 주문)
    static ranged(card) {
        const s = Spell.spec(card);
        return !!s.target && !s.adjacent;
    }

    static price(card) {
        const s = Spell.spec(card);
        const { sockets, gems } = Spell.data(card);
        const base = s.price * Spell.PRICE_GROWTH ** Spell.points(card) * Spell.SOCKET_PRICE[sockets];
        return Math.max(1, Math.floor(base + gems.reduce((sum, g) => sum + Gem.priceOf(g), 0)));
    }

    // "마나 5" / "체력 3" / "쉼 3" / "비용 없음"
    static costText(cost) {
        if (!cost.n) return "비용 없음";
        return `${Spell.RESOURCES[cost.r].name} ${cost.n}`;
    }

    static describe(card) {
        const s = Spell.spec(card);
        const v = Spell.value(card);
        const t = Spell.target(card);
        const { cost, sockets, gems } = Spell.data(card);
        const lines = [s.text(v, t, card)];
        const pay = Spell.payCost(card);
        const thrift = pay.n !== cost.n ? ` (원래 ${cost.n})` : "";
        const gemPoints = Spell.gemSum(card, "gem_power");
        lines.push(`비용 ${Spell.costText(pay)}${thrift} · 위력 ${Spell.fmt(Spell.points(card))}${gemPoints ? ` (젬 +${gemPoints})` : ""}`);
        if (cost.r === "rest") lines.push(`(쉼 ${pay.n}: 쓰면 ${pay.n}턴 동안 카드를 뽑지 못한다)`);
        if (sockets) {
            lines.push(`젬 칸 ${gems.length}/${sockets}`);
            for (const g of gems) lines.push("◆ " + Gem.lineOf(g));
        }
        return lines.join("\n");
    }

    // 한 줄 효과 ("5 피해 · 반경 1 · 5칸")
    static short(card) {
        return Spell.spec(card).short(Spell.value(card), Spell.target(card), card);
    }

    static summary(card) {
        const { sockets, gems } = Spell.data(card);
        const text = Spell.short(card);
        return sockets ? `${text}\n젬 ${gems.length}/${sockets}` : text;
    }

    static fmt(n) {
        return Number.isInteger(n) ? String(n) : n.toFixed(1);
    }

    // 무작위 카드 한 장: 자원과 양, 젬 칸
    static roll(id, rng = Math.random) {
        const s = Spell.kinds.get(id);
        const total = s.resources.reduce((sum, r) => sum + Spell.WEIGHT[r], 0);
        let x = rng() * total;
        let r = s.resources[s.resources.length - 1];
        for (const res of s.resources) {
            if (x < Spell.WEIGHT[res]) {
                r = res;
                break;
            }
            x -= Spell.WEIGHT[res];
        }
        const p = s.points[0] + Math.floor(rng() * (s.points[1] - s.points[0] + 1));
        const n = p === 0 ? 0 : Math.max(1, Math.round(p / Spell.RESOURCES[r].value));
        const card = new Card(id);
        card.data = { cost: { r, n }, sockets: Spell.rollSockets(rng), gems: [] };
        return card;
    }

    static rollSockets(rng = Math.random) {
        let x = rng();
        for (let i = 0; i < Spell.SOCKET_ODDS.length; i++) {
            if (x < Spell.SOCKET_ODDS[i]) return i;
            x -= Spell.SOCKET_ODDS[i];
        }
        return 0;
    }

    // ---------- 쓰기 ----------
    // CardSystem.use가 부른다 (비용 확인·지불은 거기서). 효과 + 젬 추가 효과(환원, 치유)
    static cast(ctx) {
        const card = ctx.card;
        const s = Spell.spec(card);
        ctx.spell = {};
        const steps = s.effect(ctx, Spell.value(card, ctx.user), Spell.target(card, ctx.user));
        if (!steps) return null;
        const extra = [];
        const refund = Spell.gemSum(card, "gem_refund");
        if (refund) {
            const u = ctx.user;
            const n = Math.min(refund, u.maxMana - u.mana);
            if (n > 0) {
                u.mana += n;
                MessageLog.add(`젬(환원): 마나 ${n} 회복`, "#7cb0f0");
                extra.push(new PopupAnim(u, "+" + n, "#7cb0f0"));
            }
        }
        const heal = Spell.gemSum(card, "gem_heal");
        if (heal) {
            const s = ctx.user.stats;
            const n = Math.min(heal, s.maxHp - s.hp);
            if (n > 0) {
                s.hp += n;
                MessageLog.add(`젬(치유): 체력 ${n} 회복`, "#7cd47c");
                extra.push(new PopupAnim(ctx.user, "+" + n, "#7cd47c"));
            }
        }
        if (extra.length) steps.push(extra);
        return steps;
    }

    // 대상들에게 피해. 피해 유형은 주문의 element (바닥 아이템은 안 다치고 센 열이면 익는다)
    static hitAll(ctx, targets, damage) {
        const anims = [];
        const type = Spell.spec(ctx.card)?.element ?? "physical";
        for (const e of targets) anims.push(...Combat.hit(e, damage, ctx.user, ctx.world, type));
        return anims;
    }

    // "열 " / "냉기 " … (물리면 "")
    static typeName(card) {
        const el = Spell.spec(card)?.element;
        return el && el !== "physical" ? Combat.TYPES[el] + " " : "";
    }

    static inRange(user, t, range) {
        return Math.abs(t.x - user.x) + Math.abs(t.y - user.y) <= range;
    }

    static square(cx, cy, r, skipCenter = false) {
        const tiles = [];
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (!skipCenter || dx || dy) tiles.push([cx + dx, cy + dy]);
        return tiles;
    }

    // 고른 칸으로 투사체 → 범위 안 모든 엔티티(시전자 제외)에게 피해
    static blast(ctx, damage, t, { frame, color }) {
        const name = ctx.card.name;
        const at = ctx.target;
        if (!at) {
            MessageLog.add("대상 칸을 골라야 한다", "#c8b890");
            return null;
        }
        if (!Spell.inRange(ctx.user, at, t.range)) {
            MessageLog.add("사거리 밖이다", "#c8b890");
            return null;
        }
        const tiles = Spell.square(at.x, at.y, t.radius);
        const targets = [];
        for (const [x, y] of tiles) for (const e of ctx.world.entitiesAt(x, y)) if (e !== ctx.user && e.alive) targets.push(e);
        const hits = targets.length;
        const size = ctx.world.tileSize;
        const fly = new ProjectileAnim(ctx.world, "cards", frame,
            new Vector(ctx.user.x * size, ctx.user.y * size), new Vector(at.x * size, at.y * size));
        MessageLog.add(hits ? `${name}: ${hits}개 대상에게 ${damage} ${Spell.typeName(ctx.card)}피해` : `${name}: 아무것도 맞지 않았다`, "#ff9a50");
        return [[fly], [new AreaFlashAnim(ctx.world, tiles, color), ...Spell.hitAll(ctx, targets, damage)]];
    }


    static heal(ctx, amount) {
        return CardEffects.heal(ctx, amount);
    }

    static blink(ctx, t) {
        const at = ctx.target;
        const u = ctx.user;
        if (!at || !Spell.inRange(u, at, t.range) || (at.x === u.x && at.y === u.y)) {
            MessageLog.add(`${t.range}칸 안의 다른 칸을 골라야 한다`, "#c8b890");
            return null;
        }
        if (!ctx.world.isWalkable(at.x, at.y)) {
            MessageLog.add("그 칸으로는 갈 수 없다", "#c8b890");
            return null;
        }
        const from = [[u.x, u.y]];
        ctx.world.teleport(u, at.x, at.y);
        u.clearGoal && u.clearGoal();
        return [[new AreaFlashAnim(ctx.world, from, "#c8a0f8"), new AreaFlashAnim(ctx.world, [[at.x, at.y]], "#c8a0f8")]];
    }


    // 방어도 (수호)
    static ward(ctx, v, turns) {
        ctx.user.addBlock(v, turns);
        MessageLog.add(`방어도 +${v} (${turns}턴)`, "#8cc8f0");
        return [[new PopupAnim(ctx.user, "+" + v, "#8cc8f0"), new AreaFlashAnim(ctx.world, [[ctx.user.x, ctx.user.y]], "#8cc8f0")]];
    }

    // 기력 회복 (숙고). 최대를 넘지 않는다. 이미 가득하면 못 쓴다
    static energy(ctx, v) {
        const u = ctx.user;
        if (u.energy >= u.maxEnergy) {
            MessageLog.add("기력이 이미 가득하다", "#c8b890");
            return null;
        }
        const n = Math.min(v, u.maxEnergy - u.energy);
        u.energy += n;
        MessageLog.add(`기력 ${n} 회복`, "#f0d060");
        return [[new PopupAnim(u, "+" + n, "#f0d060")]];
    }

    static recall(ctx, count) {
        let n = 0;
        for (let i = 0; i < count; i++) {
            if (!ctx.cards.recall()) break;
            n++;
        }
        return n ? [] : null;
    }
}

// ---------- 주문 목록 ----------
// (지금 게임에는 주문이 없다 — 카드는 data/CardImpl.js가 공방 데이터에서 만든다. 체계는 그대로 남겨 둔다)

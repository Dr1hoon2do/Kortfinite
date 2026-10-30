// 카드 만들기 도구: 카드 한 장을 한 줄로 만든다. 효과는 작은 조각(Fx)을 이어 붙인 글로 적고, 설명글은 저절로 만들어진다.
//
//   CardKit.card("venom_stab", { name: "독 찌르기", rarity: "common", cost: "1", tgt: "adj",
//                                fx: "dmg:80; poison:3", icon: "dagger", color: "#9ce05c" });
//
// cost: "1" 기력 1 · "0" 공짜 · "m4" 마나 4 · "h3" 체력 3 · "g15" 돈 15 · "r1" 쉼 1
// tgt (대상, TARGETS):
//   self(기본) 고르지 않음 · adj 바로 옆 적 · line:n 일직선 n칸 안의 첫 적 · shot:n n칸 안의 적 하나(날린다)
//   area:n:r n칸 안 칸을 중심으로 반경 r 안의 적 모두 · around 주변 8칸의 적 모두 · all 방의 적 모두 · rand:k 무작위 적 k번
//   tile:n n칸 안의 빈칸 (소환·설치) · walk:n 걸어서 n칸 이동 · tp:n n칸 안의 빈칸으로 순간이동 · charge:n 일직선으로 달려가 첫 적 바로 앞까지
// fx: "이름:값:값; 이름:값" — 순서대로 한다. 앞에 "조건>"을 붙이면 조건이 맞을 때만 (CONDS):
//   kill> 이 카드로 적을 쓰러뜨렸으면 · low> 내 체력이 절반 이하 · block> 방어도가 있으면 · pois> 대상이 독에 걸렸으면
//   clear> 이 방을 정리하면 (방이 끝날 때 한다. 영구 능력치 등)
// 효과 (FX): 적에게(foe) 하는 것은 대상들 하나하나에, 나머지는 한 번. 새 효과는 FX에 한 줄 { foe?, run, text }.
// exhaust: true면 쓰면 이 방에서는 사라진다 (소멸, 방을 나가면 돌아온다). desc: 설명글을 직접 쓸 때, short: 짧은 설명을 직접 쓸 때
class CardKit {
    // 아이콘 틀 순서 (images/card_glyphs.png, 생성기 gen_card_glyphs.py와 같아야 한다)
    static GLYPHS = ["sword", "axe", "dagger", "spear", "arrow", "fist", "shield", "heart", "potion", "skull", "flame", "drop", "bolt",
        "chain", "down", "crack", "boot", "wing", "star", "spike", "coin", "card", "cards", "cycle", "bomb", "mine", "wall",
        "totem", "paw", "bone", "blob", "book", "plus", "wind", "magnet", "crown", "eye", "hammer", "swirl", "claw"];

    static list = []; // 만든 카드 정의 (아이콘 시트 순서)

    // ---------- 등록 ----------
    static card(id, spec) {
        if (CardDef.get(id) || (typeof Spell !== "undefined" && Spell.kinds.has(id))) throw new Error(`CardKit: 이미 있는 카드 id ${id}`);
        const fx = CardKit.parse(spec.fx ?? "");
        const [tname, ...targs] = (spec.tgt ?? "self").split(":");
        const T = CardKit.TARGETS[tname];
        if (!T) throw new Error(`CardKit: 모르는 대상 ${spec.tgt} (${id})`);
        const tg = targs.map(Number);
        const frame = CardKit.list.length;
        const def = {
            type: "skill", price: 0, sprite: "kicons", frame, kit: true,
            name: spec.name, rarity: spec.rarity, exhaust: !!spec.exhaust, kitSpec: { cost: spec.cost ?? "1", tgt: spec.tgt ?? "self", fx: spec.fx ?? "" },
            cost: CardKit.cost(spec.cost ?? "1"),
            icon: spec.icon ?? "card", color: spec.color ?? "#e8d9b8",
            target: T.pick ? () => T.pick(tg, Player.current) : null,
            text: () => CardKit.describe(T, tg, fx, spec),
            short: () => spec.short ?? [T.brief ? T.brief(tg) : "", CardKit.brief(fx)].filter(Boolean).join(" · "),
            use: (ctx) => CardKit.run(ctx, T, tg, fx)
        };
        CardDef.register(id, def);
        CardKit.list.push(CardDef.get(id));
    }

    static cost(s) {
        const kinds = { m: "mana", h: "hp", g: "gold", r: "rest" };
        const k = kinds[s[0]];
        return k ? { [k]: Number(s.slice(1)) } : { energy: Number(s) };
    }

    // "kill>gold:5; dmg:120" → [{ cond: "kill", name: "gold", args: [5] }, ...]
    static parse(text) {
        return text.split(";").map((s) => s.trim()).filter(Boolean).map((s) => {
            let cond = null;
            const gt = s.indexOf(">");
            if (gt >= 0) {
                cond = s.slice(0, gt).trim();
                s = s.slice(gt + 1).trim();
            }
            const [name, ...args] = s.split(":");
            if (!CardKit.FX[name]) throw new Error(`CardKit: 모르는 효과 ${name}`);
            if (cond && cond !== "clear" && !CardKit.CONDS[cond]) throw new Error(`CardKit: 모르는 조건 ${cond}`);
            return { cond, name, args: args.map((a) => (isNaN(Number(a)) ? a : Number(a))) };
        });
    }

    // ---------- 수치 ----------
    static atk(user = Player.current) {
        return user ? user.stats.attack : Player.BASE_ATTACK;
    }

    static dmg(pct, user = Player.current) {
        return Math.max(1, Math.floor(CardKit.atk(user) * pct / 100 + 1e-9));
    }

    static blk(pct, user = Player.current) {
        const d = user ? user.stats.defense : Player.BASE_DEFENSE;
        return Math.max(1, Math.floor(d * pct / 100 + 1e-9));
    }

    static isFoe(user, e) {
        return e && e !== user && e.alive && !e.invulnerable && e.ai && e.attitude === "hostile";
    }

    static foesIn(world, user, tiles) {
        const out = [];
        for (const [x, y] of tiles) {
            const e = world.entityAt(x, y);
            if (CardKit.isFoe(user, e) && !out.includes(e)) out.push(e);
        }
        return out;
    }

    static squareTiles(x, y, r) {
        const t = [];
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) t.push([x + dx, y + dy]);
        return t;
    }

    static freeTiles(world, user, n) {
        const out = [];
        for (let dy = -n; dy <= n; dy++) for (let dx = -n; dx <= n; dx++) {
            const x = user.x + dx;
            const y = user.y + dy;
            if ((dx || dy) && Math.abs(dx) + Math.abs(dy) <= n && world.isWalkable(x, y) && !world.entitiesAt(x, y).some((e) => e.isHazard)) out.push(`${x},${y}`);
        }
        return out;
    }

    static px(world, e) {
        const t = world.tileSize;
        return new Vector(e.x * t, e.y * t);
    }

    static say(text) {
        MessageLog.add(text, "#c8b890");
        return null;
    }

    // ---------- 대상 ----------
    // pick(args, player): 칸 고르기 설정 (없으면 바로 쓴다) / resolve(ctx, args): { foes, tile } 또는 null(못 씀) / text(args)
    static TARGETS = {
        self: {
            resolve: (ctx) => ({ foes: [], tile: { x: ctx.user.x, y: ctx.user.y } }),
            text: () => ""
        },
        adj: {
            pick: () => ({ range: 1, radius: 0, line: true, taps: 1, verb: "공격", color: "#d8443c" }),
            resolve: (ctx) => CardKit.lineFoe(ctx, 1),
            text: () => "바로 옆 적에게"
        },
        line: {
            brief: ([n]) => `${n}칸`,
            pick: ([n]) => ({ range: n, radius: 0, line: true, taps: 1, verb: "공격", color: "#d8443c" }),
            resolve: (ctx, [n]) => CardKit.lineFoe(ctx, n),
            text: ([n]) => `일직선 ${n}칸 안의 첫 적에게`
        },
        shot: {
            brief: ([n]) => `${n}칸`,
            pick: ([n]) => ({ range: n, radius: 0, taps: 1, verb: "쏘기", color: "#e8a040" }),
            resolve: (ctx) => {
                const e = ctx.target && ctx.world.entityAt(ctx.target.x, ctx.target.y);
                if (!CardKit.isFoe(ctx.user, e)) return CardKit.say("적이 있는 칸을 골라야 한다");
                ctx.fly = true;
                return { foes: [e], tile: { x: e.x, y: e.y } };
            },
            text: ([n]) => `${n}칸 안의 적 하나에게`
        },
        area: {
            brief: ([n, r]) => `범위 ${r * 2 + 1}×${r * 2 + 1}`,
            pick: ([n, r]) => ({ range: n, radius: r, taps: 2, verb: "시전", color: "#ff8a30" }),
            resolve: (ctx, [n, r]) => {
                if (!ctx.target) return CardKit.say("칸을 골라야 한다");
                const tiles = CardKit.squareTiles(ctx.target.x, ctx.target.y, r);
                ctx.flash = tiles;
                return { foes: CardKit.foesIn(ctx.world, ctx.user, tiles), tile: ctx.target };
            },
            text: ([n, r], foe) => (foe ? `${n}칸 안의 칸을 골라 ${r * 2 + 1}×${r * 2 + 1} 안의 적 모두에게` : `${n}칸 안의 칸을 골라`)
        },
        around: {
            brief: () => "주변",
            resolve: (ctx) => {
                const u = ctx.user;
                const tiles = CardKit.squareTiles(u.x, u.y, 1);
                const foes = CardKit.foesIn(ctx.world, u, tiles);
                if (!foes.length) return CardKit.say("주변에 적이 없다");
                ctx.flash = tiles;
                return { foes, tile: { x: u.x, y: u.y } };
            },
            text: () => "주변 8칸의 적 모두에게"
        },
        all: {
            brief: () => "모두",
            resolve: (ctx) => {
                const foes = ctx.world.hostiles(ctx.user).filter((e) => !e.invulnerable);
                if (!foes.length) return CardKit.say("적이 없다");
                return { foes, tile: { x: ctx.user.x, y: ctx.user.y } };
            },
            text: () => "방의 적 모두에게"
        },
        rand: {
            brief: ([k]) => `무작위 ${k}`,
            resolve: (ctx, [k]) => {
                const all = ctx.world.hostiles(ctx.user).filter((e) => !e.invulnerable);
                if (!all.length) return CardKit.say("적이 없다");
                const foes = [];
                const rng = ctx.world.rng ?? Math.random;
                for (let i = 0; i < k; i++) foes.push(all[Math.floor(rng() * all.length)]);
                ctx.fly = true;
                return { foes, tile: { x: ctx.user.x, y: ctx.user.y } };
            },
            text: ([k]) => `무작위 적에게 ${k}번`
        },
        tile: {
            pick: ([n], p) => ({ range: n, radius: 0, taps: 1, verb: "놓기", color: "#7cd47c", tiles: (w) => CardKit.freeTiles(w, p, n) }),
            resolve: (ctx, [n]) => {
                const t = ctx.target;
                if (!t || !CardKit.freeTiles(ctx.world, ctx.user, n).includes(`${t.x},${t.y}`)) return CardKit.say(`${n}칸 안의 빈칸을 골라야 한다`);
                return { foes: [], tile: t };
            },
            text: ([n]) => `${n}칸 안의 빈칸에`
        },
        walk: {
            brief: ([n]) => `${n}칸 이동`,
            pick: ([n]) => ({ range: n, radius: 0, walk: true, taps: 1, verb: "이동", color: "#7cc4e8" }),
            resolve: (ctx, [n]) => {
                const steps = ActionCards.move(ctx, n);
                if (!steps) return null;
                ctx.steps.push(...steps);
                return { foes: [], tile: { x: ctx.user.x, y: ctx.user.y } };
            },
            text: ([n]) => `걸어서 ${n}칸 안의 빈칸으로 간 뒤`
        },
        tp: {
            brief: ([n]) => `순간이동 ${n}`,
            pick: ([n], p) => ({ range: n, radius: 0, taps: 1, verb: "이동", color: "#c8a0f8", tiles: (w) => CardKit.freeTiles(w, p, n) }),
            resolve: (ctx, [n]) => {
                const t = ctx.target;
                const u = ctx.user;
                if (!t || !CardKit.freeTiles(ctx.world, u, n).includes(`${t.x},${t.y}`)) return CardKit.say(`${n}칸 안의 빈칸을 골라야 한다`);
                if (u.root > 0) return CardKit.say("속박되어 움직일 수 없다");
                const from = CardKit.px(ctx.world, u);
                ctx.world.teleport(u, t.x, t.y);
                ctx.steps.push([new MoveAnim(u, from, CardKit.px(ctx.world, u), 0.1), new PopupAnim(u, "휙", "#c8a0f8")]);
                return { foes: [], tile: { x: u.x, y: u.y } };
            },
            text: ([n]) => `${n}칸 안의 빈칸으로 순간이동한 뒤`
        },
        charge: {
            brief: ([n]) => `돌진 ${n}`,
            pick: ([n]) => ({ range: n, radius: 0, line: true, taps: 1, verb: "돌진", color: "#d8443c" }),
            resolve: (ctx, [n]) => {
                const r = CardKit.lineFoe(ctx, n);
                if (!r) return null;
                const u = ctx.user;
                if (u.root > 0) return CardKit.say("속박되어 돌진할 수 없다");
                const e = r.foes[0];
                const dx = Math.sign(e.x - u.x);
                const dy = Math.sign(e.y - u.y);
                const size = ctx.world.tileSize;
                while (Math.abs(e.x - u.x) + Math.abs(e.y - u.y) > 1) {
                    const fx = u.x;
                    const fy = u.y;
                    if (!ctx.world.moveEntity(u, dx, dy)) break;
                    ctx.steps.push([new MoveAnim(u, new Vector(fx * size, fy * size), new Vector(u.x * size, u.y * size), 0.07)]);
                }
                return r;
            },
            text: ([n]) => `일직선 ${n}칸 안의 첫 적에게 달려가`
        }
    };

    static lineFoe(ctx, n) {
        const u = ctx.user;
        const t = ctx.target;
        if (!t || !ActionCards.inLine(u, t, n)) return CardKit.say(n > 1 ? `상하좌우 일직선 ${n}칸 안을 골라야 한다` : "바로 옆 칸을 골라야 한다");
        const e = ActionCards.firstInLine(ctx.world, u, t, n);
        if (!CardKit.isFoe(u, e)) return CardKit.say("그 방향에는 칠 적이 없다");
        if (e.x !== u.x) u.flipX = e.x < u.x;
        u.applyFlip();
        return { foes: [e], tile: { x: e.x, y: e.y } };
    }

    // ---------- 조건 ----------
    static CONDS = {
        kill: { ok: (c) => c.kills > 0, text: "쓰러뜨리면" },
        low: { ok: (c) => c.user.stats.hp * 2 <= c.user.stats.maxHp, text: "내 체력이 절반 이하면" },
        block: { ok: (c) => c.user.block > 0, text: "방어도가 있으면" },
        pois: { ok: (c) => c.foes.some((f) => Status.get(f, "poison") > 0), text: "대상이 독에 걸렸으면" },
        rich: { ok: (c) => c.user.money >= 100, text: "돈이 100 G 이상이면" }
    };

    // ---------- 효과 ----------
    // run(ctx, args, foe?) → 연출 배열. text(args) → 설명 조각. brief(args) → 짧은 설명 조각 (없으면 안 보인다)
    static STATUS_FX(key, verb) {
        return {
            foe: true,
            run: (c, [n], f) => {
                Status.add(f, key, n);
                if (key === "stun" && f.ai && f.ai.plan) f.ai.intent = { kind: "stunned" };
                return [new PopupAnim(f, `${Status.DEFS[key].name}+${n}`, Status.DEFS[key].color)];
            },
            text: ([n]) => `${CardText.status(key, Status.DEFS[key].name + " " + n)}${verb}`,
            brief: ([n]) => CardText.status(key, `${Status.DEFS[key].name} ${n}`)
        };
    }

    static SELF_STATUS(key) {
        return {
            run: (c, [n]) => {
                Status.add(c.user, key, n);
                return [new PopupAnim(c.user, `${Status.DEFS[key].name}+${n}`, Status.DEFS[key].color)];
            },
            text: ([n]) => `내 ${CardText.status(key, Status.DEFS[key].name + " +" + n)}`,
            brief: ([n]) => CardText.status(key, `${Status.DEFS[key].name}+${n}`)
        };
    }

    static FX = {
        // 피해
        dmg: { foe: true, run: (c, [p], f) => CardKit.hit(c, f, CardKit.dmg(p, c.user)), text: ([p]) => `${CardText.stat("atk", p, CardKit.dmg(p))} 피해`, brief: ([p]) => `피해 ${CardText.tag("atk", CardKit.dmg(p))}` },
        hit: {
            foe: true,
            run: (c, [n, p], f) => {
                const out = [];
                for (let i = 0; i < n && f.alive; i++) {
                    const a = CardKit.hit(c, f, CardKit.dmg(p, c.user));
                    if (i < n - 1) {
                        c.steps.push(a);
                    } else out.push(...a);
                }
                return out;
            },
            text: ([n, p]) => `${CardText.stat("atk", p, CardKit.dmg(p))} 피해를 ${n}번`,
            brief: ([n, p]) => `피해 ${CardText.tag("atk", CardKit.dmg(p))}×${n}`
        },
        flat: { foe: true, run: (c, [n], f) => CardKit.hit(c, f, n), text: ([n]) => `${n} 고정 피해`, brief: ([n]) => `피해 ${n}` },
        bdmg: {
            foe: true,
            run: (c, [p], f) => CardKit.hit(c, f, Math.floor(c.user.block * p / 100)),
            text: ([p]) => `${CardText.verbose ? `[[def:내 방어도 ${p}%(${Math.floor((Player.current?.block ?? 0) * p / 100)})]]` : CardText.tag("def", Math.floor((Player.current?.block ?? 0) * p / 100))} 피해`,
            brief: () => `피해 ${Math.floor(Player.current?.block ?? 0)}(방어도)`
        },
        gdmg: {
            foe: true,
            run: (c, [d], f) => CardKit.hit(c, f, CardKit.atk(c.user) + Math.floor(c.user.money / d)),
            text: ([d]) => `${CardText.verbose ? `[[atk:공격력]] + [[gold:가진 돈 ${d} G마다 1]] (${CardKit.atk() + Math.floor((Player.current?.money ?? 0) / d)})` : CardText.tag("atk", CardKit.atk() + Math.floor((Player.current?.money ?? 0) / d))} 피해`,
            brief: ([d]) => `피해 ${CardKit.atk() + Math.floor((Player.current?.money ?? 0) / d)}`
        },
        hdmg: {
            foe: true,
            run: (c, [p], f) => CardKit.hit(c, f, CardKit.dmg(p * c.cards.hand.filter((k) => k.isSkill).length, c.user)),
            text: ([p]) => `패의 행동 카드 1장마다 ${CardText.stat("atk", p, CardKit.dmg(p))} 피해`,
            brief: ([p]) => `피해 ${p}%×패`
        },
        pdmg: {
            foe: true,
            run: (c, [m], f) => {
                const n = Status.get(f, "poison");
                if (!n) return [new PopupAnim(f, "독 없음", "#c8b890")];
                return CardKit.hit(c, f, n * m, "poison");
            },
            text: ([m]) => `대상의 ${CardText.status("poison")} 수치 × ${m} 피해`,
            brief: ([m]) => `독×${m} 피해`
        },
        exec: {
            foe: true,
            run: (c, [p], f) => CardKit.hit(c, f, CardKit.dmg(f.stats.hp * 2 <= f.stats.maxHp ? p * 2 : p, c.user)),
            text: ([p]) => `${CardText.stat("atk", p, CardKit.dmg(p))} 피해, 대상 체력이 절반 이하면 2배`,
            brief: ([p]) => `피해 ${CardText.tag("atk", CardKit.dmg(p))} (빈사 2배)`
        },
        drain: {
            foe: true,
            run: (c, [p], f) => {
                const hp = f.stats.hp;
                const out = CardKit.hit(c, f, CardKit.dmg(p, c.user));
                const got = Math.ceil((hp - f.stats.hp) / 2);
                if (got > 0) out.push(...CardKit.heal(c.user, got));
                return out;
            },
            text: ([p]) => `${CardText.stat("atk", p, CardKit.dmg(p))} 피해, 준 피해의 절반만큼 [[hp:체력]] 회복`,
            brief: ([p]) => `흡혈 ${CardText.tag("atk", CardKit.dmg(p))}`
        },
        // 위치
        push: { foe: true, run: (c, [n], f) => CardKit.shove(c, f, n, 1), text: ([n]) => `${n}칸 밀어냄 (벽·적에 부딪히면 3 피해)`, brief: ([n]) => `밀기 ${n}` },
        pull: { foe: true, run: (c, [n], f) => CardKit.shove(c, f, n, -1), text: ([n]) => `${n}칸 끌어당김`, brief: ([n]) => `당기기 ${n}` },
        swap: {
            foe: true,
            run: (c, a, f) => {
                const u = c.user;
                const w = c.world;
                const pu = CardKit.px(w, u);
                const pf = CardKit.px(w, f);
                w.swapEntities(u, f);
                return [new MoveAnim(u, pu, pf), new MoveAnim(f, pf, pu)];
            },
            text: () => "대상과 자리를 바꿈",
            brief: () => "자리 바꾸기"
        },
        back: {
            run: (c, [n]) => {
                const u = c.user;
                const f = c.foes[0];
                if (!f) return [];
                const dx = Math.sign(u.x - f.x);
                const dy = Math.sign(u.y - f.y);
                const size = c.world.tileSize;
                for (let i = 0; i < n && u.root <= 0; i++) {
                    const fx = u.x;
                    const fy = u.y;
                    if (!c.world.moveEntity(u, dx, dy)) break;
                    c.steps.push([new MoveAnim(u, new Vector(fx * size, fy * size), new Vector(u.x * size, u.y * size))]);
                }
                return [];
            },
            text: ([n]) => `${n}칸 물러남`,
            brief: ([n]) => `후퇴 ${n}`
        },
        // 상태 이상 (적)
        poison: CardKit.STATUS_FX("poison", ""),
        burn: CardKit.STATUS_FX("burn", ""),
        weak: CardKit.STATUS_FX("weak", "턴"),
        vuln: CardKit.STATUS_FX("vuln", "턴"),
        stun: CardKit.STATUS_FX("stun", "턴"),
        root: CardKit.STATUS_FX("root", "턴"),
        // 나에게
        str: CardKit.SELF_STATUS("str"),
        thorns: CardKit.SELF_STATUS("thorns"),
        regen: CardKit.SELF_STATUS("regen"),
        self: {
            run: (c, [key, n]) => {
                Status.add(c.user, key, n);
                return [new PopupAnim(c.user, `${Status.DEFS[key].name}+${n}`, Status.DEFS[key].color)];
            },
            text: ([key, n]) => `나도 ${CardText.status(key, Status.DEFS[key].name + " " + n)}`,
            brief: ([key, n]) => `내 ${CardText.status(key, Status.DEFS[key].name + " " + n)}`
        },
        block: {
            run: (c, [p, t = 1]) => {
                const v = CardKit.blk(p, c.user);
                c.user.addBlock(v, t);
                return [new PopupAnim(c.user, `+${v}`, "#8cc8f0")];
            },
            text: ([p, t = 1]) => `${CardText.stat("def", p, CardKit.blk(p))} 방어도 ${t}턴`,
            brief: ([p]) => `방어도 ${CardText.tag("def", CardKit.blk(p))}`
        },
        armor: {
            run: (c, [v, t = 1]) => {
                c.user.addBlock(v, t);
                return [new PopupAnim(c.user, `+${v}`, "#8cc8f0")];
            },
            text: ([v, t = 1]) => `방어도 ${CardText.tag("def", v)} ${t}턴`,
            brief: ([v]) => `방어도 ${CardText.tag("def", v)}`
        },
        heal: { run: (c, [n]) => CardKit.heal(c.user, n), text: ([n]) => `체력 ${CardText.tag("hp", n)} 회복`, brief: ([n]) => `회복 ${CardText.tag("hp", n)}` },
        hurt: {
            run: (c, [n]) => {
                c.user.stats.hp = Math.max(1, c.user.stats.hp - n);
                return [new HitAnim(c.user, n, false)];
            },
            text: ([n]) => `내 체력 ${CardText.tag("hp", n)} 잃음`,
            brief: ([n]) => `체력 ${CardText.tag("hp", "-" + n)}`
        },
        cleanse: { run: (c) => (Status.cleanse(c.user), [new PopupAnim(c.user, "정화", "#e8e8f0")]), text: () => "내 나쁜 상태 이상을 모두 지움", brief: () => "정화" },
        draw: {
            run: (c, [n]) => {
                const d = c.cards.draw(n);
                return d.length ? [new PopupAnim(c.user, `+${d.length}장`, "#a0b8e8")] : [];
            },
            text: ([n]) => `카드 ${n}장 뽑기`,
            brief: ([n]) => `${n}장 뽑기`
        },
        energy: {
            run: (c, [n]) => {
                c.user.energy += n;
                return [new PopupAnim(c.user, `기력+${n}`, "#f0d878")];
            },
            text: ([n]) => `기력 ${CardText.tag("energy", "+" + n)}`,
            brief: ([n]) => `기력${CardText.tag("energy", "+" + n)}`
        },
        mana: {
            run: (c, [n]) => {
                c.user.mana = Math.min(c.user.maxMana, c.user.mana + n);
                return [new PopupAnim(c.user, `마나+${n}`, "#80a8f0")];
            },
            text: ([n]) => `마나 ${CardText.tag("mana", "+" + n)}`,
            brief: ([n]) => `마나${CardText.tag("mana", "+" + n)}`
        },
        gold: {
            run: (c, [n]) => {
                c.user.money += n;
                MessageLog.add(`${n} G를 얻었다`, "#f0d878");
                return [new PopupAnim(c.user, `+${n} G`, "#f0d878")];
            },
            text: ([n]) => `돈 ${CardText.tag("gold", n + " G")}`,
            brief: ([n]) => CardText.tag("gold", `+${n} G`)
        },
        perm: {
            run: (c, [key, n]) => {
                c.user.addPerm(key, n);
                MessageLog.add(`영구히 ${CardKit.PERM[key]} +${n}!`, "#f0d878");
                return [new PopupAnim(c.user, `${CardKit.PERM[key]}+${n}`, "#f0d878")];
            },
            text: ([key, n]) => `영구히 ${CardKit.PERM[key]} +${n}`,
            brief: ([key, n]) => `영구 ${CardKit.PERM[key]}+${n}`
        },
        recall: {
            run: (c, [n]) => {
                let k = 0;
                for (let i = 0; i < n; i++) if (c.cards.recall()) k++;
                return k ? [new PopupAnim(c.user, `회수 ${k}`, "#a0b8e8")] : [];
            },
            text: ([n]) => `묘지의 가장 최근 카드 ${n}장을 패로`,
            brief: ([n]) => `회수 ${n}`
        },
        cycle: {
            run: (c, [extra = 0]) => {
                const hand = c.cards.hand.filter((k) => k.isSkill);
                for (const k of hand) c.cards.discard(k);
                const d = c.cards.draw(hand.length + extra);
                return [new PopupAnim(c.user, `${hand.length}장 → ${d.length}장`, "#a0b8e8")];
            },
            text: ([extra = 0]) => `패의 행동 카드를 모두 버리고 그만큼${extra ? ` +${extra}` : ""}장 뽑기`,
            brief: ([extra = 0]) => `패 갈기${extra ? ` +${extra}` : ""}`
        },
        add: {
            run: (c, [id, n = 1]) => {
                let k = 0;
                for (let i = 0; i < n && !c.cards.actionFull; i++) {
                    const card = new Card(id);
                    card.ensureData().temp = true;
                    card._drawn = ++c.cards.drawSeq;
                    c.cards.hand.push(card);
                    k++;
                }
                c.cards._changed();
                return k ? [new PopupAnim(c.user, `+${CardDef.get(id).name}`, "#a0b8e8")] : [];
            },
            text: ([id, n = 1]) => `[${CardDef.get(id)?.name ?? id}] 임시 카드 ${n}장을 패에 (쓰면 사라짐)`,
            brief: ([id, n = 1]) => `+${CardDef.get(id)?.name ?? id}${n > 1 ? `×${n}` : ""}`
        },
        // 방에 놓기 (고른 칸 또는 내 칸 기준)
        summon: {
            run: (c, [kind]) => {
                const t = CardKit.spot(c);
                if (!t) return [new PopupAnim(c.user, "자리 없음", "#c8b890")];
                const a = c.world.spawn(new Ally(t.x, t.y, kind, { bonus: c.user.perm?.summon ?? 0 }));
                MessageLog.add(`${josa(a.displayName, "을를")} 불렀다`, "#a0d0a0");
                return [new PopupAnim(a, "!", "#7cd47c")];
            },
            text: ([kind]) => `[${Ally.KINDS[kind].name}] 소환 (체력 ${Ally.KINDS[kind].hp}${Ally.KINDS[kind].attack ? `, 공격 ${Ally.KINDS[kind].attack}` : ""}${Ally.KINDS[kind].life ? `, ${Ally.KINDS[kind].life}턴` : ""})`,
            brief: ([kind]) => Ally.KINDS[kind].name
        },
        wall: {
            run: (c, [len = 1, life = 4]) => {
                const t = c.tile;
                const u = c.user;
                const vertical = Math.abs(t.x - u.x) >= Math.abs(t.y - u.y); // 나를 가로막는 방향으로 눕힌다
                const out = [];
                const half = Math.floor(len / 2);
                for (let i = -half; i <= len - 1 - half; i++) {
                    const x = t.x + (vertical ? 0 : i);
                    const y = t.y + (vertical ? i : 0);
                    if (!c.world.isWalkable(x, y)) continue;
                    const b = c.world.spawn(new Hazard(x, y, "barrier", { life }));
                    out.push(new PopupAnim(b, "", "#c8b890"));
                }
                if (out.length) MessageLog.add(`장벽 ${out.length}칸을 세웠다`, "#c8b890");
                return out;
            },
            text: ([len = 1, life = 4]) => `장벽 ${len}칸을 세움 (${life}턴)`,
            brief: ([len = 1]) => `장벽 ${len}칸`
        },
        mine: {
            run: (c, [p]) => {
                const t = CardKit.spot(c, true);
                if (!t) return [];
                c.world.spawn(new Hazard(t.x, t.y, "mine", { dmg: CardKit.dmg(p, c.user) }));
                MessageLog.add("지뢰를 묻었다", "#c8b890");
                return [new AreaFlashAnim(c.world, [[t.x, t.y]], "#c8b890", 0.2, false)];
            },
            text: ([p]) => `지뢰를 묻음 (적이 그 칸이나 바로 옆에 오면 3×3에 ${CardText.stat("atk", p, CardKit.dmg(p))} 피해)`,
            brief: ([p]) => `지뢰 ${CardText.tag("atk", CardKit.dmg(p))}`
        },
        field: {
            run: (c, [key, n, r = 0, life = 4]) => {
                const t = c.tile;
                const tiles = CardKit.squareTiles(t.x, t.y, r).filter(([x, y]) => EnemyMoves.walkableTile(c.world, x, y) && !c.world.entitiesAt(x, y).some((e) => e.isHazard));
                const color = Status.DEFS[key].color;
                for (const [x, y] of tiles) c.world.spawn(new Hazard(x, y, "field", { status: key, n, life, color, name: `${Status.DEFS[key].name} 장판` }));
                MessageLog.add(`${Status.DEFS[key].name} 장판을 깔았다`, color);
                return [new AreaFlashAnim(c.world, tiles, color, 0.3, false)];
            },
            text: ([key, n, r = 0, life = 4]) => `${r ? `${r * 2 + 1}×${r * 2 + 1} ` : ""}${CardText.status(key)} 장판 (${life}턴, 밟은 적에게 턴마다 ${CardText.status(key, Status.DEFS[key].name + " " + n)})`,
            brief: ([key, n, r = 0]) => `${Status.DEFS[key].name} 장판${r ? ` ${r * 2 + 1}×${r * 2 + 1}` : ""}`
        },
        boom: {
            run: (c, [p, r = 1]) => {
                const t = c.tile;
                const tiles = CardKit.squareTiles(t.x, t.y, r);
                const out = [new AreaFlashAnim(c.world, tiles, "#ff8a30")];
                for (const f of CardKit.foesIn(c.world, c.user, tiles)) out.push(...CardKit.hit(c, f, CardKit.dmg(p, c.user), "heat"));
                return out;
            },
            text: ([p, r = 1]) => `${r * 2 + 1}×${r * 2 + 1} 폭발 (${CardText.stat("atk", p, CardKit.dmg(p))} 피해)`,
            brief: ([p]) => `폭발 ${CardText.tag("atk", CardKit.dmg(p))}`
        }
    };

    static PERM = { attack: "공격력", defense: "방어력", maxHp: "최대 체력", speed: "이동속도", maxMana: "최대 마나", summon: "소환수 힘" };

    // 소환·지뢰 자리: 고른 칸이 비었으면 거기, 아니면 내 옆 빈칸
    static spot(c, allowHazard = false) {
        const t = c.tile;
        const free = (x, y) => c.world.isWalkable(x, y) && (allowHazard || !c.world.entitiesAt(x, y).some((e) => e.isHazard));
        if (t && free(t.x, t.y)) return t;
        return EnemyMoves.freeNear(c.world, c.user.x, c.user.y, 2);
    }

    static hit(c, f, dmg, type = "physical") {
        if (!f.alive) return [];
        if (c.fly && !c.bump) c.steps.push([new ProjectileAnim(c.world, "kicons", c.card.def.frame, CardKit.px(c.world, c.user), CardKit.px(c.world, f))]);
        let out;
        const near = Math.max(Math.abs(f.x - c.user.x), Math.abs(f.y - c.user.y)) <= 1;
        if (type === "physical" && near && !c.fly && !c.bump) out = Combat.strike(c.user, f, c.world, dmg, c.card.name);
        else {
            if (dmg > 0) MessageLog.add(`${f.displayName}에게 ${Status.modify(dmg, c.user, f)} 피해 (${c.card.name})`, "#e8d9b8");
            out = dmg > 0 ? Combat.hit(f, dmg, c.user, c.world, type) : [];
        }
        if (!f.alive) c.kills++;
        return out;
    }

    static heal(user, n) {
        const before = user.stats.hp;
        user.stats.hp = Math.min(user.stats.maxHp, user.stats.hp + n);
        const got = user.stats.hp - before;
        return got ? [new PopupAnim(user, `+${got}`, "#7cd47c")] : [];
    }

    // 밀기(dir 1)·당기기(dir -1). 밀다가 막히면 3 피해
    static shove(c, f, n, dir) {
        if (!f.alive || !f.world || f.invulnerable) return [];
        const u = c.user;
        let dx = Math.sign(f.x - u.x) * dir;
        let dy = Math.sign(f.y - u.y) * dir;
        if (dx && dy) dy = 0;
        const size = c.world.tileSize;
        const slides = [];
        let bumped = false;
        for (let i = 0; i < n; i++) {
            if (dir < 0 && Math.abs(f.x - u.x) + Math.abs(f.y - u.y) <= 1) break;
            const fx = f.x;
            const fy = f.y;
            if (!c.world.moveEntity(f, dx, dy)) {
                bumped = dir > 0;
                break;
            }
            f.flipX = u.x > f.x;
            f.applyFlip();
            slides.push(new MoveAnim(f, new Vector(fx * size, fy * size), new Vector(f.x * size, f.y * size)));
        }
        if (slides.length) c.steps.push(slides);
        if (bumped) {
            MessageLog.add(`${josa(f.displayName, "이가")} 부딪혔다!`, "#e8d9b8");
            c.bump = true;
            const out = CardKit.hit(c, f, 3);
            c.bump = false;
            return out;
        }
        return [];
    }

    // ---------- 쓰기 ----------
    static run(ctx, T, targs, fx) {
        const c = { ...ctx, steps: [], kills: 0, fly: false, flash: null };
        const r = T.resolve(c, targs);
        if (!r) return null;
        c.foes = r.foes;
        c.tile = r.tile;
        if (c.flash) c.steps.push([new AreaFlashAnim(c.world, c.flash, c.card.def.color, 0.25, false)]);
        for (const f of fx) {
            if (f.cond === "clear") {
                CardKit.onClear(c, f);
                continue;
            }
            if (f.cond && !CardKit.CONDS[f.cond].ok(c)) continue;
            const F = CardKit.FX[f.name];
            const out = [];
            if (F.foe) {
                for (const foe of c.foes) if (foe.alive) out.push(...F.run(c, f.args, foe));
            } else out.push(...F.run(c, f.args));
            if (out.length) c.steps.push(out);
        }
        if (!c.steps.length) c.steps.push([new PopupAnim(c.user, c.card.name, c.card.def.color)]);
        return c.steps;
    }

    // 방을 정리하면 할 일 (player.onClear)
    static onClear(c, f) {
        const F = CardKit.FX[f.name];
        const user = c.user;
        const cards = c.cards;
        const name = c.card.name;
        user.onClear.push({
            text: `${name}: ${F.text(f.args)}`,
            run: () => F.run({ user, cards, world: user.world, foes: [], steps: [], tile: user, card: c.card, kills: 0 }, f.args)
        });
        MessageLog.add(`방을 정리하면: ${F.text(f.args)}`, "#f0d878");
    }

    static clearRoom(player) {
        const list = player.onClear ?? [];
        player.onClear = [];
        for (const job of list) {
            MessageLog.add(job.text, "#f0d878");
            job.run();
        }
    }

    // ---------- 설명 ----------
    static describe(T, targs, fx, spec) {
        const parts = [];
        let line = [];
        let cond = null;
        const flush = () => {
            if (!line.length) return;
            if (cond === "clear") parts.push(`이 방을 정리하면 ${line.join(", ")}.`);
            else if (cond) parts.push(`${CardKit.CONDS[cond].text} ${line.join(", ")}.`);
            else parts.push(line.join(", ") + ".");
            line = [];
        };
        for (const f of fx) {
            if (f.cond !== cond) {
                flush();
                cond = f.cond;
            }
            line.push(CardKit.FX[f.name].text(f.args));
        }
        flush();
        if (spec.desc) return spec.desc + (spec.exhaust ? " (소멸: 이 방에서는 한 번만)" : "");
        let head = T.text(targs, fx.some((f) => CardKit.FX[f.name].foe));
        // "…간 뒤" 다음에 할 일이 없거나 조건부면 문장을 끝낸다
        if (/ 뒤$/.test(head) && (!fx.length || fx[0].cond)) head = head.replace(/한 뒤$/, "한다.").replace(/간 뒤$/, "간다.").replace(/달려가$/, "달려간다.");
        let text = head ? `${head} ${parts.join(" ")}`.trim() : parts.join(" ");
        if (spec.note) text += ` ${spec.note}`;
        if (spec.exhaust) text += " (소멸: 이 방에서는 한 번만)";
        return text;
    }

    static brief(fx) {
        const main = fx.filter((f) => !f.cond);
        return (main.length ? main : fx).slice(0, 3).map((f) => CardKit.FX[f.name].brief(f.args)).join(" · ");
    }

    // ---------- 아이콘 ----------
    // 흑백 틀(card_glyphs)을 카드 색으로 물들여 카드마다 한 칸짜리 아이콘 시트 "kicons"를 만든다 (불러온 뒤 한 번)
    static buildIcons() {
        const src = Resource.image("card_glyphs");
        const n = CardKit.list.length;
        const sheet = document.createElement("canvas");
        sheet.width = Math.max(16, n * 16);
        sheet.height = 16;
        const g = sheet.getContext("2d");
        const tmp = document.createElement("canvas");
        tmp.width = tmp.height = 16;
        const t = tmp.getContext("2d");
        for (const def of CardKit.list) {
            const gi = Math.max(0, CardKit.GLYPHS.indexOf(def.icon));
            t.globalCompositeOperation = "source-over";
            t.clearRect(0, 0, 16, 16);
            t.drawImage(src, gi * 16, 0, 16, 16, 0, 0, 16, 16);
            t.globalCompositeOperation = "multiply";
            t.fillStyle = def.color;
            t.fillRect(0, 0, 16, 16);
            t.globalCompositeOperation = "destination-in";
            t.drawImage(src, gi * 16, 0, 16, 16, 0, 0, 16, 16);
            g.drawImage(tmp, def.frame * 16, 0);
        }
        Resource.setImage("kicons", sheet);
    }
}

Events.on(GameEvent.ROOM_CLEARED, () => {
    if (Player.current) CardKit.clearRoom(Player.current);
});

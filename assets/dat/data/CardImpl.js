// 카드 공방 데이터(GameData.js)의 카드를 게임 카드로 만든다.
//   - 이름·비용·설명·태그·강화(변형)는 데이터에서 읽는다. 설명글의 "공격력 60%" 같은 말은 지금 능력치로 바꿔 숫자를 보여 준다.
//   - 실제 동작은 이 파일의 CARDS[카드 id] (변형은 VARIANTS[카드 id][변형 key]에서 CARDS를 덮어쓴다)에 짜 둔다.
//   새 카드가 데이터에 생기면: CARDS에 그 id의 동작을 한 덩어리 추가하면 된다 (tools/import_data.py가 빠진 id를 알려 준다).
//
// 비용: 공방 카드의 costs는 "비용의 경우들"이다. 한 경우 안의 자원은 모두 함께 낸다 (기력 1 + 마나 1이면 둘 다).
//   경우가 여럿이면 카드 한 장마다 그중 하나로 정해져 나온다 (Card.cost · data.pay, 도감에는 경우마다 한 장). 체력 비용은 체력이 모자라면 못 쓴다.
// 수치 규칙: 모든 % 계산은 버림 (0이 되면 0). 능력치 비례 값도, 이동속도 비례 값(칸·장수)도 반올림·올림 없이 버린다. 둔화는 이동속도를 줄인다.
class CardOps {
    static say(msg) {
        MessageLog.add(msg, "#c8b890");
        return null;
    }

    static pct(base, pct) {
        return Math.floor(base * pct / 100 + 1e-9);
    }

    static atk(u, pct) {
        return CardOps.pct(u.stats.attack, pct);
    }

    static def(u, pct) {
        return CardOps.pct(u.stats.defense, pct);
    }

    // 지금 이동속도 (둔화 반영)
    static speed(u) {
        return Status.speed(u, u.speed);
    }

    static spd(u, pct = 100) {
        return Math.floor(CardOps.speed(u) * pct / 100 + 1e-9);
    }

    static dist(a, b) {
        return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    }

    static px(world, e) {
        return new Vector(e.x * world.tileSize, e.y * world.tileSize);
    }

    // x, y에 있는 적 (살아 있고 적대인 것)
    static foeAt(ctx, x, y) {
        const e = ctx.world.entityAt(x, y);
        return e && e !== ctx.user && e.alive && !e.invulnerable && e.attitude === "hostile" && ctx.user.isHostileTo(e) ? e : null;
    }

    // 중심 (cx, cy) 정사각형 반경 r 안의 모든 적
    static foesSquare(ctx, cx, cy, r) {
        const out = [];
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
            const f = CardOps.foeAt(ctx, cx + dx, cy + dy);
            if (f && !out.includes(f)) out.push(f);
        }
        return out;
    }

    // 사거리 range 안의 적 하나를 고른 칸에서 찾는다 (일직선 아님). 없으면 null + 안내
    static pickFoe(ctx, range) {
        const t = ctx.target;
        if (!t || CardOps.dist(ctx.user, t) > range || (t.x === ctx.user.x && t.y === ctx.user.y)) return CardOps.say(`${range}칸 안의 대상을 골라야 한다`);
        const foe = CardOps.foeAt(ctx, t.x, t.y);
        return foe ?? CardOps.say("그 칸에는 대상이 없다");
    }

    // 바로 옆(상하좌우) 적 하나
    static pickAdjacent(ctx) {
        const t = ctx.target;
        if (!t || CardOps.dist(ctx.user, t) !== 1) return CardOps.say("바로 옆 칸을 골라야 한다");
        const foe = CardOps.foeAt(ctx, t.x, t.y);
        if (!foe) return CardOps.say("그 칸에는 대상이 없다");
        if (t.x !== ctx.user.x) ctx.user.flipX = t.x < ctx.user.x;
        ctx.user.applyFlip();
        return foe;
    }

    // 날아가서 맞히기: [날아가는 연출, 맞는 연출]
    static shoot(ctx, foe, dmg, frame = null) {
        const u = ctx.user;
        const w = ctx.world;
        const d = Status.modify(dmg, u, foe);
        MessageLog.add(`${josa(u.displayName, "이가")} ${foe.displayName}에게 ${d} 피해 (${ctx.card.name})`, "#e8d9b8");
        const fly = new ProjectileAnim(w, "kicons", frame ?? ctx.card.def.frame, CardOps.px(w, u), CardOps.px(w, foe));
        return [[fly], Combat.hit(foe, d, u, w, "physical", false)];
    }

    // 상태 이상 주기 (연출 하나). 우두머리는 기절에 면역인 동안 걸리지 않는다
    static inflict(target, key, n, turns = null) {
        if (Status.immune(target, key)) {
            MessageLog.add(`${josa(target.displayName, "은는")} 기절에 면역이다`, "#c8c0a0");
            return new PopupAnim(target, "기절 면역", Status.DEFS.stunimm.color);
        }
        Status.add(target, key, n, turns);
        const d = Status.DEFS[Status.key(key)];
        return new PopupAnim(target, `${d.name} ${n}`, d.color);
    }

    // 빈칸들 (사거리 n, 벽·다른 것에 막히지 않은 바닥)
    static freeTiles(world, u, n) {
        const out = [];
        for (let dy = -n; dy <= n; dy++) for (let dx = -n; dx <= n; dx++) {
            if (!(dx || dy) || Math.abs(dx) + Math.abs(dy) > n) continue;
            const x = u.x + dx;
            const y = u.y + dy;
            if (world.getChunkAt(x, y) && world.isWalkable(x, y) && !world.entitiesAt(x, y).some((e) => e.isHazard)) out.push(`${x},${y}`);
        }
        return out;
    }

    // 옆 칸(상하좌우)의 빈칸
    static adjacentFree(world, u) {
        return CardOps.freeTiles(world, u, 1);
    }

    // 토템이 서 있는 턴: 이동속도 200% (붉은 토템은 3턴). 0턴이면 영영 서 있으니 최소 1
    static totemLife(def, u) {
        return def.explode ? 3 : Math.max(1, CardOps.spd(u ?? Player.current, 200));
    }

    // 걸어서 이동 (ActionCards.move). 움직인 칸 수를 steps.moved에 적어 준다
    static walk(ctx, n) {
        const steps = ActionCards.move(ctx, n);
        if (steps) steps.moved = steps.length;
        return steps;
    }

    // 순간이동 (벽·지형 상관없이 사거리 안 빈칸으로)
    static teleport(ctx, n) {
        const u = ctx.user;
        const t = ctx.target;
        if (u.root > 0) return CardOps.say(`속박되어 움직일 수 없다 (${u.root}턴 남음)`);
        if (!t || !CardOps.freeTiles(ctx.world, u, n).includes(`${t.x},${t.y}`)) return CardOps.say(`${n}칸 안의 빈칸을 골라야 한다`);
        if (Status.charmBlocks(u, t.x, t.y)) return CardOps.say("매료당해 건 상대에게서 벗어난 칸으로는 갈 수 없다");
        const w = ctx.world;
        const fx = u.x;
        const fy = u.y;
        w.removeEntity(u);
        u.x = t.x;
        u.y = t.y;
        w.addEntity(u);
        Equip.stepped(u, w);
        Pickups.stepped(u, w);
        Equip.moved(u);
        if (t.x !== fx) u.flipX = t.x < fx;
        u.applyFlip();
        MessageLog.add(`${josa(u.displayName, "이가")} 순간이동했다`, "#c8a0f8");
        return [[new MoveAnim(u, new Vector(fx * w.tileSize, fy * w.tileSize), new Vector(t.x * w.tileSize, t.y * w.tileSize), 0.1)]];
    }

    // 덱에서 n장 뽑기 연출
    static draw(ctx, n, over = false) {
        const drawn = ctx.cards.draw(n, over);
        return drawn.length ? [new PopupAnim(ctx.user, `+${drawn.length}장`, "#a0b8e8")] : [];
    }

    static heal(u, n) {
        const s = u.stats;
        const got = Math.min(n, s.maxHp - s.hp);
        s.hp += got;
        if (got > 0) MessageLog.add(`체력 ${got} 회복`, "#7cd47c");
        return got;
    }

    static mana(u, n) {
        const got = Math.min(n, u.maxMana - u.mana);
        u.mana += got;
        if (got > 0) MessageLog.add(`마나 ${got} 회복`, "#7cb0f0");
        return got;
    }

    // 덱에서 조건에 맞는 카드를 n장까지 패로 가져온다 (맨 위부터). 가져온 카드들
    static fetchWhere(ctx, pred, n) {
        const got = [];
        for (let i = ctx.cards.deck.length - 1; i >= 0 && got.length < n; i--) {
            const c = ctx.cards.deck[i];
            if (!pred(c)) continue;
            if (!ctx.cards.fetch(c)) break; // 행동 패가 가득 차면 못 가져온다
            got.push(c);
        }
        return got;
    }

    // 고른 카드들을 버린다 (원한이 터진다). 버린 카드들
    static dump(ctx, cards) {
        const out = [];
        for (const c of cards) if (ctx.cards.hand.includes(c) && ctx.cards.discard(c, true)) out.push(c);
        return out;
    }

    // 고르기 창 설정 만들기 (패에서 min~max장)
    static handPick(title, min, max) {
        return (u, card) => ({ title, cards: u.cards.actions.filter((c) => c !== card), min, max });
    }

    // 구역으로 나눠 고르는 고르기 창 설정 만들기 (picker 안에서 부른다).
    //   zones: [["덱", u.cards.deck], ["묘지", u.cards.graveyard]]  — [머리글, 카드들]
    //   opts.total: [min, max] 전체 선택 장수 (기본 [1, 1])
    //   opts.each: 구역마다 최대 장수 (숫자 하나면 모든 구역, 배열이면 구역별. 생략하면 전체 max)
    // 각 구역은 이름순으로 정렬해 보인다 (덱의 뽑는 순서를 감춘다). 예:
    //   picker: (u) => CardOps.zonePick("가져올 카드를 고른다", [["덱", u.cards.deck], ["묘지", u.cards.graveyard]], { total: [1, 1], each: 1 })
    // 반환은 { title, cards(모든 구역 합), min, max, sections } — Player.requestCard가 CardPicker에 넘긴다
    static zonePick(title, zones, opts = {}) {
        const [min, max] = opts.total ?? [1, 1];
        const byName = (list) => [...list].sort((a, b) => a.def.name.localeCompare(b.def.name, "ko"));
        const sections = zones.map(([zt, cards], i) => ({
            title: zt, cards: byName(cards),
            max: Array.isArray(opts.each) ? (opts.each[i] ?? max) : (opts.each ?? max)
        }));
        return { title, cards: sections.flatMap((s) => s.cards), min, max, sections };
    }
}

// ---------- 짧은 설명 도우미 ----------
const CK = {
    atk: (v) => CardText.tag("atk", v),
    def: (v) => CardText.tag("def", v),
    spd: (v) => CardText.tag("spd", v),
    mana: (v) => CardText.tag("mana", v),
    hp: (v) => CardText.tag("hp", v),
    energy: (v) => CardText.tag("energy", v),
    st: (key, text) => CardText.tag(key, text)
};
const CARD_TAG_NAMES = { attack: "공격", defense: "방어", move: "이동" };
// 지금 플레이어. 시작 화면(도감)처럼 플레이어가 없으면 기본 능력치의 모형을 쓴다
const PL = () => Player.current ?? { x: 0, y: 0, status: {}, statusT: {}, speed: Player.BASE_SPEED, maxMana: Player.MAX_MANA, mana: Player.MAX_MANA, stats: { attack: Player.BASE_ATTACK, defense: Player.BASE_DEFENSE, maxHp: Player.BASE_HP, hp: Player.BASE_HP } };

// ---------- 카드 동작 ----------
// 각 항목: { icon, color, target(card), use(ctx), short(card), picker(player, card), grudge(ctx), exhaust }
// 능력치는 지금 플레이어(ctx.user)의 것을 읽는다
const CARDS = {
    arrow: {
        icon: "arrow", color: "#e8c870",
        target: () => ({ range: CardOps.spd(PL()), radius: 0, taps: 1, verb: "쏘기", color: "#e8a040" }),
        use(ctx) {
            const foe = CardOps.pickFoe(ctx, CardOps.spd(ctx.user));
            return foe ? CardOps.shoot(ctx, foe, CardOps.atk(ctx.user, 80)) : null;
        },
        short: () => `${CK.atk(CardOps.atk(PL(), 80))} 피해 · ${CK.spd(CardOps.spd(PL()))}칸`
    },

    blast: {
        icon: "bomb", color: "#ff9a50", radius: 1,
        target() {
            return { range: CardOps.spd(PL()), radius: this.radius, taps: 2, verb: "폭발", color: "#ff8a30" };
        },
        use(ctx) {
            const u = ctx.user;
            const at = ctx.target;
            const range = CardOps.spd(u);
            if (!at || CardOps.dist(u, at) > range) return CardOps.say(`${range}칸 안의 칸을 골라야 한다`);
            const r = ctx.card.def.radius;
            const dmg = CardOps.atk(u, 300);
            const foes = CardOps.foesSquare(ctx, at.x, at.y, r);
            const w = ctx.world;
            const tiles = [];
            for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) tiles.push([at.x + dx, at.y + dy]);
            const hits = [];
            const extra = ctx.card.def.afterHit;
            MessageLog.add(foes.length ? `펑! ${foes.length}개 대상에게 ${dmg} 피해` : "펑! 아무것도 맞지 않았다", "#ff9a50");
            for (const f of foes) {
                hits.push(...Combat.hit(f, dmg, u, w, "heat"));
                if (extra && f.alive) hits.push(extra(u, f));
            }
            const fly = new ProjectileAnim(w, "kicons", ctx.card.def.frame, CardOps.px(w, u), CardOps.px(w, at));
            return [[fly], [new AreaFlashAnim(w, tiles, ctx.card.def.color, 0.3), ...hits]];
        },
        short: (c) => `${CK.atk(CardOps.atk(PL(), 300))} 피해 · ${c.def.radius === 1 ? "3×3" : "5×5"}`
    },

    blink: {
        icon: "wing", color: "#b890f0",
        target: () => ({ range: CardOps.spd(PL(), 200), radius: 0, taps: 1, verb: "순간이동", color: "#c8a0f8", move: true, tiles: (w) => CardOps.freeTiles(w, PL(), CardOps.spd(PL(), 200)).filter((k) => !Status.charmBlocks(PL(), ...k.split(",").map(Number))) }),
        use: (ctx) => CardOps.teleport(ctx, CardOps.spd(ctx.user, 200)),
        short: () => `${CK.spd(CardOps.spd(PL(), 200))}칸 순간이동`
    },

    card_absorbing: {
        icon: "magnet", color: "#70b0ff",
        picker: CardOps.handPick("버릴 카드를 한 장 고른다", 1, 1),
        use(ctx) {
            const [pick] = ctx.picks ?? [];
            if (!pick || !ctx.cards.hand.includes(pick)) return CardOps.say("버릴 카드를 골라야 한다");
            const cost = Math.floor((pick.cost?.mana ?? 0) / 2); // 버린 카드의 마나 비용의 절반 (버림)
            const dumped = CardOps.dump(ctx, [pick]);
            if (!dumped.length) return null;
            const got = CardOps.mana(ctx.user, 2 + CardOps.def(ctx.user, 10) + cost);
            return [[new PopupAnim(ctx.user, `마나 +${got}`, "#7cb0f0")]];
        },
        short: () => `1장 버리고 ${CK.mana("마나 " + (2 + CardOps.def(PL(), 10)) + "+")}`
    },

    card_shield: {
        icon: "cards", color: "#8cc8f0",
        picker: (u, card) => ({ title: "버릴 카드를 원하는 만큼 고른다 (없어도 된다)", cards: u.cards.actions.filter((c) => c !== card), min: 0, max: 99 }),
        use(ctx) {
            const n = CardOps.dump(ctx, ctx.picks ?? []).length + 1;
            const v = CardOps.def(ctx.user, 100 * n);
            ctx.user.addBlock(v, n);
            MessageLog.add(`방어도 +${v} (${n}턴)`, "#8cc8f0");
            return [[new PopupAnim(ctx.user, "+" + v, "#8cc8f0")]];
        },
        short: () => `버린 수+1 만큼 방어도 (${CK.def(CardOps.def(PL(), 100))}씩)`
    },

    charge: {
        icon: "bolt", color: "#f0a040",
        use(ctx) {
            const u = ctx.user;
            const n = 2 + CardOps.spd(u, 25);
            const got = Math.min(n, u.maxEnergy - u.energy);
            if (got <= 0) return CardOps.say("기력이 이미 가득하다");
            u.energy += got;
            MessageLog.add(`기력 ${got} 회복`, "#f29a3a");
            return [[new PopupAnim(u, `기력 +${got}`, "#f29a3a")]];
        },
        short: () => `${CK.energy("기력 +" + (2 + CardOps.spd(PL(), 25)))} 회복`
    },

    chocolate: {
        icon: "heart", color: "#c89060",
        use: (ctx) => [CardOps.draw(ctx, 1)],
        grudge(ctx) {
            const u = ctx.user;
            u.energy = Math.min(u.maxEnergy, u.energy + 1);
            MessageLog.add("원한! 초콜릿 — 기력 1을 되찾았다", "#e8a870");
        },
        short: () => "1장 뽑기 · 버려지면: 기력 +1"
    },

    // 몽둥이: 옆칸 단일 대상 공격력 150% 피해 + 기절 1턴
    //   붉은: + 대상 최대 체력 5%(최소 1) 화상 2턴 / 푸른: 고른 옆칸 중심 3x3 모두 / 노란: 기절 2턴
    club: {
        icon: "hammer", color: "#b08860", stunTurns: 1,
        target(card) {
            return card && card.def.area ? { range: 1, radius: 1, taps: 2, verb: "공격", color: "#d8443c" } : { range: 1, radius: 0, entity: true, taps: 1, verb: "공격", color: "#d8443c" };
        },
        use(ctx) {
            const d = ctx.card.def;
            const u = ctx.user;
            const dmg = CardOps.atk(u, 150);
            if (d.area) {
                const t = ctx.target;
                if (!t || CardOps.dist(u, t) !== 1) return CardOps.say("바로 옆 칸을 골라야 한다");
                const foes = CardOps.foesSquare(ctx, t.x, t.y, 1);
                if (!foes.length) return CardOps.say("범위 안에 대상이 없다");
                if (t.x !== u.x) u.flipX = t.x < u.x;
                u.applyFlip();
                const tiles = [];
                for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) tiles.push([t.x + dx, t.y + dy]);
                const hits = [new AttackAnim(u, t, ctx.world.tileSize), new AreaFlashAnim(ctx.world, tiles, ctx.card.def.color, 0.3, false)];
                MessageLog.add(`${josa(u.displayName, "이가")} 몽둥이를 휘둘러 ${foes.length}개 대상에게 ${dmg} 피해`, "#e8d9b8");
                const after = [];
                for (const f of foes) {
                    hits.push(...Combat.hit(f, dmg, u, ctx.world, "physical"));
                    if (f.alive) after.push(CardOps.inflict(f, "stun", d.stunTurns));
                }
                return [hits, after];
            }
            const foe = CardOps.pickAdjacent(ctx);
            if (!foe) return null;
            const steps = Combat.strike(u, foe, ctx.world, dmg, ctx.card.name);
            const out = [steps];
            if (foe.alive) {
                const after = [CardOps.inflict(foe, "stun", d.stunTurns)];
                if (d.burnPct) after.push(CardOps.inflict(foe, "burn", Math.max(1, CardOps.pct(foe.stats.maxHp, d.burnPct)), 2));
                out.push(after);
            }
            return out;
        },
        short: (c) => `${CK.atk(CardOps.atk(PL(), 150))} 피해${c.def.area ? " · 3×3" : ""} · ${CK.st("stun", "기절")} ${c.def.stunTurns}턴${c.def.burnPct ? " · " + CK.st("burn", "화상") + " 최대체력 " + c.def.burnPct + "%" : ""}`
    },

    concentration: {
        icon: "eye", color: "#f0d878",
        use: (ctx) => [CardOps.draw(ctx, CardOps.spd(ctx.user, 25) + 2)],
        short: () => `${CK.spd(CardOps.spd(PL(), 25) + 2)}장 뽑기`
    },

    // 대시: 이동속도 50% + 1 이동. 붉은: 이동 뒤 옆 적에게 화상 / 푸른: 직선이면 이동속도 100% + 2 / 노란: 덱에서 이동 카드 1장
    dash: {
        icon: "boot", color: "#7cc4e8",
        target(card) {
            const small = CardOps.spd(PL(), 50) + 1;
            if (!(card && card.def.straightBonus)) return { range: small, radius: 0, walk: true, taps: 1, verb: "이동", color: "#7cc4e8" };
            const big = CardOps.spd(PL(), 100) + 2;
            return {
                range: big, radius: 0, walk: true, taps: 1, verb: "이동", color: "#7cc4e8",
                tiles: (w) => {
                    const u = PL();
                    const out = new Set(ActionCards.reachable(w, u, small).keys());
                    for (const k of ActionCards.reachable(w, u, big).keys()) {
                        const [x, y] = k.split(",").map(Number);
                        if (x === u.x || y === u.y) out.add(k); // 직선으로만 멀리
                    }
                    return out;
                }
            };
        },
        use(ctx) {
            const d = ctx.card.def;
            const u = ctx.user;
            const t = ctx.target;
            let n = CardOps.spd(u, 50) + 1;
            if (d.straightBonus && t && (t.x === u.x || t.y === u.y)) n = Math.max(n, CardOps.spd(u, 100) + 2);
            const steps = CardOps.walk(ctx, n);
            if (!steps) return null;
            if (d.burnAround) {
                const burn = CardOps.atk(u, 60);
                const foes = Entity.DIRS.map(([dx, dy]) => CardOps.foeAt(ctx, u.x + dx, u.y + dy)).filter((f, i, a) => f && a.indexOf(f) === i);
                if (foes.length) steps.push(foes.map((f) => CardOps.inflict(f, "burn", burn, 2)));
            }
            if (d.fetchMove) {
                const got = CardOps.fetchWhere(ctx, (c) => (c.def.tags ?? []).includes("move"), 1);
                if (got.length) steps.push([new PopupAnim(u, got[0].name, "#7cc4e8")]);
                else MessageLog.add("덱에 이동 카드가 없다", "#c8b890");
            }
            return steps;
        },
        short: (c) => {
            const d = c.def;
            const base = `${CK.spd(CardOps.spd(PL(), 50) + 1)}칸 이동`;
            if (d.straightBonus) return `${base} · 직선이면 ${CK.spd(CardOps.spd(PL(), 100) + 2)}칸`;
            if (d.burnAround) return `${base} · 옆 적에게 ${CK.st("burn", "화상 " + CardOps.atk(PL(), 60))} 2턴`;
            if (d.fetchMove) return `${base} · 덱에서 이동 카드 1장`;
            return base;
        }
    },

    first_aid: {
        icon: "plus", color: "#7cd47c",
        target: () => ({ range: CardOps.spd(PL()), radius: 0, taps: 1, verb: "치료", color: "#7cd47c" }),
        use(ctx) {
            const u = ctx.user;
            const t = ctx.target;
            if (!t || (t.x === u.x && t.y === u.y)) return CardOps.say("치료할 아군을 골라야 한다 (자신에게는 쓸 수 없다)");
            if (CardOps.dist(u, t) > CardOps.spd(u)) return CardOps.say(`${CardOps.spd(u)}칸 안의 아군을 골라야 한다`);
            const ally = ctx.world.entityAt(t.x, t.y);
            if (!(ally instanceof Ally) || !ally.alive) return CardOps.say("그 칸에는 아군이 없다");
            const s = ally.stats;
            if (s.hp >= s.maxHp) return CardOps.say(`${josa(ally.displayName, "은는")} 이미 체력이 가득하다`);
            const got = Math.min(CardOps.def(u, 200), s.maxHp - s.hp);
            s.hp += got;
            MessageLog.add(`${josa(ally.displayName, "을를")} ${got} 치료했다`, "#7cd47c");
            return [[new PopupAnim(ally, "+" + got, "#7cd47c")]];
        },
        short: () => `아군 체력 ${CK.def(CardOps.def(PL(), 200))} 회복 · ${CK.spd(CardOps.spd(PL()))}칸`
    },

    food: {
        icon: "potion", color: "#e8a870", exhaust: true,
        use(ctx) {
            const u = ctx.user;
            if (u.stats.hp >= u.stats.maxHp) return CardOps.say("이미 체력이 가득하다");
            const n = CardOps.pct(u.stats.maxHp, 5);
            const got = CardOps.heal(u, n);
            return [[new PopupAnim(u, "+" + got, "#7cd47c")]];
        },
        short: () => `${CK.hp(CardOps.pct(PL().stats.maxHp, 5))} 회복 · 소멸`
    },

    // 서리: 빙결. 붉은: 3턴, 이미 빙결이면 1 피해를 방어력 50%번 / 푸른: 준비(턴 끝마다 지속 +방어력 20%, 쓰면 초기화) / 노란: 사거리 100% + 2
    frost: {
        icon: "drop", color: "#8cd0ff", turns: 2,
        reach: (c) => (c && c.def.wide ? CardOps.spd(PL(), 100) + 2 : CardOps.spd(PL(), 50) + 1),
        target(card) {
            return { range: CARDS.frost.reach(card), radius: 0, taps: 1, verb: "시전", color: "#7ab8ff" };
        },
        use(ctx) {
            const u = ctx.user;
            const d = ctx.card.def;
            const foe = CardOps.pickFoe(ctx, CARDS.frost.reach(ctx.card));
            if (!foe) return null;
            const w = ctx.world;
            const fly = new ProjectileAnim(w, "kicons", d.frame, CardOps.px(w, u), CardOps.px(w, foe));
            const n = CardOps.def(u, 60);
            const data = ctx.card.ensureData();
            const turns = d.turns + (d.prepare === "frostIce" ? data.iceBonus ?? 0 : 0);
            if (d.prepare === "frostIce") data.iceBonus = 0; // 쓰면 초기화
            const had = Status.get(foe, "ice") > 0;
            MessageLog.add(`${josa(foe.displayName, "이가")} 얼어붙는다 (빙결 ${n}, ${turns}턴)`, "#7ab8ff");
            const out = [[fly], [CardOps.inflict(foe, "ice", n, turns)]];
            if (d.repeatIce && had) {
                const hits = CardOps.def(u, 50);
                const anims = [];
                for (let i = 0; i < hits && foe.alive; i++) anims.push(...Combat.hit(foe, 1, u, w, "cold"));
                if (hits) {
                    MessageLog.add(`빙결로 ${hits}번 파고든다`, "#7ab8ff");
                    out.push(anims);
                }
            }
            return out;
        },
        short: (c) => {
            const d = c.def;
            const bonus = d.prepare === "frostIce" ? c.data?.iceBonus ?? 0 : 0;
            return `${CK.st("ice", "빙결 " + CardOps.def(PL(), 60))} ${d.turns + bonus}턴 · ${CK.spd(CARDS.frost.reach(c))}칸${d.repeatIce ? " · 이미 빙결이면 1 피해 ×" + CardOps.def(PL(), 50) : ""}${d.prepare === "frostIce" ? " · 준비" : ""}`;
        }
    },

    // 방어: 방어력 100% 방어도. 붉은(방패치기): 지금 방어도만큼 피해 / 푸른: 2턴 + 모든 방어도 +1턴 / 노란: + 골드 5%
    guard: {
        icon: "shield", color: "#8cc8f0", turns: 1,
        target: (c) => (c && c.def.bash ? { range: 1, radius: 0, entity: true, taps: 1, verb: "방패치기", color: "#d8443c" } : null),
        use(ctx) {
            const u = ctx.user;
            const d = ctx.card.def;
            if (d.bash) {
                if (u.block <= 0) return CardOps.say("방어도가 없다");
                const foe = CardOps.pickAdjacent(ctx);
                if (!foe) return null;
                return [Combat.strike(u, foe, ctx.world, u.block, ctx.card.name)];
            }
            const v = CardOps.def(u, 100) + (d.goldPct ? CardOps.pct(u.money ?? 0, d.goldPct) : 0);
            u.addBlock(v, d.turns);
            if (d.extendAll) for (const b of u.blocks) b.t += 1;
            MessageLog.add(`방어도 +${v} (${d.turns}턴)${d.extendAll ? " · 모든 방어도 +1턴" : ""}`, "#8cc8f0");
            return [[new PopupAnim(u, "+" + v, "#8cc8f0")]];
        },
        short: (c) => {
            const d = c.def;
            if (d.bash) return `지금 방어도(${CK.def(PL() ? PL().block : 0)}) 만큼 피해`;
            const gold = d.goldPct ? CardOps.pct(PL().money ?? 0, d.goldPct) : 0;
            return `방어도 ${CK.def(CardOps.def(PL(), 100) + gold)} · ${d.turns}턴${d.extendAll ? " · 모든 방어도 +1턴" : ""}`;
        }
    },

    // 굳히기: 이번 전투 동안 방어력 20% 경질화. 붉은: 공격력 20% 힘 / 푸른: + 경질화 수치만큼 보호(1턴) / 노란: 신속 1 (소멸)
    harden: {
        icon: "wall", color: "#9ad0e8",
        use(ctx) {
            const u = ctx.user;
            const d = ctx.card.def;
            if (d.swift) {
                Status.add(u, "swift", 1, Status.ENDLESS);
                MessageLog.add("신속 1 (이번 전투 동안 이동속도 +1)", Status.DEFS.swift.color);
                return [[new PopupAnim(u, "신속 1", Status.DEFS.swift.color)]];
            }
            if (d.strength) {
                const n = CardOps.atk(u, 20);
                Status.add(u, "str", n, Status.ENDLESS);
                MessageLog.add(`힘 ${n} (이번 전투 동안 공격력 +${n})`, Status.DEFS.str.color);
                return [[new PopupAnim(u, `힘 ${n}`, Status.DEFS.str.color)]];
            }
            const n = CardOps.def(u, 20);
            Status.add(u, "harden", n, Status.ENDLESS);
            MessageLog.add(`경질화 ${n} (이번 전투 동안 방어력 +${n})`, "#9ad0e8");
            const out = [new PopupAnim(u, `경질화 ${n}`, Status.DEFS.harden.color)];
            if (d.protect && n > 0) {
                Status.add(u, "protect", n, 1);
                MessageLog.add(`보호 ${n}회 (1턴)`, Status.DEFS.protect.color);
                out.push(new PopupAnim(u, `보호 ${n}`, Status.DEFS.protect.color));
            }
            return [out];
        },
        short: (c) => {
            const d = c.def;
            if (d.swift) return `${CK.st("swift", "신속 1")} · 전투 중 · 소멸`;
            if (d.strength) return `${CK.st("str", "힘 " + CardOps.atk(PL(), 20))} · 전투 중`;
            return `${CK.st("harden", "경질화 " + CardOps.def(PL(), 20))} · 전투 중${d.protect ? " · " + CK.st("protect", "보호 " + CardOps.def(PL(), 20)) + " 1턴" : ""}`;
        }
    },

    heavy: {
        icon: "hammer", color: "#e8e0c0",
        target: () => ({ range: 1, radius: 0, entity: true, taps: 1, verb: "공격", color: "#d8443c" }),
        use(ctx) {
            const u = ctx.user;
            const foe = CardOps.pickAdjacent(ctx);
            if (!foe) return null;
            const v = ctx.card.def;
            let dmg = CardOps.atk(u, 250);
            if (v.bonusMaxHp) dmg += Math.floor(foe.stats.maxHp * v.bonusMaxHp / 100);
            const steps = Combat.strike(u, foe, ctx.world, dmg, ctx.card.name);
            const dealt = Combat.last?.dealt ?? 0;
            const killed = !foe.alive;
            const out = [steps];
            if (v.stun && foe.alive) out.push([CardOps.inflict(foe, "stun", 1)]);
            if (v.manaOnKill && killed) {
                const got = CardOps.mana(u, Math.floor(dealt / 2));
                if (got) out.push([new PopupAnim(u, `마나 +${got}`, "#7cb0f0")]);
            }
            return out;
        },
        short: (c) => `${CK.atk(CardOps.atk(PL(), 250))} 피해${c.def.bonusMaxHp ? " + 최대체력 " + c.def.bonusMaxHp + "%" : ""}${c.def.stun ? " · " + CK.st("stun", "기절") : ""}${c.def.manaOnKill ? " · 처치 시 마나" : ""}`
    },

    // 방화: 화상. 붉은: 3턴, 이미 화상이면 그 화상을 소모해 (턴×수치) + 공격력 150% 즉시 피해 / 푸른: 공격력 40%, 방어력 100% 턴
    ignite: {
        icon: "flame", color: "#ff8a40",
        target: () => ({ range: CardOps.spd(PL(), 50) + 1, radius: 0, taps: 1, verb: "시전", color: "#ff8a40" }),
        use(ctx) {
            const u = ctx.user;
            const d = ctx.card.def;
            const foe = CardOps.pickFoe(ctx, CardOps.spd(u, 50) + 1);
            if (!foe) return null;
            const w = ctx.world;
            const fly = new ProjectileAnim(w, "kicons", d.frame, CardOps.px(w, u), CardOps.px(w, foe));
            const n = CardOps.atk(u, d.longBurn ? 40 : 60);
            const turns = d.longBurn ? Math.max(1, CardOps.def(u, 100)) : d.burnTurns ?? 2;
            const out = [[fly]];
            if (d.consume) {
                const b = Status.get(foe, "burn");
                const t = Math.min(Status.turns(foe, "burn"), 9);
                if (b > 0) {
                    const dmg = b * t + CardOps.atk(u, 150);
                    Status.set(foe, "burn", 0);
                    MessageLog.add(`화상을 태워 ${dmg} 피해`, "#ff8a40");
                    out.push(Combat.hit(foe, dmg, u, w, "heat"));
                }
            }
            if (foe.alive) {
                MessageLog.add(`${josa(foe.displayName, "이가")} 불타오른다 (화상 ${n}, ${turns}턴)`, "#ff8a40");
                out.push([CardOps.inflict(foe, "burn", n, turns)]);
            }
            if (d.swiftFromBurn) {
                // 방 안 모든 적의 화상 중 가장 긴 지속시간만큼 자신에게 신속 2
                const T = Math.max(0, ...ctx.world.hostiles(u).map((e) => Status.turns(e, "burn")));
                if (T > 0) {
                    Status.add(u, "swift", 2, T);
                    out.push([new PopupAnim(u, `신속 2`, Status.DEFS.swift.color)]);
                }
            }
            return out;
        },
        short: (c) => {
            const d = c.def;
            const n = CardOps.atk(PL(), d.longBurn ? 40 : 60);
            const turns = d.longBurn ? Math.max(1, CardOps.def(PL(), 100)) : d.burnTurns ?? 2;
            return `${CK.st("burn", "화상 " + n)} ${turns}턴 · ${CK.spd(CardOps.spd(PL(), 50) + 1)}칸${d.consume ? " · 이미 화상이면 소모해 폭발" : ""}${d.swiftFromBurn ? " · 적 화상 최대 턴만큼 " + CK.st("swift", "신속 2") : ""}`;
        }
    },

    insight: {
        icon: "eye", color: "#f0a0ff",
        use: (ctx) => [CardOps.draw(ctx, CardOps.spd(ctx.user, 50) + 3, true)],
        short: () => `${CK.spd(CardOps.spd(PL(), 50) + 3)}장 뽑기 (패 제한 무시)`
    },

    // 점액: 상태이상 카드 (슬라임킹이 패에 끼워 넣는다). 손으로 [묘지로] 버릴 수 없고 (noDiscard), 기력 1을 내고 써서 소멸시킨다.
    // 카드 효과로는 버려진다
    slime: {
        icon: "drop", color: "#7cd47c", noDiscard: true,
        use(ctx) {
            MessageLog.add("점액을 털어냈다", "#7cd47c");
            return [[new PopupAnim(ctx.user, "소멸", "#7cd47c")]];
        },
        short: () => "[묘지로] 사용불가 · 쓰면 소멸"
    },

    // 투척용 단검: 나이프 홀스터가 준다 (임시 카드 — 쓰거나 전투가 끝나면 사라진다)
    throwing_knife: {
        icon: "dagger", color: "#c8c8d8",
        target: () => ({ range: CardOps.spd(PL()), radius: 0, taps: 1, verb: "던지기", color: "#c8c8d8" }),
        use(ctx) {
            const foe = CardOps.pickFoe(ctx, CardOps.spd(ctx.user));
            return foe ? CardOps.shoot(ctx, foe, 2) : null;
        },
        short: () => `2 피해 · ${CK.spd(CardOps.spd(PL()))}칸`
    },

    larry: {
        icon: "skull", color: "#e8e8d0",
        target: () => ({ range: 1, radius: 0, taps: 1, verb: "소환", color: "#7cd47c", tiles: (w) => CardOps.adjacentFree(w, PL()) }),
        use(ctx) {
            const u = ctx.user;
            const t = ctx.target;
            if (!t || !CardOps.adjacentFree(ctx.world, u).includes(`${t.x},${t.y}`)) return CardOps.say("옆 빈칸을 골라야 한다");
            const a = ctx.world.spawn(new Ally(t.x, t.y, "soldier", {
                hp: CardOps.def(u, 100) + 10, attack: 2 + CardOps.atk(u, 50), moves: 1, defense: 0
            }));
            MessageLog.add(`${josa(a.displayName, "을를")} 불렀다 (체력 ${a.stats.maxHp}, 공격 ${a.stats.attack})`, "#a0d0a0");
            return [[new PopupAnim(a, "!", "#7cd47c")]];
        },
        short: () => `해골병사 소환 (체력 ${CK.def(CardOps.def(PL(), 100) + 10)} · 공격 ${CK.atk(2 + CardOps.atk(PL(), 50))})`
    },

    lightning_bolt: {
        icon: "bolt", color: "#f0e070",
        use(ctx) {
            const u = ctx.user;
            const w = ctx.world;
            const foes = CardOps.foesSquare(ctx, u.x, u.y, 1);
            const dmg = CardOps.atk(u, 100);
            const tiles = [];
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) tiles.push([u.x + dx, u.y + dy]);
            MessageLog.add(foes.length ? `번쩍! ${foes.length}개 대상에게 ${dmg} 피해 + 기절` : "번쩍! 아무것도 맞지 않았다", "#f0e070");
            const hits = [];
            for (const f of foes) {
                hits.push(...Combat.hit(f, dmg, u, w, "shock"));
                if (f.alive) hits.push(CardOps.inflict(f, "stun", 1));
            }
            return [[new AreaFlashAnim(w, tiles, "#f0e070", 0.3), ...hits]];
        },
        short: () => `주변 3×3 ${CK.atk(CardOps.atk(PL(), 100))} 피해 · ${CK.st("stun", "기절")}`
    },

    // 과부하: [턴 제한(3)] 기력 +2, 무기력 2 (1턴). 붉은: 이번 턴 쓴 기력만큼 힘 1턴 / 푸른: 방어도가 있으면 하나를 없애고 무기력 없음 / 노란: 카드 1장 버리고 기력 +2
    overload: {
        icon: "bolt", color: "#f08040",
        use(ctx) {
            const u = ctx.user;
            const d = ctx.card.def;
            const out = [];
            if (d.discardOne) {
                const [pick] = ctx.picks ?? [];
                if (!pick || !ctx.cards.hand.includes(pick)) return CardOps.say("버릴 카드를 골라야 한다");
                CardOps.dump(ctx, [pick]);
                u.energy += 2;
                MessageLog.add("과부하! 카드를 버리고 기력 +2", "#f0a050");
                return [[new PopupAnim(u, "기력 +2", "#f29a3a")]];
            }
            const spent = u.energySpent ?? 0;
            u.energy += 2;
            out.push(new PopupAnim(u, "기력 +2", "#f29a3a"));
            if (d.shieldSwap && u.blocks.length) {
                u.blocks.sort((a, b) => a.t - b.t);
                const gone = u.blocks.shift();
                MessageLog.add(`과부하! 기력 +2, 방어도 ${gone.v}를 내놓아 무기력이 없다`, "#f0a050");
            } else {
                Status.add(u, "lethargy", 2, 1);
                MessageLog.add("과부하! 기력 +2, 다음 턴 기력이 2 줄어든다 (무기력)", "#f0a050");
            }
            if (d.strengthFromSpent && spent > 0) {
                Status.add(u, "str", spent, 1);
                out.push(new PopupAnim(u, `힘 ${spent}`, Status.DEFS.str.color));
                MessageLog.add(`이번 턴 쓴 기력 ${spent}만큼 힘 (1턴)`, Status.DEFS.str.color);
            }
            return [out];
        },
        short: (c) => {
            const d = c.def;
            if (d.discardOne) return `1장 버리고 ${CK.energy("기력 +2")}`;
            return `${CK.energy("기력 +2")} · ${d.shieldSwap ? "방어도가 있으면 하나 내놓고 무기력 없음" : CK.st("lethargy", "무기력 2") + " 1턴"}${d.strengthFromSpent ? " · 쓴 기력만큼 힘" : ""}`;
        }
    },

    // 기도: [턴 제한(3)] 덱/묘지에서 1장 골라 패로. 붉은: 그 카드 이번 턴 피해 +75% / 푸른: 비용 -(1 + 방어력 10%) / 노란: 덱과 묘지에서 각각 1장
    pray: {
        icon: "star", color: "#f0e8b0",
        picker: (u, card) => CardOps.zonePick(
            card.def.two ? "덱·묘지에서 각 1장 (한쪽만 골라도 된다)" : "덱/묘지에서 패로 가져올 카드를 고른다",
            [["덱", u.cards.deck], ["묘지", u.cards.graveyard]],
            { total: [1, card.def.two ? 2 : 1], each: 1 }
        ),
        use(ctx) {
            const u = ctx.user;
            const d = ctx.card.def;
            const picks = ctx.picks ?? [];
            if (!picks.length) return CardOps.say("가져올 카드를 골라야 한다");
            if (picks.filter((c) => ctx.cards.deck.includes(c)).length > 1 || picks.filter((c) => ctx.cards.graveyard.includes(c)).length > 1) return CardOps.say("덱과 묘지에서 각각 1장까지만 고를 수 있다");
            if (ctx.cards.actionFull) return CardOps.say("행동 패가 가득 찼다");
            const got = [];
            for (const c of picks) {
                if (!ctx.cards.fetch(c)) continue; // 못 가져오면 못 가져온다
                got.push(c);
                if (d.boostPct) { const data = c.ensureData(); data.boostPct = d.boostPct; data.boostTurn = u.turnNo; }
                if (d.cutCost) c.ensureData().costCut = 1 + CardOps.def(u, 10);
            }
            if (!got.length) return CardOps.say("그 카드는 이제 덱·묘지에 없다");
            return [got.map((c) => new PopupAnim(u, c.name, "#f0e8b0"))];
        },
        short: (c) => {
            const d = c.def;
            return `${d.two ? "덱과 묘지에서 각각 1장" : "덱/묘지에서 1장"} 골라 패로${d.boostPct ? " · 이번 턴 피해 +" + d.boostPct + "%" : ""}${d.cutCost ? " · 비용 -" + (1 + CardOps.def(PL(), 10)) : ""}`;
        }
    },

    // 포식: 옆칸 대상 공격력 250% 피해. 처치하면 피해량의 10%(최소 1)만큼 최대 체력을 얻는다 (소멸)
    predation: {
        icon: "skull", color: "#d04050",
        target: () => ({ range: 1, radius: 0, entity: true, taps: 1, verb: "공격", color: "#d8443c" }),
        use(ctx) {
            const u = ctx.user;
            const foe = CardOps.pickAdjacent(ctx);
            if (!foe) return null;
            const steps = Combat.strike(u, foe, ctx.world, CardOps.atk(u, 250), ctx.card.name);
            const out = [steps];
            const dealt = Combat.last?.dealt ?? 0;
            if (!foe.alive) {
                const gain = Math.max(1, CardOps.pct(dealt, 10));
                u.addPerm("maxHp", gain);
                MessageLog.add(`포식! 최대 체력 +${gain}`, "#e06070");
                out.push([new PopupAnim(u, `최대 체력 +${gain}`, "#e06070")]);
            }
            return out;
        },
        short: () => `${CK.atk(CardOps.atk(PL(), 250))} 피해 · 처치하면 피해량의 10%(최소 1)만큼 최대 체력 · 소멸`
    },

    // 리로드: 1장 버리고 2 + 이동속도 25%장 뽑기. 붉은/푸른/노란: 덱에서 공격/방어/이동 카드를 가져온다
    reload: {
        icon: "cycle", color: "#a0d0ff",
        picker: CardOps.handPick("버릴 카드를 한 장 고른다", 1, 1),
        use(ctx) {
            const [pick] = ctx.picks ?? [];
            if (!pick || !ctx.cards.hand.includes(pick)) return CardOps.say("버릴 카드를 골라야 한다");
            CardOps.dump(ctx, [pick]);
            const n = 2 + CardOps.spd(ctx.user, 25);
            const tag = ctx.card.def.fetchTag;
            if (!tag) return [CardOps.draw(ctx, n)];
            const got = CardOps.fetchWhere(ctx, (c) => (c.def.tags ?? []).includes(tag), n);
            if (!got.length) MessageLog.add(`덱에 ${CARD_TAG_NAMES[tag] ?? tag} 카드가 없다`, "#c8b890");
            return [got.length ? [new PopupAnim(ctx.user, `+${got.length}장`, "#a0b8e8")] : []];
        },
        short: (c) => {
            const tag = c.def.fetchTag;
            return `1장 버리고 ${CK.spd(2 + CardOps.spd(PL(), 25))}장 ${tag ? "덱에서 " + (CARD_TAG_NAMES[tag] ?? tag) + " 카드 가져오기" : "뽑기"}`;
        }
    },

    rest: {
        icon: "plus", color: "#7cd47c", heal: false,
        // 2 + 방어력 10%만큼 마나 회복 (초록: 1 + 방어력 25%만큼 체력 회복)
        use(ctx) {
            const u = ctx.user;
            if (ctx.card.def.heal) {
                if (u.stats.hp >= u.stats.maxHp) return CardOps.say("이미 체력이 가득하다");
                const got = CardOps.heal(u, 1 + CardOps.def(u, 25));
                return [[new PopupAnim(u, "+" + got, "#7cd47c")]];
            }
            const paid = ctx.card.cost?.mana ?? 0;
            const n = 2 + CardOps.def(u, 10);
            if (u.mana - paid >= u.maxMana) return CardOps.say("이미 마나가 가득하다");
            // 마나 비용은 쓴 뒤에 나가므로, 그만큼 여유를 두고 채운다
            u.mana = Math.min(u.maxMana + paid, u.mana + n);
            MessageLog.add(`마나 ${n} 회복`, "#7cb0f0");
            return [[new PopupAnim(u, `마나 +${n}`, "#7cb0f0")]];
        },
        short(card) {
            const u = PL();
            if (card.def.heal) return CK.hp("체력 +" + (1 + CardOps.def(u, 25)));
            return CK.mana("마나 +" + (2 + CardOps.def(u, 10)));
        }
    },

    roll: {
        icon: "swirl", color: "#7cc4e8",
        // 이동속도 50% + 1
        target: (c) => ({ range: CardOps.spd(PL(), 50) + 1, radius: 0, walk: true, taps: 1, verb: "이동", color: "#7cc4e8" }),
        use(ctx) {
            const steps = CardOps.walk(ctx, CardOps.spd(ctx.user, 50) + 1);
            if (!steps) return null;
            steps.push([...CardOps.draw(ctx, 1 + CardOps.spd(ctx.user, 25))]);
            if (ctx.card.def.cleanse && Status.cleanse(ctx.user, 1)) {
                MessageLog.add("디버프를 하나 털어냈다", "#5cc86c");
                steps.push([new PopupAnim(ctx.user, "정화", "#e8e8f0")]);
            }
            return steps;
        },
        short: (c) => `${CK.spd(CardOps.spd(PL(), 50) + 1)}칸 이동 · ${CK.spd(1 + CardOps.spd(PL(), 25))}장 뽑기${c.def.cleanse ? " · 정화" : ""}`
    },

    shield: {
        icon: "shield", color: "#6aa8e8",
        use(ctx) {
            const v = CardOps.def(ctx.user, 200);
            ctx.user.addBlock(v, 3);
            MessageLog.add(`방어도 +${v} (3턴)`, "#8cc8f0");
            return [[new PopupAnim(ctx.user, "+" + v, "#8cc8f0")]];
        },
        short: () => `방어도 ${CK.def(CardOps.def(PL(), 200))} · 3턴`
    },

    shield_fix: {
        icon: "chain", color: "#9ac0e0",
        use(ctx) {
            const u = ctx.user;
            if (!u.blocks.length) return CardOps.say("고정할 방어도가 없다");
            for (const b of u.blocks) {
                b.v += Math.floor(b.v * 30 / 100);
                b.t += 1;
            }
            MessageLog.add(`방어도 ${u.blocks.length}개가 단단해졌다 (+30%, +1턴)`, "#8cc8f0");
            return [[new PopupAnim(u, "방어도+", "#8cc8f0")]];
        },
        short: () => "모든 방어도 +30% · +1턴"
    },

    sprint: {
        icon: "wing", color: "#7cc4e8",
        target: () => ({ range: 24, radius: 0, walk: true, taps: 1, verb: "질주", color: "#7cc4e8" }),
        use(ctx) {
            const steps = CardOps.walk(ctx, 99);
            if (!steps) return null;
            steps.push([...CardOps.draw(ctx, CardOps.spd(ctx.user, 50) + 2)]);
            return steps;
        },
        short: () => `거리 제한 없이 이동 · ${CK.spd(CardOps.spd(PL(), 50) + 2)}장 뽑기`
    },

    step: {
        icon: "boot", color: "#c8c8c8",
        target: () => ({ range: CardOps.spd(PL()), radius: 0, walk: true, taps: 1, verb: "이동", color: "#7cc4e8" }),
        use(ctx) {
            const steps = CardOps.walk(ctx, CardOps.spd(ctx.user));
            if (!steps) return null;
            if (ctx.card.def.strengthPerStep) {
                const n = steps.moved;
                Status.add(ctx.user, "str", n, 1);
                MessageLog.add(`힘 ${n} (1턴)`, "#f0a050");
                steps.push([new PopupAnim(ctx.user, `힘 ${n}`, Status.DEFS.str.color)]);
            }
            return steps;
        },
        short: (c) => `${CK.spd(CardOps.spd(PL()))}칸 이동${c.def.strengthPerStep ? " · " + CK.st("str", "힘 +칸 수") : ""}`
    },

    // 공격: 옆칸 단일대상 공격력 100%. 붉은: 80% 2회 / 푸른: 준비(카드를 쓸 때마다 이 카드 피해 +25%, 턴 끝에 초기화) / 노란: 1장 뽑기 ([턴 제한(3)]은 드로우 효과에)
    strike: {
        icon: "sword", color: "#e8d9b8", hits: 1, pct: 100,
        target: () => ({ range: 1, radius: 0, entity: true, taps: 1, verb: "공격", color: "#d8443c" }),
        use(ctx) {
            const foe = CardOps.pickAdjacent(ctx);
            if (!foe) return null;
            const d = ctx.card.def;
            const u = ctx.user;
            const prep = d.prepare === "strikeUp" ? ctx.card.data?.prep ?? 0 : 0;
            const dmg = Math.floor(CardOps.atk(u, d.pct) * (100 + 25 * prep) / 100 + 1e-9);
            const out = [];
            for (let i = 0; i < d.hits && foe.alive; i++) out.push(Combat.strike(u, foe, ctx.world, dmg, ctx.card.name));
            if (d.drawOnUse) {
                const key = ctx.card.defId + ":draw";
                if ((u.turnUses[key] ?? 0) < d.turnLimit) {
                    u.turnUses[key] = (u.turnUses[key] ?? 0) + 1;
                    out.push(CardOps.draw(ctx, d.drawOnUse));
                } else MessageLog.add(`${ctx.card.name}: 이번 턴 드로우는 더 못 한다 (턴 제한 ${d.turnLimit})`, "#c8b890");
            }
            return out;
        },
        short: (c) => {
            const d = c.def;
            const prep = d.prepare === "strikeUp" ? c.data?.prep ?? 0 : 0;
            const v = Math.floor(CardOps.atk(PL(), d.pct) * (100 + 25 * prep) / 100 + 1e-9);
            return `${CK.atk(v)} 피해${d.hits > 1 ? " ×" + d.hits : ""}${d.prepare === "strikeUp" ? ` · 준비 +${25 * prep}%` : ""}${d.drawOnUse ? " · 1장 뽑기" : ""}`;
        }
    },

    zoom_punch: {
        icon: "fist", color: "#f0a060",
        target: () => ({ range: 1, radius: 0, entity: true, taps: 1, verb: "공격", color: "#d8443c" }),
        // 쓸 때마다 이 카드(한 장) 의 피해가 공격력 50%씩 영구히 늘어난다 (card.data.zoom = 쓴 횟수, 저장된다)
        use(ctx) {
            const foe = CardOps.pickAdjacent(ctx);
            if (!foe) return null;
            const data = ctx.card.ensureData();
            const used = data.zoom ?? 0;
            let dmg = CardOps.atk(ctx.user, 50 * (1 + used));
            if (Status.get(foe, "stun") > 0) dmg *= 2; // 기절한 적에게는 2배
            const steps = Combat.strike(ctx.user, foe, ctx.world, dmg, ctx.card.name);
            data.zoom = used + 1;
            return [steps];
        },
        short: (c) => `${CK.atk(CardOps.atk(PL(), 50 * (1 + (c.data?.zoom ?? 0))))} 피해 · 쓸 때마다 공격력 50%씩 증가 (${c.data?.zoom ?? 0}번 씀) · 기절한 적에게 2배`
    },

    totem: {
        icon: "totem", color: "#d09860", explode: false,
        target: () => ({ range: 1, radius: 0, taps: 1, verb: "소환", color: "#7cd47c", tiles: (w) => CardOps.adjacentFree(w, PL()) }),
        use(ctx) {
            const u = ctx.user;
            const t = ctx.target;
            if (!t || !CardOps.adjacentFree(ctx.world, u).includes(`${t.x},${t.y}`)) return CardOps.say("옆 빈칸을 골라야 한다");
            const life = CardOps.totemLife(ctx.card.def, u);
            const a = ctx.world.spawn(new Ally(t.x, t.y, "totem", {
                hp: CardOps.def(u, 200), attack: ctx.card.def.explode ? CardOps.atk(u, 100) : 0, life, explode: !!ctx.card.def.explode
            }));
            MessageLog.add(`${josa(a.displayName, "을를")} 세웠다 (체력 ${a.stats.maxHp}, ${life}턴)`, "#a0d0a0");
            const anims = [new PopupAnim(a, "!", "#7cd47c")];
            anims.push(...a.ai.taunt(ctx.world));
            return [anims];
        },
        short: (c) => `토템 (체력 ${CK.def(CardOps.def(PL(), 200))} · ${CardOps.totemLife(c.def, PL())}턴) · ${CK.st("taunt", "도발")} 3칸${c.def.explode ? " · 끝나면 폭발" : ""}`
    }
};

// ---------- 강화(변형) 동작: 기본 동작 위에 덮어쓴다 ----------
const VC = { red: "#e8584a", blue: "#58a0f0", yellow: "#f0d040", green: "#5cc86c", purple: "#b078e0" };
const VARIANTS = {
    blast: {
        red: { afterHit: (u, f) => CardOps.inflict(f, "burn", CardOps.atk(u, 50), 3) },
        blue: { afterHit: (u, f) => CardOps.inflict(f, "ice", CardOps.atk(u, 50), 2) }
    },
    // 순간이동 변형. 푸른: 떠나기 직전 내 칸 3x3 적 둔화 100% 2턴 / 붉은: 남은 이동거리만큼 힘 2턴 / 노란: 거리 무제한 + 기력 1
    blink: {
        blue: {
            use(ctx) {
                const u = ctx.user;
                const foes = CardOps.foesSquare(ctx, u.x, u.y, 1);
                const steps = CardOps.teleport(ctx, CardOps.spd(u, 200));
                if (!steps) return null;
                if (foes.length) steps.unshift(foes.map((f) => CardOps.inflict(f, "slow", 100, 2)));
                return steps;
            },
            short: () => `주변 3×3 ${CK.st("slow", "둔화 100%")} 2턴 · ${CK.spd(CardOps.spd(PL(), 200))}칸 순간이동`
        },
        red: {
            use(ctx) {
                const u = ctx.user;
                const n = CardOps.spd(u, 200);
                const fx = u.x;
                const fy = u.y;
                const steps = CardOps.teleport(ctx, n);
                if (!steps) return null;
                const left = n - (Math.abs(u.x - fx) + Math.abs(u.y - fy));
                if (left > 0) {
                    Status.add(u, "str", left, 2);
                    MessageLog.add(`남은 이동거리 ${left}만큼 힘을 얻었다 (2턴)`, "#e8584a");
                    steps.push([new PopupAnim(u, `힘 ${left}`, Status.DEFS.str.color)]);
                }
                return steps;
            },
            short: () => `${CK.spd(CardOps.spd(PL(), 200))}칸 순간이동 · 남은 거리만큼 ${CK.st("str", "힘")} 2턴`
        },
        yellow: {
            target: () => ({ range: 99, radius: 0, taps: 1, verb: "순간이동", color: "#c8a0f8", move: true, tiles: (w) => CardOps.freeTiles(w, PL(), 99).filter((k) => !Status.charmBlocks(PL(), ...k.split(",").map(Number))) }),
            use(ctx) {
                const u = ctx.user;
                const steps = CardOps.teleport(ctx, 99);
                if (!steps) return null;
                const got = Math.min(1, u.maxEnergy - u.energy);
                if (got > 0) {
                    u.energy += got;
                    steps.push([new PopupAnim(u, `기력 +${got}`, "#f29a3a")]);
                }
                return steps;
            },
            short: () => `거리 무제한 순간이동 · ${CK.energy("기력 +1")} 회복`
        }
    },
    guard: {
        red: { bash: true },
        blue: { turns: 2, extendAll: true },
        yellow: { goldPct: 5 }
    },
    club: {
        red: { burnPct: 5 },
        blue: { area: true },
        yellow: { stunTurns: 2 }
    },
    dash: {
        red: { burnAround: true },
        blue: { straightBonus: true },
        yellow: { fetchMove: true }
    },
    frost: {
        red: { turns: 3, repeatIce: true },
        blue: { prepare: "frostIce" },
        yellow: { wide: true }
    },
    harden: {
        red: { strength: true },
        blue: { protect: true },
        yellow: { swift: true }
    },
    ignite: {
        red: { consume: true, burnTurns: 3 },
        blue: { longBurn: true },
        yellow: { swiftFromBurn: true }
    },
    overload: {
        red: { strengthFromSpent: true },
        blue: { shieldSwap: true },
        yellow: { discardOne: true, picker: CardOps.handPick("버릴 카드를 한 장 고른다", 1, 1) }
    },
    pray: {
        red: { boostPct: 75 },
        blue: { cutCost: true },
        yellow: { two: true }
    },
    reload: {
        red: { fetchTag: "attack" },
        blue: { fetchTag: "defense" },
        yellow: { fetchTag: "move" }
    },
    heavy: {
        red: { bonusMaxHp: 10 },
        yellow: { stun: true },
        blue: { manaOnKill: true }
    },
    rest: {
        green: { heal: true }
    },
    roll: {
        green: { cleanse: true }
    },
    step: {
        red: { strengthPerStep: true }
    },
    strike: {
        red: { pct: 80, hits: 2 },
        blue: { prepare: "strikeUp" },
        yellow: { drawOnUse: 1, limitDraw: true }
    },
    totem: {
        red: { explode: true }
    }
};
// 붉은 토템·초록 휴식 등은 설명(short)도 변형 값(def)을 읽는다 (위 CARDS의 short가 c.def를 본다)

// ---------- 데이터 → 카드 정의 ----------
class GameContent {
    static cards = new Map();    // id → 데이터 카드
    static tagNames = new Map();
    static starter = [];         // [[id, n]]
    static iconSeq = 0;

    // 설명글의 "[턴 제한(3)]" → 3 (없으면 0)
    static turnLimitOf(effect) {
        const m = /\[턴 제한\((\d+)\)\]/.exec(effect ?? "");
        return m ? +m[1] : 0;
    }

    static costObject(cost) {
        const out = {};
        for (const k of ["energy", "hp", "mana", "gold"]) if (cost && cost[k]) out[k] = cost[k];
        return out;
    }

    // 공방 카드·강화의 비용 경우들 [{ energy: 2 }, { mana: 2 }, …]. 줄이 없으면 비용 없음 [{}].
    // 옛 데이터(cost 하나)는 자원마다 한 경우로 쪼갠다 (기력 1 + 마나 1 → 기력 1짜리 · 마나 1짜리)
    static costOptions(data) {
        const list = data.costs ?? ["energy", "mana", "hp", "gold"].filter((k) => data.cost?.[k]).map((k) => ({ [k]: data.cost[k] }));
        const out = list.map((c) => GameContent.costObject(c));
        return out.length ? out : [{}];
    }

    // 설명글: 공방 글 그대로, "공격력 60%" 같은 말만 지금 숫자로 바꿔 보여 준다
    static render(effect) {
        const u = Player.current ?? { stats: { attack: Player.BASE_ATTACK, defense: Player.BASE_DEFENSE, maxHp: Player.BASE_HP }, speed: Player.BASE_SPEED, maxMana: Player.MAX_MANA };
        const speed = u.speed !== undefined ? CardOps.speed(u) : Player.BASE_SPEED;
        const names = Object.entries(Status.DEFS).map(([k, d]) => [d.name, k]);
        const statusRe = names.filter(([n]) => n.length > 1).map(([n]) => n).join("|");
        const re = new RegExp(`(공격력|방어력) (\\d+)%|이동속도 (\\d+)%|이동속도(?= 거리| 이내|만큼)|최대체력 (\\d+)%|최대마나의 (\\d+)%|(${statusRe})|(독|힘)(?= \\d| 영구)`, "g");
        const byName = Object.fromEntries(names);
        return String(effect ?? "").replace(re, (m, stat, sp, spd, mh, mm, st, st1) => {
            if (stat) {
                const v = stat === "공격력" ? CardOps.atk(u, +sp) : CardOps.def(u, +sp);
                return CardText.stat(stat === "공격력" ? "atk" : "def", +sp, v);
            }
            if (spd) return CardText.stat("spd", +spd, Math.floor(speed * +spd / 100 + 1e-9));
            if (mh) return CardText.stat("hp", +mh, CardOps.pct(u.stats.maxHp, +mh));
            if (mm) return CardText.stat("mana", +mm, CardOps.pct(u.maxMana ?? Player.MAX_MANA, +mm));
            if (m === "이동속도") return CardText.stat("spd", null, speed);
            const nm = st ?? st1;
            return nm ? `[[${byName[nm]}:${nm}]]` : m;
        });
    }

    // 카드 정의 하나 등록
    // data: 공방 카드 또는 강화 { name, cost, effect, tags }, impl: 합쳐진 동작
    static register(defId, data, impl, extra) {
        const frame = CardKit.list.length;
        const costs = GameContent.costOptions(data);
        const cost = costs[0];
        const total = costs.reduce((a, c) => a + (c.energy ?? 0) + (c.mana ?? 0), 0) / costs.length;
        const def = {
            type: "skill", sprite: "kicons", frame, kit: true, icon: impl.icon ?? "card", color: extra.color ?? impl.color ?? "#e8d9b8",
            name: data.name, cost, costs, price: Math.floor(30 + 14 * total), tags: data.tags ?? [], effect: data.effect ?? "",
            exhaust: !!impl.exhaust || (data.tags ?? []).includes("exhaustion"),
            turnLimit: GameContent.turnLimitOf(data.effect),
            grudge: impl.grudge ?? null, picker: impl.picker ?? null,
            ...impl, ...extra,
            text: () => GameContent.render(data.effect),
            short: (card) => (impl.short ? impl.short(card) : GameContent.render(data.effect).split("\n")[0]),
            target: impl.target ? (card) => impl.target.call(card.def, card) : null
        };
        if (impl.use) def.use = (ctx) => impl.use.call(def, ctx);
        else def.use = null;
        CardDef.register(defId, def);
        CardKit.list.push(CardDef.get(defId));
    }

    static load() {
        const D = GAME_DATA;
        for (const t of D.tags) GameContent.tagNames.set(t.id, t.name);
        CardDef.upgrades = new Map(); // 기본 카드 id → [변형 defId]
        for (const c of D.cards) {
            const impl = CARDS[c.id];
            if (!impl) {
                console.warn("카드 동작이 아직 없다 (data/CardImpl.js에 추가):", c.id);
                continue;
            }
            GameContent.cards.set(c.id, c);
            GameContent.register(c.id, c, impl, { base: c.id, upgradeKey: null, kind: c.kind, rarity: c.kind === "reward" ? (c.rarity ?? "common") : undefined, starter: c.kind === "basic" });
            for (const u of c.upgrades ?? []) {
                const over = VARIANTS[c.id]?.[u.key] ?? {};
                const color = VC[u.key] ?? impl.color;
                GameContent.register(`${c.id}__${u.key}`, u, { ...impl, ...over, icon: impl.icon }, {
                    base: c.id, upgradeKey: u.key, upgradeFrom: u.from ?? "default", color, kind: "upgrade"
                });
                if (!CardDef.upgrades.has(c.id)) CardDef.upgrades.set(c.id, []);
                CardDef.upgrades.get(c.id).push(`${c.id}__${u.key}`);
            }
        }
        // 시작 덱: 기본(basic) 카드 3장씩
        GameContent.starter = D.cards.filter((c) => c.kind === "basic" && CARDS[c.id]).map((c) => [c.id, 3]);
        CardSystem.STARTER = GameContent.starter;
        GameContent.buildTerms();
    }

    // 지금 카드(defId)에서 할 수 있는 강화들 [{ defId, def }]
    static upgradesOf(defId) {
        const def = CardDef.get(defId);
        if (!def || !def.base) return [];
        const from = def.upgradeKey ?? "default";
        return (CardDef.upgrades.get(def.base) ?? []).map((id) => CardDef.get(id)).filter((d) => (d.upgradeFrom ?? "default") === from);
    }

    // 용어 풀이: 데이터 태그의 설명 (상태 이상 · 원한 · 도발)
    static buildTerms() {
        const keyOf = { burning: "burn", ice: "ice", lethargy: "lethargy", hardening: "harden", slowness: "slow", strength: "str", root: "root", sturn: "stun", taunt: "taunt", poison: "poison", swift: "swift", protect: "protect" };
        const terms = [];
        for (const t of GAME_DATA.tags) {
            if (!t.note) continue;
            if (keyOf[t.id] || t.id === "grudge") terms.push([t.name, keyOf[t.id] ?? null, t.note]);
        }
        for (const [id, name] of [["exhaustion", "소멸"], ["prepare", "준비"], ["turn_limit", "턴 제한"]]) {
            const t = GAME_DATA.tags.find((x) => x.id === id);
            if (t && t.note) terms.push([t.name ?? name, null, t.note]);
        }
        terms.push(["방어도", "def", "받는 피해를 먼저 막아 주는 수치. 정해진 턴이 지나면 사라진다. (곧 끝나는 것부터 깎인다)"]);
        terms.push(["소멸", null, "쓰면 이 방에서는 다시 나오지 않는다. 다음 방에서 덱으로 돌아온다."]);
        CardText.TERMS = terms;
    }
}

// ---------- 준비 (패에 들고 있는 동안 발동하는 카드 효과) ----------
//   strikeUp: 다른 카드를 쓸 때마다 이 카드(공격 푸른 변형)의 피해 +25% (data.prep), 턴이 끝나면 초기화
//   frostIce: 턴이 끝날 때마다 이 카드(서리 푸른 변형)의 빙결 지속시간 +방어력 20% (data.iceBonus), 쓰면 초기화
class CardPrep {
    static used(user) {
        if (!user || !user.cards) return;
        for (const c of user.cards.hand) if (c.def.prepare === "strikeUp") c.ensureData().prep = (c.data.prep ?? 0) + 1;
    }

    static turnEnd(player) {
        if (!player || !player.cards) return;
        for (const c of player.cards.hand) {
            const kind = c.def.prepare;
            if (kind === "strikeUp") c.ensureData().prep = 0;
            else if (kind === "frostIce") c.ensureData().iceBonus = (c.data.iceBonus ?? 0) + CardOps.def(player, 20);
        }
    }
}
Events.on(GameEvent.CARD_USED, ({ user }) => CardPrep.used(user));

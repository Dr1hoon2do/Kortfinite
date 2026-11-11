// 이 층의 퀘스트 기록 (런에 하나, 층마다 처음부터).
// 계약 (Run이 이 모양으로 부른다):
//   QuestLog.reset(floorNo)            새 층이 시작됐다 (받은 퀘스트·진행을 비운다)
//   QuestLog.save() → JSON / QuestLog.load(data)   저장·이어하기
//   QuestLog.onRoomStart(run)          전투방(battle·elite·boss)에 들어갔다 (적이 놓인 직후)
//   QuestLog.onRoomCleared(run)        전투방의 적을 모두 쓰러뜨렸다 (우두머리 방이면 run.node.type === "boss")
// 퀘스트 진행은 이벤트(CARD_USED · DAMAGED · TURN_END)를 스스로 구독해서 센다.
//
// 퀘스트 하나 (순수 JSON): { id, kind, color, p(조건 인자), goal, progress, reward: { type, amount }, status, flags }
//   status: "offered" 게시판에 있다 · "active" 받았다 · "done" 조건을 채웠다(보상 전) · "failed" 실패 · "claimed" 보상 받음
// 조건 표 QuestLog.KINDS[kind] (새 조건은 여기 한 항목만 더하면 된다):
//   hard      어려움(초록·보라)인가
//   make(rng, deck) → 인자 p       (deck: { bases: 덱의 카드 base id들, tags: 덱에 있는 attack/move/defense })
//   goal(p) → 목표 수
//   text(p) → 조건 글 ("이 층에서 '공격' 카드를 10번 사용하기")
//   card(q, card)                   받은 뒤 플레이어가 카드를 썼다
//   hit(q, room)                    받은 뒤 플레이어가 체력을 잃었다 (room: 지금 전투방 기록)
//   cleared(q, room, ctx)           받은 뒤 전투방을 정리했다. room = { type, turns(걸린 턴), hpLost, used(쓴 카드 base들),
//                                   gainedBlock, hp, maxHp }. q.progress를 올리거나 QuestLog.fail(q)
class QuestLog {
    static MAX_ACCEPT = 2;
    static COMBAT = ["battle", "elite", "boss"];
    static TAGS = { attack: "공격", move: "이동", defense: "방어" };

    static state = { floor: 1, offers: null };
    static room = null; // 지금 전투방 기록 (적이 놓인 직후부터 정리까지)

    // ---------- 조건 표 ----------
    static KINDS = {
        // ----- 쉬움 -----
        useCard: {
            hard: false,
            make(rng, deck) {
                const useTag = deck.tags.length > 0 && (deck.bases.length === 0 || rng() < 0.5);
                if (useTag) return { tag: Rng.pick(rng, deck.tags), n: Rng.int(rng, 8, 12) };
                return { card: Rng.pick(rng, deck.bases), n: Rng.int(rng, 6, 9) };
            },
            goal: (p) => p.n,
            text: (p) => `이 층에서 ${p.tag ? `'${QuestLog.TAGS[p.tag]}'` : `'${QuestLog.cardName(p.card)}'`} 카드를 ${p.n}번 사용하기`,
            card(q, card) {
                const hit = q.p.tag ? (card.def.tags ?? []).includes(q.p.tag) : QuestLog.baseOf(card) === q.p.card;
                if (hit) q.progress++;
            }
        },
        noCard: {
            hard: false,
            make: (rng, deck) => ({ card: Rng.pick(rng, deck.bases) }),
            goal: () => 3,
            text: (p) => `이 층의 전투방 3개를 '${QuestLog.cardName(p.card)}' 없이 클리어하기`,
            cleared(q, room) {
                if (!room.used.includes(q.p.card)) q.progress++;
            }
        },
        noDamageRoom: {
            hard: false,
            make: () => ({}),
            goal: () => 1,
            text: () => "체력이 닳지 않고 전투방 1개 클리어하기",
            cleared(q, room) {
                if (!room.hpLost) q.progress++;
            }
        },
        fastRoom: {
            hard: false,
            make: (rng) => ({ n: Rng.int(rng, 5, 7) }),
            goal: () => 1,
            text: (p) => `전투방을 ${p.n}턴 안에 클리어하기`,
            cleared(q, room) {
                if (room.turns <= q.p.n) q.progress++;
            }
        },
        clearElite: {
            hard: false,
            make: () => ({}),
            goal: () => 1,
            text: () => "정예 방 클리어하기",
            cleared(q, room) {
                if (room.type === "elite") q.progress++;
            }
        },
        clearBoss: {
            hard: false,
            make: () => ({}),
            goal: () => 1,
            text: () => "이 층의 우두머리 방 클리어하기",
            cleared(q, room) {
                if (room.type === "boss") q.progress++;
            }
        },
        // ----- 어려움 -----
        bossNoDamage: {
            hard: true,
            make: () => ({}),
            goal: () => 1,
            text: () => "우두머리 방을 체력이 닳지 않고 클리어하기",
            hit(q, room) {
                if (room.type === "boss") QuestLog.fail(q, "우두머리에게 맞았다");
            },
            cleared(q, room) {
                if (room.type === "boss") q.progress++;
            }
        },
        noBlock3: {
            hard: true,
            make: () => ({}),
            goal: () => 3,
            text: () => "방어도를 한 번도 얻지 않고 전투방 3개 연속 클리어하기",
            cleared(q, room) {
                if (!room.gainedBlock) q.progress++;
                else if (q.progress > 0) {
                    q.progress = 0;
                    MessageLog.add("방어도를 얻어서 '방어도 없이' 퀘스트가 처음부터 다시 시작된다", "#c8b890");
                }
            }
        },
        eliteBossHealthy: {
            hard: true,
            make: () => ({}),
            goal: () => 2,
            text: () => "정예 방과 우두머리 방을 모두 체력 50% 이상 남기고 클리어하기",
            cleared(q, room) {
                if (room.type !== "elite" && room.type !== "boss") return;
                if (room.hp * 2 < room.maxHp) return QuestLog.fail(q, "체력이 절반 아래로 내려갔다");
                if (q.flags[room.type]) return;
                q.flags[room.type] = true;
                q.progress++;
            }
        },
        threeFast: {
            hard: true,
            make: () => ({}),
            goal: () => 3,
            text: () => "전투방 3개를 각각 3턴 안에 클리어하기",
            cleared(q, room) {
                if (room.turns <= 3) q.progress++;
            }
        }
    };

    // ---------- 보상 ----------
    // 덤: gold(돈) · hp(최대 체력의 %) · mana
    static makeReward(rng, hard) {
        const type = Rng.pick(rng, ["gold", "hp", "mana"]);
        if (type === "gold") return { type, amount: hard ? Rng.int(rng, 12, 20) * 5 : Rng.int(rng, 4, 8) * 5 };
        if (type === "hp") return { type, amount: hard ? 25 : 10 };
        return { type, amount: hard ? 10 : 5 };
    }

    static rewardText(q) {
        const r = q.reward;
        const extra = r.type === "gold" ? `${r.amount}G` : r.type === "hp" ? `체력 ${r.amount}%` : `마나 ${r.amount}`;
        return `${UpgradeFlow.COLORS[q.color].name} 강화 + ${extra}`;
    }

    // ---------- 도우미 ----------
    static baseOf(card) {
        return card.def.base ?? card.defId;
    }

    static cardName(id) {
        const d = CardDef.get(id);
        return d ? d.name : id;
    }

    static colorName(q) {
        return UpgradeFlow.COLORS[q.color].name;
    }

    // "붉은 강화 — 이 층에서 '공격' 카드를 10번 사용하기"
    static title(q) {
        return `${QuestLog.colorName(q)} 강화 — ${QuestLog.condText(q)}`;
    }

    static condText(q) {
        return QuestLog.KINDS[q.kind].text(q.p);
    }

    static progressText(q) {
        return `${Math.min(q.progress, q.goal)}/${q.goal}`;
    }

    // ---------- 층 ----------
    static reset(floorNo) {
        QuestLog.ensurePatched();
        QuestLog.state = { floor: floorNo, offers: null };
        QuestLog.room = null;
    }

    // 게시판 3개 (덱을 보고 처음 필요할 때 한 번 만들어 굳힌다)
    static get offers() {
        const s = QuestLog.state;
        if (!s.offers) s.offers = QuestLog.makeOffers(s.floor ?? Game.run?.floorNo ?? 1);
        return s.offers;
    }

    static get accepted() {
        return QuestLog.offers.filter((q) => q.status !== "offered");
    }

    static get acceptedCount() {
        return QuestLog.accepted.length;
    }

    static deckInfo() {
        const cards = Game.player ? Game.player.cards.allActions : [];
        const bases = [...new Set(cards.map((c) => QuestLog.baseOf(c)))].sort();
        const tags = Object.keys(QuestLog.TAGS).filter((t) => cards.some((c) => (c.def.tags ?? []).includes(t)));
        return { bases, tags };
    }

    static makeOffers(floorNo) {
        const rng = Rng.make(Rng.mix(Game.run?.seed ?? 0, 4200 + floorNo));
        const deck = QuestLog.deckInfo();
        const kinds = Object.keys(QuestLog.KINDS);
        const easy = Rng.shuffle(rng, kinds.filter((k) => !QuestLog.KINDS[k].hard));
        const hard = Rng.shuffle(rng, kinds.filter((k) => QuestLog.KINDS[k].hard));
        const colors = Rng.shuffle(rng, [...UpgradeFlow.EASY]).slice(0, 2).concat(Rng.pick(rng, UpgradeFlow.HARD));
        const picks = [easy[0], easy[1], hard[0]];
        return picks.map((kind, i) => {
            const def = QuestLog.KINDS[kind];
            const p = def.make(rng, deck);
            return {
                id: `q${floorNo}_${i}`, kind, color: colors[i], p, goal: def.goal(p), progress: 0,
                reward: QuestLog.makeReward(rng, def.hard), status: "offered", flags: {}
            };
        });
    }

    static find(id) {
        return QuestLog.offers.find((q) => q.id === id) ?? null;
    }

    // 받기
    static accept(id) {
        const q = QuestLog.find(id);
        if (!q || q.status !== "offered") return false;
        if (QuestLog.acceptedCount >= QuestLog.MAX_ACCEPT) return false;
        q.status = "active";
        MessageLog.add(`퀘스트를 받았다: ${QuestLog.title(q)}`, "#f0d878");
        return true;
    }

    // 보상 받기: 그 색 강화를 고른다. 후보가 없으면 보류(완료 상태 그대로), 취소해도 그대로. onDone(받았는가)
    static claim(id, onDone = null) {
        const q = QuestLog.find(id);
        const end = (ok) => onDone && onDone(ok);
        if (!q || q.status !== "done") return end(false);
        const player = Game.player;
        if (UpgradeFlow.candidates(player, [q.color]).length === 0) {
            MessageLog.add(`${QuestLog.colorName(q)} 강화를 받을 수 있는 카드가 없다. 보상은 나중에 받자`, "#c8b890");
            return end(false);
        }
        UpgradeFlow.open({
            colors: [q.color], title: "퀘스트 보상 · 카드를 고른다",
            onDone: (card) => {
                if (!card) return end(false);
                q.status = "claimed";
                QuestLog.giveExtra(q, player);
                end(true);
            }
        });
    }

    static giveExtra(q, player) {
        const r = q.reward;
        if (r.type === "gold") {
            player.money += r.amount;
            MessageLog.add(`퀘스트 보상: ${r.amount}G`, "#f0d878");
        } else if (r.type === "hp") {
            const s = player.stats;
            const n = Math.min(s.maxHp - s.hp, Math.floor(s.maxHp * r.amount / 100));
            if (n > 0) s.hp += n;
            MessageLog.add(`퀘스트 보상: 체력 ${n} 회복`, "#f0d878");
        } else {
            const n = Math.min(player.maxMana - player.mana, r.amount);
            if (n > 0) player.mana += n;
            MessageLog.add(`퀘스트 보상: 마나 ${n} 회복`, "#f0d878");
        }
    }

    // ---------- 저장 ----------
    static save() {
        return JSON.parse(JSON.stringify(QuestLog.state));
    }

    static load(data) {
        QuestLog.ensurePatched();
        QuestLog.room = null;
        QuestLog.state = data && typeof data === "object" ? JSON.parse(JSON.stringify(data)) : { floor: Game.run?.floorNo ?? 1, offers: null };
    }

    // ---------- 진행 ----------
    static active() {
        return QuestLog.offers.filter((q) => q.status === "active");
    }

    static fail(q, why) {
        if (q.status !== "active") return;
        q.status = "failed";
        MessageLog.add(`퀘스트 실패: ${QuestLog.title(q)}${why ? ` (${why})` : ""}`, "#e08070");
    }

    // 조건을 채웠는지 보고 완료 처리
    static check() {
        for (const q of QuestLog.active()) {
            if (q.progress >= q.goal) {
                q.status = "done";
                MessageLog.add(`퀘스트 완료: ${QuestLog.title(q)}. 퀘스트 방에서 보상을 받자`, "#f0d878");
            }
        }
    }

    static onCard(card) {
        const room = QuestLog.room;
        if (room) room.used.push(QuestLog.baseOf(card));
        if (!QuestLog.state.offers) return; // 게시판을 본 적 없으면 받은 퀘스트도 없다
        for (const q of QuestLog.active()) {
            const before = q.progress;
            const k = QuestLog.KINDS[q.kind];
            if (k.card) k.card(q, card);
            if (q.progress !== before && q.status === "active" && q.progress < q.goal && (q.progress % 3 === 0)) {
                MessageLog.add(`퀘스트 ${QuestLog.progressText(q)}: ${QuestLog.condText(q)}`, "#c8b890");
            }
        }
        QuestLog.check();
    }

    static onHurt() {
        const room = QuestLog.room;
        if (!room) return;
        room.hpLost = true;
        if (!QuestLog.state.offers) return;
        for (const q of QuestLog.active()) {
            const k = QuestLog.KINDS[q.kind];
            if (k.hit) k.hit(q, room);
        }
    }

    static onRoomStart(run) {
        QuestLog.ensurePatched();
        QuestLog.room = { type: run.node.type, turns: 0, hpLost: false, used: [], gainedBlock: false };
    }

    static onRoomCleared(run) {
        const room = QuestLog.room;
        QuestLog.room = null;
        if (!room || !QuestLog.state.offers) return;
        const s = run.player.stats;
        const summary = { ...room, turns: room.turns + 1, hp: s.hp, maxHp: s.maxHp }; // 정리한 그 턴까지 센다
        for (const q of QuestLog.active()) {
            const before = q.progress;
            const k = QuestLog.KINDS[q.kind];
            if (k.cleared) k.cleared(q, summary, run);
            if (q.status === "active" && q.progress > before && q.progress < q.goal) {
                MessageLog.add(`퀘스트 ${QuestLog.progressText(q)}: ${QuestLog.condText(q)}`, "#c8b890");
            }
        }
        QuestLog.check();
    }

    // 이벤트 구독 + 방어도 얻기 감시 (Player.addBlock을 한 번 감싼다)
    static ensurePatched() {
        if (QuestLog.patched) return;
        QuestLog.patched = true;
        Events.on(GameEvent.CARD_USED, ({ card, user }) => {
            if (user instanceof Player) QuestLog.onCard(card);
        });
        Events.on(GameEvent.DAMAGED, ({ target, dealt }) => {
            if (target instanceof Player && dealt > 0) QuestLog.onHurt();
        });
        Events.on(GameEvent.TURN_END, () => {
            if (QuestLog.room) QuestLog.room.turns++;
        });
        const orig = Player.prototype.addBlock;
        Player.prototype.addBlock = function (v, turns) {
            if (v > 0 && QuestLog.room) QuestLog.room.gainedBlock = true;
            return orig.call(this, v, turns);
        };
    }
}

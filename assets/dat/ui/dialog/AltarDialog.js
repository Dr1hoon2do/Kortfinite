// 제단 창. 카드(또는 피)와 돈(또는 피)을 바치고 보상을 받는다. 제단 하나는 한 번만 쓴다.
//   요구(altar.demand): cardGold 카드 1장 + 층×20G · hpGold 최대 체력 25% + 층×20G · cardHp 카드 1장 + 최대 체력 15%
//   보상(altar.rewardKind): upgrade 카드 강화(색 무관) · gear 장비 3개 중 택1 · stat 영구 능력치 택1
//   흐름: 창(요구·보상 안내) → [바친다] → (카드) 덱에서 3장을 내세워 1장 고르기 → 확인 → 비용 지불·used → 보상 고르기.
//   비용을 낸 뒤에는 보상을 다 고를 때까지 창이 닫혀도 다시 열린다 (pending).
// 계약: new AltarDialog({ engine, player, run, deckView }), open(altar), isOpen.
class AltarDialog extends Component {
    static W = 340;
    static H = 330;
    static OFFER = 3;
    static STATS = [
        ["attack", "공격력", () => Game.player.stats.attack],
        ["defense", "방어력", () => Game.player.stats.defense],
        ["speed", "이동속도", () => Game.player.speed]
    ];

    constructor(options) {
        super();
        this.engine = options.engine;
        this.player = options.player;
        this.run = options.run;
        this.deckView = options.deckView;
        this.altar = null;
        this.stage = "ask";   // ask(안내) · confirm(바칠 카드 확인) · stat(영구 능력치 고르기)
        this.card = null;     // 바치려고 고른 카드
        this.offer = null;    // 내세운 카드 3장 (고르기 전까지 그대로)
        this.pending = null;  // 비용을 낸 제단 (보상 고르는 중)
        this.kind = null;     // 실제 보상 종류
        this.gearChoices = null;
    }

    get isOpen() {
        return this.altar !== null;
    }

    start() {
        const W = AltarDialog.W;
        const { root, box } = Modal.create(this.engine, "altar", W, AltarDialog.H, () => this.dismiss());
        this.root = root;
        this.box = box;
        const dim = "#c8b890";
        this.title = UIKit.label(box, "title", "제단", 14, 10, null, 20, { fontSize: 16, fontWeight: "bold", color: "#c090f0" });
        this.intro = UIKit.label(box, "intro", "", 14, 34, null, 16, { fontSize: 11, color: dim });
        this.askHead = UIKit.label(box, "askHead", "바칠 것", 14, 58, null, 16, { fontSize: 12, fontWeight: "bold", color: UIKit.COLORS.gold });
        this.ask = UIKit.label(box, "ask", "", 14, 76, null, 44, { fontSize: 13, color: UIKit.COLORS.text, wrap: true, lineHeight: 1.4, rich: true });
        this.giveHead = UIKit.label(box, "giveHead", "받을 것", 14, 124, null, 16, { fontSize: 12, fontWeight: "bold", color: UIKit.COLORS.gold });
        this.give = UIKit.label(box, "give", "", 14, 142, null, 84, { fontSize: 13, color: UIKit.COLORS.text, wrap: true, lineHeight: 1.4, rich: true });
        this.warn = UIKit.label(box, "warn", "", 14, 232, null, 30, { fontSize: 12, color: "#e8584a", wrap: true, lineHeight: 1.3 });
        this.main = UIKit.button(box, "main", "바친다", () => this.onMain(), { fontSize: 14 });
        this.main.rt.setAnchor(0, 1, 1, 1);
        this.main.rt.setOffsets(14, -86, 14, 44);
        this.sub = UIKit.button(box, "sub", "나중에", () => this.onSub(), { fontSize: 12 });
        this.sub.rt.setAnchor(0, 1, 1, 1);
        this.sub.rt.setOffsets(14, -36, 14, 10);
        // 영구 능력치 선택 버튼 (큰 것 셋)
        this.statButtons = AltarDialog.STATS.map(([key, name], i) => {
            const b = UIKit.button(box, "stat_" + key, "", () => this.takeStat(key), { fontSize: 14 });
            b.rt.setAnchor(0, 0, 1, 0);
            b.rt.setOffsets(14, 82 + i * 52, 14, -(82 + i * 52 + 44));
            return b;
        });
        root.setActive(false);
    }

    // ---------- 비용 ----------
    costs(altar) {
        const s = this.player.stats;
        return { gold: altar.gold, hp: altar.hpCost(s.maxHp), card: altar.needsCard() };
    }

    costText(altar, card) {
        const c = this.costs(altar);
        const parts = [];
        if (c.card) parts.push(card ? `카드 「${card.name}」` : "카드 1장 (덱에서 무작위 3장 중 고른다)");
        if (c.hp) parts.push(`체력 ${c.hp} (지금 ${this.player.stats.hp}/${this.player.stats.maxHp})`);
        if (c.gold) parts.push(`${c.gold} G (지금 ${this.player.money} G)`);
        return parts.map((t) => "· " + t).join("\n");
    }

    // 못 바치는 이유 (없으면 null)
    shortage(altar) {
        const c = this.costs(altar);
        if (c.gold && this.player.money < c.gold) return `돈이 모자라다 (${c.gold} G 필요, ${this.player.money} G)`;
        if (c.hp && this.player.stats.hp <= c.hp) return `체력이 모자라다 (남는 체력이 1 이상이어야 한다: 체력 ${c.hp} 필요, ${this.player.stats.hp})`;
        if (c.card && this.player.cards.allActions.length === 0) return "바칠 카드가 덱에 없다";
        return null;
    }

    // ---------- 보상 ----------
    // 이 제단의 보상 종류 (자리·후보가 없으면 영구 능력치로 바꾼다)
    resolveKind(altar) {
        let kind = altar.rewardKind;
        if (kind === "upgrade" && UpgradeFlow.candidates(this.player).length === 0) kind = "stat";
        if (kind === "gear") {
            const choices = this.gearChoicesFor(altar);
            if (choices.length === 0 || !this.player.cards.canAdd(choices[0])) kind = "stat";
        }
        return kind;
    }

    gearChoicesFor(altar) {
        if (!altar._gear) altar._gear = Rewards.gear(Rng.make(Rng.mix(altar.data.seed ?? 0, 4242)), 3, "treasure", this.run.ownedGear());
        return altar._gear;
    }

    giveText(altar, kind) {
        if (kind === "upgrade") return "카드 강화 (색 상관없이)\n· 강화할 카드를 고르고, 갈래가 여럿이면 강화 하나를 고른다";
        if (kind === "gear") return `장비 (${this.gearChoicesFor(altar).length}개 중 1개)\n· ${this.gearChoicesFor(altar).map((c) => c.name).join(", ")}`;
        return "영구 능력치 (1개 고른다)\n· 공격력 +1 / 방어력 +1 / 이동속도 +1";
    }

    // ---------- 창 ----------
    open(altar) {
        if (this.pending) altar = this.pending;
        if (altar.used && this.pending !== altar) return MessageLog.add("제단은 이미 힘을 잃었다 (이미 썼다)", "#c8b890");
        this.altar = altar;
        if (this.pending) return this.continueReward();
        this.card = null;
        this.setStage("ask");
        Modal.show(this.root, true);
    }

    setStage(stage) {
        this.stage = stage;
        const a = this.altar;
        const stat = stage === "stat";
        for (const g of [this.askHead, this.ask, this.giveHead, this.give, this.warn, this.main, this.sub]) g.gameObject ? g.gameObject.setActive(!stat) : g.go.setActive(!stat);
        this.statButtons.forEach((b) => b.go.setActive(stat));
        Modal.fit(this.engine, this.box, AltarDialog.W, AltarDialog.H);
        if (stat) {
            this.title.setText("제단 · 영구 능력치");
            this.intro.setText("보상을 하나 고른다. 영원히 오른다.");
            AltarDialog.STATS.forEach(([key, name, cur], i) => this.statButtons[i].text.setText(`${name} +1  (${cur()} → ${cur() + 1})`));
            return;
        }
        this.title.setText("제단");
        if (stage === "confirm") {
            this.intro.setText("이대로 바칠까? 바친 것은 돌려받지 못한다.");
            this.askHead.setText("바칠 것");
            this.ask.setText(this.costText(a, this.card));
            this.give.setText(this.giveText(a, this.resolveKind(a)));
            this.warn.setText("");
            this.main.text.setText("확인하고 바친다");
            this.sub.text.setText("돌아가기");
            UIKit.setEnabled(this.main, true);
            return;
        }
        this.intro.setText("제단이 대가를 요구한다. 한 번만 쓸 수 있다.");
        this.ask.setText(this.costText(a, null));
        this.give.setText(this.giveText(a, this.resolveKind(a)));
        const why = this.shortage(a);
        this.warn.setText(why ?? "");
        this.main.text.setText(why ? "바칠 수 없다" : "바친다");
        UIKit.setEnabled(this.main, !why);
        this.sub.text.setText("나중에");
    }

    close() {
        if (!this.altar) return;
        this.altar = null;
        Modal.show(this.root, false);
    }

    // 닫기 시도 (바깥 탭·Esc): 비용을 낸 뒤에는 닫히지 않는다
    dismiss() {
        if (this.pending) return;
        this.close();
    }

    onSub() {
        if (this.stage === "confirm") return this.setStage("ask");
        this.dismiss();
    }

    onMain() {
        const a = this.altar;
        if (!a) return;
        if (this.stage === "confirm") return this.pay();
        if (this.shortage(a)) return;
        if (!a.needsCard()) {
            this.card = null;
            return this.pay();
        }
        this.pickCard();
    }

    // 덱에서 무작위 3장(서로 다른 카드)을 내세워 1장 고르게 한다
    pickCard() {
        const a = this.altar;
        if (!this.offer || this.offer.some((c) => !this.player.cards.allActions.includes(c))) {
            const pool = [...this.player.cards.allActions];
            const out = [];
            const seen = new Set();
            // 이름이 다른 카드를 먼저, 모자라면 같은 이름도
            for (const pass of [true, false]) {
                while (out.length < AltarDialog.OFFER) {
                    const cand = pool.filter((c) => !out.includes(c) && (!pass || !seen.has(c.defId)));
                    if (cand.length === 0) break;
                    const c = cand[Math.floor(Math.random() * cand.length)];
                    out.push(c);
                    seen.add(c.defId);
                }
            }
            this.offer = out;
        }
        this.close();
        this.pickFlow("제단 · 바칠 카드를 고른다", this.offer, (card) => {
            this.card = card;
            this.altar = a;
            this.setStage("confirm");
            Modal.show(this.root, true);
        }, () => {
            // 취소: 아무것도 안 낸 채 창으로 돌아간다
            this.altar = a;
            this.setStage("ask");
            Modal.show(this.root, true);
        });
    }

    // DeckViewer.pick + 취소 알림 (고르지 않고 닫히면 onCancel)
    pickFlow(title, cards, onPick, onCancel) {
        UpgradeFlow.pick(this.deckView, title, cards, onPick, onCancel);
    }

    // 비용을 내고 제단을 쓴 것으로 한다
    pay() {
        const a = this.altar;
        if (!a || a.used || this.shortage(a)) return;
        const p = this.player;
        const c = this.costs(a);
        if (c.card) {
            if (!this.card || !p.cards.removeCard(this.card)) return this.setStage("ask");
        }
        if (c.gold) p.money -= c.gold;
        if (c.hp) p.stats.hp -= c.hp;
        a.used = true;
        const paid = [];
        if (c.card) paid.push(`카드 ${this.card.name}`);
        if (c.hp) paid.push(`체력 ${c.hp}`);
        if (c.gold) paid.push(`${c.gold} G`);
        MessageLog.add(`제단에 바쳤다: ${paid.join(", ")}`, "#c090f0");
        this.queuePopup(c.hp ? `-${c.hp} HP` : null, "#e8584a");
        this.pending = a;
        this.offer = null;
        this.card = null;
        this.kind = this.resolveKind(a);
        this.continueReward();
    }

    queuePopup(text, color) {
        const q = this.run.queue;
        if (text && q) q.play(new PopupAnim(this.player, text, color));
    }

    // 보상 고르기 (끝낼 때까지 취소하면 다시 묻는다)
    continueReward() {
        const a = this.pending;
        if (!a) return;
        this.altar = a;
        // 그 사이 사정이 바뀌었을 수 있다 (강화할 카드·패 자리)
        this.kind = this.resolveKind(a);
        if (this.kind === "stat") {
            this.setStage("stat");
            return Modal.show(this.root, true);
        }
        this.close();
        const again = () => Promise.resolve().then(() => this.continueReward());
        if (this.kind === "upgrade") {
            UpgradeFlow.open({ colors: null, title: "제단 · 강화할 카드를 고른다", onDone: (card) => {
                if (!card) return again();
                this.finish(`제단의 힘으로 ${card.name} 강화`, card.name);
            } });
            return;
        }
        const choices = this.gearChoicesFor(a);
        this.pickFlow("제단 · 장비를 고른다 (3개 중 1개)", choices, (card) => {
            if (!this.player.cards.addToHand(card)) {
                MessageLog.add("패가 가득 차서 장비를 가질 수 없다. 자리를 비우고 다시 고르자", "#e8584a");
                return again();
            }
            this.finish(`${josa(card.name, "을를")} 얻었다 (제단 보상)`, card.name);
        }, again);
    }

    takeStat(key) {
        if (!this.pending) return;
        const [, name] = AltarDialog.STATS.find((s) => s[0] === key);
        this.player.addPerm(key, 1);
        this.finish(`제단의 축복: ${name} +1`, `${name} +1`);
    }

    finish(message, popup) {
        MessageLog.add(message, "#f0c080");
        this.pending = null;
        this.close();
        this.queuePopup(popup, "#c090f0");
    }

    update() {
        if (this.altar && Input.getButtonDown("cancel")) this.dismiss();
    }
}

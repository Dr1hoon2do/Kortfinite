// 모닥불 창 (휴식처). 넷 중 하나만 고른다:
//   쉬기   — 최대 체력의 30%를 회복한다
//   명상   — 마나를 가득 채운다
//   정리   — 덱에서 카드 한 장을 아주 없앤다 (공짜)
//   강화   — 강화할 수 있는 카드 한 장을 골라, 강화 카드로 바꾼다 (재료가 든다. 재료는 적을 잡으면 떨어진다)
// 고르면 모닥불은 다 쓴 것이 되고, 출구로 나가면 된다.
class RestDialog extends Component {
    static HEAL = 0.3;

    constructor(options) {
        super();
        this.engine = options.engine;
        this.player = options.player;
        this.deckView = options.deckView;
        this.fire = null;
        this.buttons = [];
    }

    get isOpen() {
        return this.fire !== null;
    }

    start() {
        const { root, box } = Modal.create(this.engine, "rest", 320, 296, () => this.close());
        this.root = root;
        this.box = box;
        UIKit.label(box, "title", "모닥불", 14, 10, null, 18, { fontSize: 14, fontWeight: "bold", color: UIKit.COLORS.gold });
        UIKit.label(box, "sub", "따뜻하다. 하나만 고를 수 있다.", 14, 32, null, 14, { fontSize: 11, color: "#c8b890" });
        this.options = [
            ["heal", () => `쉬기 · 체력 +${this.healAmount()} (최대의 30%)`, () => this.heal()],
            ["mana", () => `명상 · 마나를 가득 (${this.player.mana}/${this.player.maxMana})`, () => this.meditate()],
            ["purge", () => "정리 · 덱에서 카드 한 장 빼기", () => this.purge()],
            ["upgrade", () => `강화 · 카드 한 장 강화 (${this.upgradable().length}장 가능)`, () => this.upgrade()]
        ];
        this.options.forEach(([id, , fn], i) => {
            const b = UIKit.button(box, id, "", fn, { fontSize: 12 });
            b.rt.setAnchor(0, 0, 1, 0);
            b.rt.setOffsets(14, 58 + i * 44, 14, -(58 + i * 44 + 36));
            this.buttons.push(b);
        });
        const close = UIKit.button(box, "close", "나중에", () => this.close(), { fontSize: 12 });
        close.rt.setAnchor(0, 1, 1, 1);
        close.rt.setOffsets(14, -42, 14, 10);
    }

    healAmount() {
        const s = this.player.stats;
        return Math.min(s.maxHp - s.hp, Math.floor(s.maxHp * RestDialog.HEAL + 1e-9));
    }

    open(fire) {
        this.fire = fire;
        this.options.forEach(([, label], i) => this.buttons[i].text.setText(label()));
        UIKit.setEnabled(this.buttons[0], this.healAmount() > 0);
        UIKit.setEnabled(this.buttons[1], this.player.mana < this.player.maxMana);
        UIKit.setEnabled(this.buttons[2], this.player.cards.allActions.length > 1);
        UIKit.setEnabled(this.buttons[3], this.upgradable().length > 0);
        Modal.fit(this.engine, this.box, 320, 296);
        Modal.show(this.root, true);
    }

    close() {
        if (!this.fire) return;
        this.fire = null;
        Modal.show(this.root, false);
    }

    done(message) {
        if (this.fire) this.fire.used = true;
        MessageLog.add(message, "#f0c080");
        this.close();
    }

    heal() {
        const n = this.healAmount();
        if (n <= 0) return;
        this.player.stats.hp += n;
        this.player.overlay && (this.player.overlay.popup = null);
        this.done(`푹 쉬었다. 체력 ${n} 회복`);
    }

    meditate() {
        const p = this.player;
        if (p.mana >= p.maxMana) return;
        const n = p.maxMana - p.mana;
        p.mana = p.maxMana;
        this.done(`명상했다. 마나 ${n} 회복`);
    }

    purge() {
        const fire = this.fire;
        this.close();
        this.deckView.pick("정리 · 없앨 카드를 고른다", this.player.cards.allActions, (card) => {
            if (!this.player.cards.removeCard(card)) return;
            fire.used = true;
            MessageLog.add(`${josa(card.name, "을를")} 모닥불에 던졌다 (덱에서 빠졌다)`, "#f0c080");
        });
    }

    // 강화할 수 있는 카드들
    upgradable() {
        return this.player.cards.allActions.filter((c) => GameContent.upgradesOf(c.defId).length > 0);
    }

    // 재료가 모자라는 것 [{ id, need, have }]
    lacking(def) {
        return (def.upgradeMats ?? []).map((m) => ({ id: m.id, need: m.count ?? 1, have: this.player.matCount(m.id) })).filter((m) => m.have < m.need);
    }

    // 강화: 카드 고르기 → (갈래가 여럿이면) 강화 고르기 → 재료를 내고 그 자리에서 바꾼다
    upgrade() {
        const fire = this.fire;
        this.close();
        this.deckView.pick("강화 · 카드를 고른다", this.upgradable(), (card) => {
            const opts = GameContent.upgradesOf(card.defId);
            const previews = opts.map((d) => Object.assign(new Card(d.id), { data: card.data ? { ...card.data } : null }).rollCost());
            const apply = (preview) => {
                const def = preview.def;
                const lack = this.lacking(def);
                if (lack.length) {
                    MessageLog.add(`재료가 모자라다: ${lack.map((m) => `${GameContent.materials.get(m.id)?.name ?? m.id} ${m.have}/${m.need}`).join(", ")}`, "#e07060");
                    return;
                }
                for (const m of def.upgradeMats ?? []) this.player.mats[m.id] -= m.count ?? 1;
                const before = card.name;
                card.defId = def.id;
                card.rollCost();
                this.player.cards._changed();
                fire.used = true;
                MessageLog.add(`${before} → ${card.name} 강화했다`, "#f0c080");
            };
            if (previews.length === 1) return apply(previews[0]);
            this.deckView.pick(`강화 · ${card.name}`, previews, apply);
        });
    }

    update() {
        if (this.fire && Input.getButtonDown("cancel")) this.close();
    }
}

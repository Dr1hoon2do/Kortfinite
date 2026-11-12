// 젬 끼우기 창 (턴 안 씀). 아래 패에서 연다. 젬은 패·덱·묘지 어디에 있는 스킬 카드에든 끼울 수 있다.
//   카드 보기 (스킬 카드를 골라 [젬]): 그 카드의 젬 칸들 — 끼운 젬은 [빼기](깨진다, 두 번 눌러 확인),
//                                       아래에 패의 젬들 — [끼우기] (효과가 없거나 칸이 차면 흐리게, 이유 표시)
//   젬 보기 (젬을 골라 [끼우기]): 패·덱·묘지의 스킬 카드들 — [끼우기] (어디에 있는지 같이 보인다)
// 끼운 젬은 직접 빼면 깨진다.
class GemDialog extends Component {
    static ROW = 46;

    constructor(options) {
        super();
        this.engine = options.engine;
        this.player = options.player;
        this.card = null;   // 카드 보기: 이 스킬 카드
        this.gem = null;    // 젬 보기: 이 젬
        this.rows = [];
        this.confirm = null; // 빼기 확인 중인 젬 칸 번호
        this._key = null;
    }

    get cards() {
        return this.player.cards;
    }

    get isOpen() {
        return !!(this.card || this.gem);
    }

    start() {
        const { root, box } = Modal.create(this.engine, "gemDialog", 340, 420, () => this.close());
        this.root = root;
        this.box = box;
        this.title = UIKit.label(box, "title", "", 14, 10, null, 18, { fontSize: 13, fontWeight: "bold", color: UIKit.COLORS.gold });
        this.sub = UIKit.label(box, "sub", "", 14, 30, null, 30, { fontSize: 11, color: "#c8b890", wrap: true, lineHeight: 1.3 });

        const list = box.createChild("list");
        this.list = list.getComponent(RectTransform);
        this.list.setAnchor(0, 0, 1, 1);
        this.list.setOffsets(12, 64, 12, 52);
        list.addComponent(new UIRect({ color: "rgba(0, 0, 0, 0.25)" }));
        list.addComponent(new UIMask());
        this.content = this.list.createChild("content").getComponent(RectTransform);
        const bar = this.list.createChild("scrollbar");
        bar.addComponent(new UIRect({ color: "rgba(232, 217, 184, 0.45)" }));
        this.scroll = list.addComponent(new UIScrollView({ content: this.content, bar: bar.getComponent(RectTransform) }));

        const close = UIKit.button(box, "close", "닫기", () => this.close(), { fontSize: 13 });
        close.rt.setAnchor(0, 1, 1, 1);
        close.rt.setOffsets(12, -44, 12, 10);
    }

    openCard(card) {
        this.card = card;
        this.gem = null;
        this._open();
    }

    openGem(gem) {
        this.gem = gem;
        this.card = null;
        this._open();
    }

    _open() {
        this.confirm = null;
        this._key = null;
        this.scroll.scrollTo(0);
        Modal.fit(this.engine, this.box, 340, 420);
        Modal.show(this.root, true);
    }

    close() {
        if (!this.isOpen) return;
        this.card = null;
        this.gem = null;
        Modal.show(this.root, false);
    }

    update() {
        if (!this.isOpen) return;
        if (Input.getButtonDown("cancel") || !this.player.alive) return this.close();
        const hand = this.cards.hand;
        // 고른 카드가 패에서 사라졌으면 닫는다 (젬을 끼워 젬이 사라진 경우는 카드 보기로 바뀐다)
        if (this.card && !this.cards.allActions.includes(this.card)) return this.close();
        if (this.gem && !hand.includes(this.gem)) return this.close();
        const key = this.cards.version + ":" + this.confirm;
        if (key !== this._key) {
            this._key = key;
            this.rebuild();
        }
    }

    addRow(y, { def, name, info, button, ok, onTap, warn = false }) {
        const h = GemDialog.ROW;
        const go = this.content.createChild("row");
        const rt = UIKit.place(go, 6, y, null, h - 6);
        go.addComponent(new UIRect({ color: "rgba(42, 35, 30, 0.95)", borderColor: UIKit.COLORS.border, borderWidth: 1 }));
        if (def) UIKit.icon(rt, "icon", def, 4, 4, 32);
        const x = def ? 44 : 10;
        UIKit.label(rt, "name", name, x, 5, null, 15, { fontSize: 12, fontWeight: "bold" });
        UIKit.label(rt, "info", info, x, 22, null, 14, { fontSize: 10, color: "#c8b890" });
        if (button) {
            const b = UIKit.button(rt, "act", button, onTap, { fontSize: 11 });
            b.rt.setAnchor(1, 0, 1, 0);
            b.rt.setOffsets(-66, 6, 6, -34);
            UIKit.setEnabled(b, ok);
            if (warn) b.rect.color = "#7a3a2a";
        }
        this.rows.push(go);
        return y + h;
    }

    header(y, text) {
        const go = this.content.createChild("header");
        UIKit.place(go, 6, y, null, 18);
        go.addComponent(new UIText(text, { fontSize: 11, fontWeight: "bold", color: UIKit.COLORS.gold, align: "left", verticalAlign: "top" }));
        this.rows.push(go);
        return y + 20;
    }

    rebuild() {
        for (const row of this.rows) row.destroy();
        this.rows = [];
        let y = 6;
        if (this.card) y = this.buildCard(y);
        else y = this.buildGem(y);
        this.scroll.contentHeight = y + 2;
    }

    // 카드 보기: 젬 칸 + 패의 젬
    buildCard(y) {
        const card = this.card;
        const { sockets, gems } = Spell.data(card);
        this.title.setText(`젬 · ${card.name} (칸 ${gems.length}/${sockets}) · ${this.zoneOf(card)}`);
        this.sub.setText(Spell.short(card) + ` · 비용 ${Spell.costText(Spell.payCost(card))}`);

        y = this.header(y, "젬 칸");
        for (let i = 0; i < sockets; i++) {
            const saved = gems[i];
            if (!saved) {
                y = this.addRow(y, { def: null, name: `${i + 1}번 칸 · 비어 있음`, info: "아래 젬을 골라 끼운다" });
                continue;
            }
            const gem = Card.load(saved);
            const confirming = this.confirm === i;
            y = this.addRow(y, {
                def: gem.def, name: gem.name, info: confirming ? "한 번 더 누르면 깨뜨리며 뺀다" : Gem.summary(gem),
                button: confirming ? "깨뜨리기" : "빼기(깨짐)", ok: true, warn: confirming,
                onTap: () => {
                    if (this.confirm !== i) {
                        this.confirm = i;
                        return;
                    }
                    this.confirm = null;
                    Gem.unsocket(this.cards, card, i, false);
                }
            });
        }

        y = this.header(y + 4, "패의 젬");
        const owned = this.cards.hand.filter((c) => c.def.gem);
        if (!owned.length) y = this.addRow(y, { def: null, name: "패에 젬이 없다", info: "상점·보물·정예 보상에서 얻는다" });
        for (const gem of owned) {
            const why = Gem.whyNot(card, gem);
            y = this.addRow(y, {
                def: gem.def, name: gem.name, info: why || Gem.summary(gem),
                button: "끼우기", ok: !why, onTap: () => Gem.socket(this.cards, card, gem)
            });
        }
        return y;
    }

    // 카드가 있는 곳 이름
    zoneOf(card) {
        const c = this.cards;
        return c.hand.includes(card) ? "패" : c.deck.includes(card) ? "덱" : c.graveyard.includes(card) ? "묘지" : "소멸";
    }

    // 젬 보기: 패·덱·묘지의 스킬 카드 (끼울 수 있는 것부터)
    buildGem(y) {
        const gem = this.gem;
        this.title.setText(`끼우기 · ${gem.name}`);
        this.sub.setText(Gem.summary(gem) + " — 끼울 스킬 카드를 고른다 (패·덱·묘지 어디든)");
        const spells = this.cards.allActions.filter((c) => c.def.spell);
        spells.sort((a, b) => (Gem.whyNot(a, gem) ? 1 : 0) - (Gem.whyNot(b, gem) ? 1 : 0));
        if (!spells.length) y = this.addRow(y, { def: null, name: "덱에 스킬 카드가 없다", info: "주문 카드(마법 화살 등)에 젬 칸이 있다" });
        for (const card of spells) {
            const why = Gem.whyNot(card, gem);
            const { sockets, gems } = Spell.data(card);
            y = this.addRow(y, {
                def: card.def, name: `${card.name} · 칸 ${gems.length}/${sockets} · ${this.zoneOf(card)}`,
                info: why || Spell.short(card),
                button: "끼우기", ok: !why,
                onTap: () => {
                    if (Gem.socket(this.cards, card, gem)) this.openCard(card);
                }
            });
        }
        return y;
    }
}

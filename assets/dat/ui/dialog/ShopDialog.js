// 상점 창 (상인에게 말을 걸면). 물건마다 한 줄: 그림, 이름, 짧은 설명, 값 [사기].
//   행동 카드(주문 포함)는 사면 덱에 들어간다. 장비·소모품·젬은 패에 들어간다 (자리가 있어야).
//   맨 아래 [카드 빼기]: 덱에서 카드 한 장을 아주 없앤다 (상점마다 한 번, 값은 할 때마다 오른다).
// 거래는 턴을 쓰지 않는다.
class ShopDialog extends Component {
    static ROW = 64;

    constructor(options) {
        super();
        this.engine = options.engine;
        this.player = options.player;
        this.run = options.run;
        this.deckView = options.deckView;
        this.npc = null;
        this.rows = [];
        this._key = null;
    }

    get isOpen() {
        return this.npc !== null;
    }

    start() {
        const { root, box } = Modal.create(this.engine, "shop", 360, 520, () => this.close());
        this.root = root;
        this.box = box;
        this.title = UIKit.label(box, "title", "", 14, 10, null, 18, { fontSize: 13, fontWeight: "bold", color: UIKit.COLORS.gold });
        this.line = UIKit.label(box, "line", "", 14, 30, null, 30, { fontSize: 11, color: "#e8d9b8", wrap: true, lineHeight: 1.3 });
        this.moneyText = UIKit.label(box, "money", "", 14, 60, null, 16, { fontSize: 12, color: "#f0d878" });

        const list = box.createChild("list");
        this.list = list.getComponent(RectTransform);
        this.list.setAnchor(0, 0, 1, 1);
        this.list.setOffsets(12, 82, 12, 52);
        list.addComponent(new UIRect({ color: "rgba(0, 0, 0, 0.25)" }));
        list.addComponent(new UIMask());
        this.content = this.list.createChild("content").getComponent(RectTransform);
        const bar = this.list.createChild("scrollbar");
        bar.addComponent(new UIRect({ color: "rgba(232, 217, 184, 0.45)" }));
        this.scroll = list.addComponent(new UIScrollView({ content: this.content, bar: bar.getComponent(RectTransform) }));

        const close = UIKit.button(box, "close", "나가기", () => this.close(), { fontSize: 13 });
        close.rt.setAnchor(0, 1, 1, 1);
        close.rt.setOffsets(12, -44, 12, 10);
    }

    open(npc) {
        this.npc = npc;
        this.title.setText(`상점 · ${npc.displayName}`);
        this.line.setText(`"${npc.line()}"`);
        this._key = null;
        Modal.fit(this.engine, this.box, 360, 520);
        Modal.show(this.root, true);
        this.scroll.scrollTo(0);
    }

    close() {
        if (!this.npc) return;
        this.npc = null;
        CardInspector.hide(this);
        CardInspector.untrack(this);
        Modal.show(this.root, false);
    }

    update() {
        if (!this.npc) return;
        if (Input.getButtonDown("cancel")) return this.close();
        if (!this.npc.alive || this.npc.angry || !this.player.alive) return this.close();
        this.moneyText.setText(`내 돈 ${this.player.money} G`);
        const key = [this.player.money, this.player.cards.version, this.npc.stock.map((s) => s.sold ? 1 : 0).join(""), this.run.removeCount].join("|");
        if (key !== this._key) {
            this._key = key;
            this.rebuild();
        }
    }

    addRow(y, { def, name, info, button, ok, onTap, faded, card }) {
        const h = ShopDialog.ROW - 6;
        const go = this.content.createChild("row");
        const rt = UIKit.place(go, 6, y, null, h);
        const bg = go.addComponent(new UIRect({ color: faded ? "rgba(30, 26, 22, 0.8)" : "rgba(42, 35, 30, 0.95)", borderColor: UIKit.COLORS.border, borderWidth: 1 }));
        // 줄을 누르면 카드 정보 창 (마우스를 올려도)
        if (card) {
            go.addComponent(new UIButton({ onTap: () => this.inspect(card, rt, bg) }));
            CardInspector.track(this, rt, card, true);
        }
        UIKit.icon(rt, "icon", def, 4, 5, 36);
        // 글자 칸: 오른쪽 값 버튼과 겹치지 않게 잘라서 보인다
        const box = rt.createChild("text");
        const brt = box.getComponent(RectTransform);
        brt.setAnchor(0, 0, 1, 1);
        brt.setOffsets(48, 0, 80, 0);
        box.addComponent(new UIMask());
        UIKit.label(brt, "name", name, 0, 6, null, 15, { fontSize: 12, fontWeight: "bold", color: faded ? UIKit.COLORS.faint : UIKit.COLORS.text });
        UIKit.label(brt, "info", info, 0, 22, null, 30, { fontSize: 10, color: faded ? UIKit.COLORS.faint : "#c8b890", rich: !faded, wrap: true, lineHeight: 1.3 });
        const b = UIKit.button(rt, "deal", button, onTap, { fontSize: 11 });
        b.rt.setAnchor(1, 0, 1, 0);
        b.rt.setOffsets(-70, (h - 30) / 2, 6, -((h - 30) / 2 + 30));
        UIKit.setEnabled(b, ok);
        this.rows.push(go);
        return y + ShopDialog.ROW;
    }

    rebuild() {
        for (const row of this.rows) row.destroy();
        this.rows = [];
        CardInspector.untrack(this);
        const p = this.player;
        let y = 6;
        for (const offer of this.npc.stock) {
            const card = offer.card;
            const where = card.isSkill ? "덱에" : "패에";
            const kind = CardDef.kindName(card.def) + (card.def.rarity ? ` · ${ShopDialog.RARITY[card.def.rarity]}` : "");
            const fits = card.isSkill || p.cards.canAdd(card);
            y = this.addRow(y, {
                def: card.def, name: offer.sold ? `${card.name} (팔림)` : card.name,
                info: `${kind}${card.cost ? " · " + CardDef.costText(card.cost) : ""} · ${card.summary.split("\n")[0]}`,
                button: offer.sold ? "팔림" : fits ? `${offer.price} G` : "패가 가득",
                ok: !offer.sold && fits && p.money >= offer.price,
                faded: offer.sold,
                card,
                onTap: () => this.buy(offer, where)
            });
        }
        const cost = this.run.removeCost;
        y = this.addRow(y + 6, {
            def: { sprite: "cards", frame: 9 }, name: "카드 빼기",
            info: `덱에서 카드 한 장을 아주 없앤다 (이 상점에서 뺄 때마다 +25 G${this.run.removeCount ? `, ${this.run.removeCount}번 뺐다` : ""})`,
            button: `${cost} G`, ok: p.money >= cost && p.cards.allActions.length > 1,
            onTap: () => this.remove()
        });
        this.scroll.contentHeight = y + 4;
    }

    static RARITY = { common: "흔함", uncommon: "드묾", rare: "희귀", boss: "우두머리" };

    // 물건 줄을 누르면 크게 보기 (다시 누르면 닫기)
    inspect(card, rt, bg) {
        if (this._selBg) this._selBg.borderColor = UIKit.COLORS.border;
        this.selected = this.selected === card ? null : card;
        this._selBg = this.selected ? bg : null;
        if (bg && this.selected) bg.borderColor = UIKit.COLORS.gold;
        if (this.selected) CardInspector.show(card, { verbose: true, owner: this, near: rt });
        else CardInspector.hide(this);
    }

    buy(offer, where) {
        const p = this.player;
        if (offer.sold || p.money < offer.price) return;
        const card = offer.card;
        if (card.isSkill) p.cards.addToDeck(card);
        else if (!p.cards.addToHand(card)) {
            MessageLog.add("패가 가득 차서 살 수 없다", "#c8b890");
            return;
        }
        p.money -= offer.price;
        this.npc.money += offer.price;
        offer.sold = true;
        MessageLog.add(`${josa(card.name, "을를")} ${offer.price} G에 샀다 (${where})`, "#e8c860");
    }

    remove() {
        const p = this.player;
        const cost = this.run.removeCost;
        if (p.money < cost || p.cards.allActions.length <= 1) return;
        const npc = this.npc;
        this.deckView.pick(`카드 빼기 (${cost} G) · 없앨 카드를 고른다`, p.cards.allActions, (card) => {
            if (p.money < cost || this.run.removeCost !== cost) return;
            if (!p.cards.removeCard(card)) return;
            p.money -= cost;
            npc.money += cost;
            this.run.removeCount++;
            MessageLog.add(`${josa(card.name, "을를")} 덱에서 뺐다 (${cost} G)`, "#e8c860");
        });
    }
}

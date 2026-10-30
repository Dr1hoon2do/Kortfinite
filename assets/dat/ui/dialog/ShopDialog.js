// 상점 창 (상인에게 말을 걸면). 물건마다 한 줄: 그림, 이름, 짧은 설명, 값 [사기].
//   목록은 페이지식이다: 한 쪽에 들어가는 만큼만 보이고, 아래 [▲]/[▼]로 쪽을 넘긴다 (끌어서 스크롤하지 않는다).
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
        this.list.setOffsets(12, 82, 12, 94);
        list.addComponent(new UIRect({ color: "rgba(0, 0, 0, 0.25)" }));
        list.addComponent(new UIMask());
        this.content = this.list.createChild("content").getComponent(RectTransform);
        this.content.setAnchor(0, 0, 1, 1);
        this.content.setOffsets(0, 0, 0, 0);

        // 쪽 넘기기: [▲] 1/2 쪽 [▼]
        this.page = 0;
        this.prevButton = UIKit.button(box, "prev", "▲ 위", () => this.turnPage(-1), { fontSize: 12 });
        this.prevButton.rt.setAnchor(0, 1, 0.4, 1);
        this.prevButton.rt.setOffsets(12, -86, 3, 52);
        this.pageText = UIKit.label(box, "page", "", 0, 0, null, 18, { fontSize: 12, color: "#c8b890", align: "center", verticalAlign: "middle" });
        const prt = this.pageText.gameObject.getComponent(RectTransform);
        prt.setAnchor(0.4, 1, 0.6, 1);
        prt.setOffsets(0, -86, 0, 52);
        this.nextButton = UIKit.button(box, "next", "▼ 아래", () => this.turnPage(1), { fontSize: 12 });
        this.nextButton.rt.setAnchor(0.6, 1, 1, 1);
        this.nextButton.rt.setOffsets(3, -86, 12, 52);

        const close = UIKit.button(box, "close", "나가기", () => this.close(), { fontSize: 13 });
        close.rt.setAnchor(0, 1, 1, 1);
        close.rt.setOffsets(12, -44, 12, 10);
    }

    open(npc) {
        this.npc = npc;
        this.title.setText(`상점 · ${npc.displayName}`);
        this.line.setText(`"${npc.line()}"`);
        this._key = null;
        this.page = 0;
        Modal.fit(this.engine, this.box, 360, 520);
        Modal.show(this.root, true);
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
        const key = [this.player.money, this.player.cards.version, this.npc.stock.map((s) => s.sold ? 1 : 0).join(""), this.run.removeCount, this.page, this.pageSize()].join("|");
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

    // 한 쪽에 들어가는 줄 수 (목록 높이 ÷ 줄 높이)
    pageSize() {
        const h = this.list.rect.height / this.list.uiRoot.scale;
        return Math.max(1, Math.floor((h - 6) / ShopDialog.ROW));
    }

    turnPage(d) {
        CardInspector.hide(this);
        this.page += d;
        this._key = null; // 다음 update에서 다시 그린다 (쪽이 범위를 넘으면 rebuild가 바로잡는다)
    }

    // 목록의 모든 줄: 물건들 + 맨 아래 [카드 빼기]
    entries() {
        return [...this.npc.stock.map((offer) => ({ offer })), { remove: true }];
    }

    rebuild() {
        for (const row of this.rows) row.destroy();
        this.rows = [];
        CardInspector.untrack(this);
        const p = this.player;
        const entries = this.entries();
        const size = this.pageSize();
        const pages = Math.max(1, Math.ceil(entries.length / size));
        this.page = Math.max(0, Math.min(pages - 1, this.page));
        this.pageText.setText(`${this.page + 1} / ${pages} 쪽`);
        UIKit.setEnabled(this.prevButton, this.page > 0);
        UIKit.setEnabled(this.nextButton, this.page < pages - 1);
        let y = 6;
        for (const entry of entries.slice(this.page * size, this.page * size + size)) {
            if (entry.remove) {
                const cost = this.run.removeCost;
                y = this.addRow(y, {
                    def: { sprite: "cards", frame: 9 }, name: "카드 빼기",
                    info: `덱에서 카드 한 장을 아주 없앤다 (이 상점에서 뺄 때마다 +25 G${this.run.removeCount ? `, ${this.run.removeCount}번 뺐다` : ""})`,
                    button: `${cost} G`, ok: p.money >= cost && p.cards.allActions.length > 1,
                    onTap: () => this.remove()
                });
                continue;
            }
            const offer = entry.offer;
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
    }

    static RARITY = { common: "흔함", uncommon: "드묾", rare: "희귀", boss: "우두머리" };

    // 물건 줄을 누르면 크게 보기 (다시 누르면 닫기)
    inspect(card, rt, bg) {
        const same = this.selected === card;
        CardInspector.hide(this); // 앞에 고른 줄 표시를 푼다 (onHide)
        if (same) return;
        this.selected = card;
        this._selBg = bg;
        if (bg) bg.borderColor = UIKit.COLORS.gold;
        CardInspector.show(card, {
            verbose: true, owner: this, near: rt,
            onHide: () => {
                if (this._selBg) this._selBg.borderColor = UIKit.COLORS.border;
                this._selBg = null;
                this.selected = null;
            }
        });
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

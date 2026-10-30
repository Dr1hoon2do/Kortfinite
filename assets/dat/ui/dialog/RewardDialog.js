// 보상 창: 전투에서 이기거나 보물 상자를 열면 뜬다.
//   돈은 창이 뜰 때 바로 들어온다. 카드 3장 중 하나를 골라 덱에 넣는다(건너뛸 수 있다). 물건은 하나씩 [가져가기] (패에 자리가 있어야).
// 창을 닫아도 못 가진 보상은 남는다: 화면 위 가운데 [보상] 버튼으로 다시 연다 (다음 방에 들어가면 사라진다).
class RewardDialog extends Component {
    static CARD_W = 84;

    constructor(options) {
        super();
        this.engine = options.engine;
        this.player = options.player;
        this.reward = null; // { title, gold, cards, items, picked }
        this.views = [];
        this.rows = [];
        this.choice = null;
    }

    get isOpen() {
        return this.root && this.root.isActive;
    }

    // 아직 안 가진 게 남았는가
    get unclaimed() {
        const r = this.reward;
        return !!r && ((!r.picked && r.cards.length > 0) || r.items.length > 0);
    }

    start() {
        const { root, box } = Modal.create(this.engine, "reward", 340, 460, () => this.close());
        this.root = root;
        this.box = box;
        this.title = UIKit.label(box, "title", "", 14, 10, null, 18, { fontSize: 14, fontWeight: "bold", color: UIKit.COLORS.gold });
        this.goldText = UIKit.label(box, "gold", "", 14, 32, null, 16, { fontSize: 12, color: "#f0d878" });
        this.cardLabel = UIKit.label(box, "cardLabel", "카드 한 장을 골라 덱에 넣는다", 14, 54, null, 14, { fontSize: 11, color: "#c8b890" });
        this.cardRow = box.createChild("cards").getComponent(RectTransform);
        this.cardRow.setAnchor(0, 0, 1, 0);
        this.cardRow.setOffsets(0, 72, 0, -(72 + 150));
        this.takeCard = UIKit.button(box, "takeCard", "이 카드를 덱에 넣기", () => this.pickCard(), { fontSize: 12 });
        this.itemsRT = box.createChild("items").getComponent(RectTransform);
        this.itemsRT.setAnchor(0, 0, 1, 0);
        this.closeButton = UIKit.button(box, "close", "닫기", () => this.close(), { fontSize: 13 });
        this.closeButton.rt.setAnchor(0, 1, 1, 1);
        this.closeButton.rt.setOffsets(12, -44, 12, 10);

        // 다시 열기 버튼 (위 가운데)
        this.reopen = this.engine.createUI("rewardReopen");
        const rrt = this.reopen.getComponent(RectTransform);
        rrt.sortOrder = UILayer.TARGET;
        rrt.setAnchor(0.5, 0, 0.5, 0);
        rrt.setSizeAndPosition(110, 30, 0, 86);
        const b = UIKit.button(rrt, "button", "보상 받기", () => this.show(), { fontSize: 12 });
        b.rt.setAnchor(0, 0, 1, 1);
        b.rect.borderColor = UIKit.COLORS.gold;
        this.reopen.setActive(false);
        Events.on(GameEvent.ROOM_ENTERED, () => {
            this.reward = null;
            this.reopen.setActive(false);
        }, { owner: this });
    }

    // reward: { title, gold, cards: [Card], items: [Card] }
    open(reward) {
        this.reward = { ...reward, picked: false };
        if (reward.gold) {
            this.player.money += reward.gold;
            MessageLog.add(`${reward.gold} G를 얻었다`, "#f0d878");
        }
        this.show();
    }

    show() {
        if (!this.reward) return;
        const r = this.reward;
        this.choice = null;
        this.title.setText(r.title);
        this.goldText.setText(r.gold ? `돈 +${r.gold} G (지금 ${this.player.money} G)` : "");
        this.build();
        Modal.show(this.root, true);
        this.reopen.setActive(false);
    }

    close() {
        if (!this.isOpen) return;
        CardInspector.hide(this);
        CardInspector.untrack(this);
        Modal.show(this.root, false);
        this.reopen.setActive(this.unclaimed);
    }

    build() {
        const r = this.reward;
        for (const v of this.views) v.go.destroy();
        for (const row of this.rows) row.destroy();
        this.views = [];
        this.rows = [];
        CardInspector.untrack(this);
        CardInspector.hide(this);
        const showCards = !r.picked && r.cards.length > 0;
        this.cardLabel.gameObject.setActive(showCards);
        this.takeCard.go.setActive(showCards);
        const w = RewardDialog.CARD_W;
        const h = Math.round(w * 5 / 3);
        let y = 72;
        if (showCards) {
            const boxW = Modal.fit(this.engine, this.box, 340, 460).width;
            const gap = 10;
            const total = r.cards.length * w + (r.cards.length - 1) * gap;
            r.cards.forEach((card, i) => {
                const go = this.cardRow.createChild("card");
                const view = go.addComponent(new CardView(card));
                view.layout(w);
                CardView.place(go, (boxW - total) / 2 + i * (w + gap), 0, w, h);
                go.addComponent(new UIButton({ onTap: () => this.choose(card) }));
                this.views.push({ go, view, card });
                CardInspector.track(this, go.getComponent(RectTransform), card, true);
            });
            this.cardRow.setOffsets(0, y, 0, -(y + h));
            y += h + 8;
            this.takeCard.rt.setAnchor(0, 0, 1, 0);
            this.takeCard.rt.setOffsets(40, y, 40, -(y + 30));
            y += 40;
        }
        UIKit.setEnabled(this.takeCard, false);
        this.itemsRT.setOffsets(12, y, 12, -(y + r.items.length * 46));
        r.items.forEach((card, i) => {
            const go = this.itemsRT.createChild("item");
            const rt = UIKit.place(go, 0, i * 46, null, 40);
            go.addComponent(new UIRect({ color: "rgba(42, 35, 30, 0.95)", borderColor: UIKit.COLORS.border, borderWidth: 1 }));
            go.addComponent(new UIButton({ onTap: () => CardInspector.show(card, { verbose: true, owner: this, near: rt }) }));
            CardInspector.track(this, rt, card, true);
            UIKit.icon(rt, "icon", card.def, 4, 4, 32);
            UIKit.label(rt, "name", card.name, 44, 5, null, 15, { fontSize: 12, fontWeight: "bold" });
            UIKit.label(rt, "info", card.summary.split("\n")[0], 44, 21, null, 14, { fontSize: 10, color: "#c8b890", rich: true });
            const fits = this.player.cards.canAdd(card);
            const b = UIKit.button(rt, "take", fits ? "가져가기" : "패가 가득", () => this.take(card), { fontSize: 11 });
            b.rt.setAnchor(1, 0, 1, 0);
            b.rt.setOffsets(-78, 6, 6, -34);
            UIKit.setEnabled(b, fits);
            this.rows.push(go);
        });
        y += r.items.length * 46;
        if (!showCards && !r.items.length) {
            this.cardLabel.gameObject.setActive(true);
            this.cardLabel.setText(r.picked ? "보상을 모두 받았다" : "받을 것이 없다");
        } else this.cardLabel.setText("카드 한 장을 골라 덱에 넣는다 (건너뛰어도 된다)");
        Modal.fit(this.engine, this.box, 340, Math.max(200, y + 60));
    }

    choose(card) {
        this.choice = card;
        for (const v of this.views) v.view.setSelected(v.card === card);
        UIKit.setEnabled(this.takeCard, true);
        this.takeCard.text.setText(`[${card.name}] 덱에 넣기`);
        const v = this.views.find((x) => x.card === card);
        CardInspector.show(card, { verbose: true, owner: this, near: v ? v.go.getComponent(RectTransform) : null });
    }

    pickCard() {
        const r = this.reward;
        if (!r || r.picked || !this.choice) return;
        r.picked = true;
        this.player.cards.addToDeck(this.choice);
        MessageLog.add(`${josa(this.choice.name, "을를")} 덱에 넣었다`, "#a0b8e8");
        this.build();
    }

    take(card) {
        const r = this.reward;
        if (!this.player.cards.addToHand(card)) {
            MessageLog.add("패가 가득 찼다", "#c8b890");
            return;
        }
        r.items.splice(r.items.indexOf(card), 1);
        MessageLog.add(`${josa(card.name, "을를")} 얻었다`, "#e8c860");
        this.build();
    }

    update() {
        if (this.isOpen && Input.getButtonDown("cancel")) this.close();
        if (!this.isOpen && this.reopen.isActive && !this.unclaimed) this.reopen.setActive(false);
    }
}

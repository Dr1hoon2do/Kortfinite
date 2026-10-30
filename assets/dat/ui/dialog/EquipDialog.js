// 장비 창: 소지품 패에 있는 장비를 장착·해제한다 (턴을 쓰지 않는다).
//   전투 중에는 아래 패에서 장비 카드를 눌러 [장착]/[해제] 하면 되고, 지도 화면(HandBar가 가려진 곳)에서는 이 창을 쓴다.
//   장비는 장착해도 패에 그대로 남는다. 착용 중인 것은 위에, 그 아래에 안 입은 것. 같은 부위는 한 장만 입을 수 있다
//   (다른 것을 입으면 입고 있던 것이 풀린다). 패가 넘치게 되는 장착·해제는 막힌다 (Card.js CardSystem).
class EquipDialog extends Component {
    static ROW = 56;

    // options: { engine, player }
    constructor(options) {
        super();
        this.engine = options.engine;
        this.player = options.player;
        this.rows = [];
        this._key = null;
        this.opened = false;
    }

    get isOpen() {
        return this.opened;
    }

    start() {
        const { root, box } = Modal.create(this.engine, "equip", 340, 460, () => this.close());
        this.root = root;
        this.box = box;
        UIKit.label(box, "title", "장비", 14, 10, null, 18, { fontSize: 14, fontWeight: "bold", color: UIKit.COLORS.gold });
        this.info = UIKit.label(box, "info", "", 14, 32, null, 30, { fontSize: 11, color: "#c8b890", wrap: true, lineHeight: 1.3 });
        const list = box.createChild("list");
        this.list = list.getComponent(RectTransform);
        this.list.setAnchor(0, 0, 1, 1);
        this.list.setOffsets(12, 66, 12, 52);
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

    open() {
        if (this.opened) return;
        this.opened = true;
        this._key = null;
        Modal.fit(this.engine, this.box, 340, 460);
        Modal.show(this.root, true);
        this.scroll.scrollTo(0);
    }

    close() {
        if (!this.opened) return;
        this.opened = false;
        CardInspector.hide(this);
        CardInspector.untrack(this);
        Modal.show(this.root, false);
    }

    update() {
        if (!this.opened) return;
        if (Input.getButtonDown("cancel")) return this.close();
        const cards = this.player.cards;
        const key = cards.version + ":" + cards.hand.length;
        if (key !== this._key) {
            this._key = key;
            this.rebuild();
        }
    }

    rebuild() {
        for (const row of this.rows) row.destroy();
        this.rows = [];
        CardInspector.untrack(this);
        const cards = this.player.cards;
        const gear = cards.hand.filter((c) => c.def.slot);
        const worn = gear.filter((c) => cards.isEquipped(c));
        const rest = gear.filter((c) => !cards.isEquipped(c));
        this.info.setText("장비는 장착해도 패에 남는다. 장착·해제는 턴을 쓰지 않고, 해제하면 그 효과도 바로 사라진다.");
        let y = 6;
        const section = (text) => {
            UIKit.label(this.content, "sec", text, 8, y, null, 14, { fontSize: 11, fontWeight: "bold", color: "#c8b890" });
            y += 18;
        };
        section(`착용 중 (${worn.length})`);
        if (!worn.length) {
            UIKit.label(this.content, "none", "입은 장비가 없다", 8, y, null, 14, { fontSize: 11, color: UIKit.COLORS.faint });
            y += 20;
        }
        for (const card of worn) y = this.addRow(y, card, true);
        y += 6;
        section(`패에 있는 장비 (${rest.length})`);
        if (!rest.length) {
            UIKit.label(this.content, "none2", "더 가진 장비가 없다 (상점, 정예, 보물, 우두머리에서 얻는다)", 8, y, null, 14, { fontSize: 11, color: UIKit.COLORS.faint });
            y += 20;
        }
        for (const card of rest) y = this.addRow(y, card, false);
        this.scroll.contentHeight = y + 6;
    }

    addRow(y, card, worn) {
        const h = EquipDialog.ROW - 6;
        const go = this.content.createChild("row");
        const rt = UIKit.place(go, 6, y, null, h);
        const bg = go.addComponent(new UIRect({ color: worn ? "rgba(58, 46, 24, 0.95)" : "rgba(42, 35, 30, 0.95)", borderColor: worn ? "#b07820" : UIKit.COLORS.border, borderWidth: 1 }));
        go.addComponent(new UIButton({ onTap: () => CardInspector.show(card, { verbose: true, owner: this, near: rt }) }));
        CardInspector.track(this, rt, card, true);
        UIKit.icon(rt, "icon", card.def, 4, 5, 36);
        const box = rt.createChild("text");
        const brt = box.getComponent(RectTransform);
        brt.setAnchor(0, 0, 1, 1);
        brt.setOffsets(48, 0, 80, 0);
        box.addComponent(new UIMask());
        UIKit.label(brt, "name", card.name, 0, 5, null, 15, { fontSize: 12, fontWeight: "bold" });
        UIKit.label(brt, "info", `${CardDef.slotName(card.def.slot)} · ${card.summary.split("\n")[0]}`, 0, 21, null, 26, { fontSize: 10, color: "#c8b890", rich: true, wrap: true, lineHeight: 1.3 });
        const b = UIKit.button(rt, "toggle", worn ? "해제" : "장착", () => this.toggle(card), { fontSize: 11 });
        b.rt.setAnchor(1, 0, 1, 0);
        b.rt.setOffsets(-70, (h - 30) / 2, 6, -((h - 30) / 2 + 30));
        this.rows.push(go);
        return y + EquipDialog.ROW;
    }

    toggle(card) {
        const cards = this.player.cards;
        if (cards.isEquipped(card)) cards.unequip(card);
        else cards.equip(card);
    }
}

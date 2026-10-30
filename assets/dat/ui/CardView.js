// 카드 한 장을 그리는 UI. 3:5 비율이고, 위에서부터 정사각형 그림(가로 전체) → 제목 → 종류 → 설명.
// 종류에 따라 바탕색이 다르다: 스킬은 푸른 종이, 아이템은 누런 종이, 도구는 회색 종이. 선택되면 테두리가 금색으로 두꺼워진다.
// 묶음(count > 1)이면 그림 오른쪽 아래에 "x3"이 붙는다.
// 2열 목록에서는 카드가 좁아서 설명이 다 안 들어간다. 잘린 설명은 패널 아래 상세 칸에서 본다.
// RectTransform이 있는 오브젝트에 붙이고, 크기는 layout(width)로 정한다 (UI 단위).
class CardView extends Component {
    static BORDER = 2;
    static INSET = 4;
    static STYLE = {
        skill: { paper: "#cfd8e8", ink: "#1e2638", sub: "#46506a", tag: "#3a5a9a" },
        item: { paper: "#e8d9b8", ink: "#2a1e16", sub: "#5a4a3a", tag: "#8a6a2a" },
        tool: { paper: "#d4d0c8", ink: "#24221e", sub: "#4a4640", tag: "#5a5a6a" },
        gem: { paper: "#ddd0e8", ink: "#261e30", sub: "#4e4260", tag: "#6a4a9a" }
    };

    static styleOf(def) {
        if (def.gem) return CardView.STYLE.gem;
        return def.slot ? CardView.STYLE.tool : CardView.STYLE[def.type];
    }

    // equipped: 장착 중이면 true (위에 "장착" 딱지)
    constructor(card, equipped = false) {
        super();
        this.card = card;
        this.equipped = equipped;
        this.width = 0;
        this.height = 0;
        this.selected = false;
    }

    awake() {
        const rt = this.getComponent(RectTransform);
        const def = this.card.def;
        const style = CardView.styleOf(def);

        this.frame = this.addComponent(new UIRect({ color: style.paper, borderColor: style.ink, borderWidth: CardView.BORDER }));
        this.addComponent(new UIMask());

        this.well = rt.createChild("image");
        this.well.addComponent(new UIRect({ color: "#3a332d", borderColor: style.ink, borderWidth: 1 }));
        this.well.addComponent(new UIImage(Resource.image(def.sprite), {
            region: { x: def.frame * 16, y: 0, width: 16, height: 16 }
        }));

        this.badge = rt.createChild("count");
        this.badgeBack = this.badge.addComponent(new UIRect({ color: "rgba(20, 14, 10, 0.85)" }));
        this.badgeText = this.badge.getComponent(RectTransform).createChild("text").addComponent(new UIText("", {
            fontSize: 11, fontWeight: "bold", color: "#ffffff"
        }));
        this.badgeText.getComponent(RectTransform).setAnchor(0, 0, 1, 1);

        // 장착 중 표시 (그림 왼쪽 위)
        this.worn = rt.createChild("equipped");
        this.worn.addComponent(new UIRect({ color: "rgba(232, 184, 64, 0.95)", borderColor: "#2a1e16", borderWidth: 1 }));
        const wt = this.worn.getComponent(RectTransform).createChild("text").addComponent(new UIText("장착", {
            fontSize: 10, fontWeight: "bold", color: "#2a1e16"
        }));
        wt.getComponent(RectTransform).setAnchor(0, 0, 1, 1);
        this.worn.setActive(!!this.equipped);

        this.title = rt.createChild("title");
        this.titleText = this.title.addComponent(new UIText(this.card.name, {
            fontSize: 13, fontWeight: "bold", color: style.ink, align: "left", verticalAlign: "top"
        }));

        this.tag = rt.createChild("kind");
        const cost = CardDef.costText(this.card.cost);
        this.tag.addComponent(new UIText(CardDef.kindName(def) + (cost ? " · " + cost : ""), {
            fontSize: 10, color: style.tag, align: "left", verticalAlign: "top"
        }));

        // 비용 딱지 (그림 왼쪽 아래). 좁은 카드는 종류 줄 대신 이것만 보인다
        this.costBadge = rt.createChild("cost");
        this.costBadge.addComponent(new UIRect({ color: "rgba(20, 14, 10, 0.85)", borderColor: "#e8b840", borderWidth: 1 }));
        this.costText = this.costBadge.getComponent(RectTransform).createChild("text").addComponent(new UIText(CardDef.costShort(this.card.cost), {
            fontSize: 9, fontWeight: "bold", color: "#f0d090"
        }));
        this.costText.getComponent(RectTransform).setAnchor(0, 0, 1, 1);
        this.costBadge.setActive(!!this.costText.text);

        this.desc = rt.createChild("description");
        this.desc.addComponent(new UIText(this.card.summary, {
            fontSize: 10, color: style.sub, align: "left", verticalAlign: "top", wrap: true, lineHeight: 1.3, rich: true, palette: "dark"
        }));

        this.setSelected(this.selected);
        if (this.width) this._placeChildren();
    }

    setSelected(value) {
        this.selected = value;
        if (!this.frame) return;
        this.frame.borderColor = value ? "#e8b840" : this.equipped ? "#b07820" : CardView.styleOf(this.card.def).ink;
        this.frame.borderWidth = value ? 4 : CardView.BORDER;
    }

    // width를 받아 3:5 높이를 정해 돌려준다. 카드 자신의 위치는 부모(목록)가 정한다.
    // awake 전에 불려도 되도록, 안쪽 배치는 자식이 만들어진 뒤에 한다.
    layout(width) {
        this.width = width;
        this.height = Math.round(width * 5 / 3);
        if (this.well) this._placeChildren();
        return this.height;
    }

    // 묶음 개수가 바뀌면 다시 그린다 (목록 전체를 다시 만들지 않고)
    refreshCount() {
        const count = this.card.count;
        this.badge.setActive(count > 1);
        if (count <= 1) return;
        const text = "x" + count;
        this.badgeText.setText(text);
        const inset = CardView.INSET;
        const image = this.width - inset * 2;
        const w = 8 + text.length * 7;
        CardView.place(this.badge, inset + image - w - 2, inset + image - 18, w, 16);
    }

    // 좁은 카드(패)는 그림을 줄이고 종류 줄을 빼서 설명이 두 줄 들어가게 한다
    get narrow() {
        return this.width < 76;
    }

    _placeChildren() {
        const inset = CardView.INSET;
        const full = this.width - inset * 2;
        const image = this.narrow ? Math.min(full, Math.round(this.height * 0.4)) : full;
        const text = this.width - inset * 2 - 4;
        const textTop = inset + image + 3;
        const ix = Math.round((this.width - image) / 2);

        CardView.place(this.well, ix, inset, image, image);
        CardView.place(this.worn, ix + 2, inset + 2, 30, 15);
        CardView.place(this.title, inset + 2, textTop, text, 16);
        this.tag.setActive(!this.narrow);
        const cw = Math.min(image - 2, 8 + this.costText.text.length * 6);
        CardView.place(this.costBadge, ix + 1, inset + image - 14, cw, 13);
        this.costBadge.setActive(!!this.costText.text && this.narrow);
        const descTop = this.narrow ? textTop + 16 : textTop + 30;
        if (!this.narrow) CardView.place(this.tag, inset + 2, textTop + 16, text, 13);
        CardView.place(this.desc, inset + 2, descTop, text, this.height - descTop - inset);
        this.refreshCount();
    }

    // 부모 왼쪽 위 기준으로 x, y, w, h (UI 단위)
    static place(go, x, y, w, h) {
        const rt = go.getComponent(RectTransform);
        rt.setPivot(0, 0);
        rt.setSizeAndPosition(w, h, x, y);
    }
}

// 카드 격자 창. 덱 보기(덱 / 묘지 / 전체), 내 카드(가진 행동 카드 전부), "카드 고르기"(카드 빼기 등)에 같이 쓴다.
//   open()                     — 전투용 덱 보기: [덱] [묘지] [전체] 탭. 덱은 순서를 감추려고 이름순. 설명 수치는 짧게 ("5 피해")
//   openOwned()                — 내 카드 (오른쪽 위 [덱] 버튼): 장비 카드·임시 카드·소지품을 뺀 행동 카드. 설명 수치는 자세히 ("공격력 100%(5) 피해")
//   pick(title, cards, onPick) — 카드를 하나 고르면 onPick(card)를 부르고 닫힌다
//   pickMany(title, cards, { min, max }, onDone) — 카드를 여러 장 눌러 고르고 [확정]하면 onDone([카드…])를 부르고 닫힌다 (그만두면 부르지 않는다)
// 카드를 누르면 아래 칸에 설명이 나온다 (고르기 모드면 [고르기] 버튼, 덱 보기에서 젬 칸이 있는 스킬 카드면 [젬] 버튼).
class DeckViewer extends Component {
    static TABS = [["deck", "덱"], ["graveyard", "묘지"], ["all", "전체"]];
    static CARD_W = 80;

    constructor(options) {
        super();
        this.engine = options.engine;
        this.player = options.player;
        this.gems = options.gems ?? null; // GemDialog: 덱·묘지의 스킬 카드에도 젬을 끼운다
        this.mode = null;  // "view" | "owned" | "pick"
        this.tab = "deck";
        this.views = [];
        this.selected = null;
        this.picked = [];  // 여러 장 고르기에서 고른 카드들
    }

    get isOpen() {
        return this.mode !== null;
    }

    start() {
        const { root, box } = Modal.create(this.engine, "deckViewer", 420, 560, () => this.close());
        this.root = root;
        this.box = box;
        this.title = UIKit.label(box, "title", "", 14, 10, null, 18, { fontSize: 13, fontWeight: "bold", color: UIKit.COLORS.gold });

        const tabs = box.createChild("tabs");
        this.tabsRT = tabs.getComponent(RectTransform);
        this.tabsRT.setAnchor(0, 0, 1, 0);
        this.tabsRT.setOffsets(12, 34, 12, -60);
        this.tabButtons = {};
        DeckViewer.TABS.forEach(([id, label], i) => {
            const n = DeckViewer.TABS.length;
            const b = UIKit.button(this.tabsRT, id, label, () => this.setTab(id));
            b.rt.setAnchor(i / n, 0, (i + 1) / n, 1);
            b.rt.setOffsets(i === 0 ? 0 : 2, 0, i === n - 1 ? 0 : 2, 0);
            this.tabButtons[id] = b;
        });

        const list = box.createChild("list");
        this.list = list.getComponent(RectTransform);
        this.list.setAnchor(0, 0, 1, 1);
        list.addComponent(new UIRect({ color: "rgba(0, 0, 0, 0.25)" }));
        list.addComponent(new UIMask());
        this.content = this.list.createChild("content").getComponent(RectTransform);
        const bar = this.list.createChild("scrollbar");
        bar.addComponent(new UIRect({ color: "rgba(232, 217, 184, 0.45)" }));
        this.scroll = list.addComponent(new UIScrollView({
            content: this.content, bar: bar.getComponent(RectTransform),
            onTap: (pointer) => {
                const v = this.views.find((v) => UIKit.contains(v.go.getComponent(RectTransform), pointer.position));
                if (!v) return;
                if (this.mode === "multi") return this.toggle(v.card);
                this.select(v.card === this.selected ? null : v.card);
            }
        }));
        this.emptyText = UIKit.label(this.list, "empty", "", 0, 20, null, 16, { fontSize: 11, color: UIKit.COLORS.dim, align: "center" });

        // 아래: 설명 + 버튼
        this.info = UIKit.label(box, "info", "", 14, 0, null, 50, { fontSize: 12, color: "#d8c8a0", wrap: true, lineHeight: 1.35, rich: true });
        this.pickButton = UIKit.button(box, "pick", "고르기", () => this.confirm(), { fontSize: 13 });
        this.closeButton = UIKit.button(box, "close", "닫기", () => this.close(), { fontSize: 13 });
    }

    open() {
        this.mode = "view";
        this.onPick = null;
        this.title.setText("덱 보기 (이번 전투)");
        this.setTab("deck");
        this.show();
    }

    // 내가 가진 행동 카드 (장비 카드·임시 카드 제외)
    openOwned() {
        this.mode = "owned";
        this.onPick = null;
        this.title.setText(`내 카드 ${this.ownedCards().length}장`);
        this.selected = null;
        this.scroll.scrollTo(0);
        this.rebuild();
        this.show();
    }

    ownedCards() {
        return this.player.cards.allActions.filter((k) => !k.isToken && !k.isTemp);
    }

    // 설명 수치를 자세히 쓰는가 (전투 중 패·덱·묘지만 짧게)
    get verbose() {
        return this.mode !== "view";
    }

    // 카드 하나 고르기
    pick(title, cards, onPick) {
        this.mode = "pick";
        this.onPick = onPick;
        this.pickCards = cards;
        this.title.setText(title);
        this.selected = null;
        this.rebuild();
        this.show();
    }

    // 카드 여러 장 고르기 (min 이상 max 이하). 고른 카드는 눌린 채로 보인다
    pickMany(title, cards, { min = 0, max = 1 } = {}, onDone) {
        this.mode = "multi";
        this.onDone = onDone;
        this.pickCards = cards;
        this.range = { min, max };
        this.picked = [];
        this.title.setText(title);
        this.selected = null;
        this.rebuild();
        this.show();
    }

    toggle(card) {
        const i = this.picked.indexOf(card);
        if (i >= 0) this.picked.splice(i, 1);
        else if (this.picked.length < this.range.max) this.picked.push(card);
        else if (this.range.max === 1) this.picked = [card];
        this.select(card);
    }

    show() {
        const { width, height } = Modal.fit(this.engine, this.box, 420, 560);
        this.size = { width, height };
        const pick = this.mode === "pick" || this.mode === "multi";
        const tabs = this.mode === "view";
        this.tabsRT.gameObject.setActive(tabs);
        // 아래 설명 칸: 4줄 (넘치는 글은 카드 정보 창이 보여 준다)
        const infoH = 74;
        this.list.setOffsets(12, tabs ? 64 : 34, 12, 56 + infoH + 6);
        this.info.getComponent(RectTransform).setOffsets(14, height - 56 - infoH, 14, -(height - 56));
        this.closeButton.text.setText(pick ? "그만두기" : "닫기");
        this.layoutButtons(pick);
        this.select(this.selected);
        Modal.show(this.root, true);
        this._width = null;
    }

    // 아래 버튼: 두 개면 반씩, 하나면 꽉 차게
    layoutButtons(two) {
        this.pickButton.go.setActive(two);
        if (two) {
            this.pickButton.rt.setAnchor(0, 1, 0.5, 1);
            this.pickButton.rt.setOffsets(12, -46, 3, 10);
            this.closeButton.rt.setAnchor(0.5, 1, 1, 1);
            this.closeButton.rt.setOffsets(3, -46, 12, 10);
        } else {
            this.closeButton.rt.setAnchor(0, 1, 1, 1);
            this.closeButton.rt.setOffsets(12, -46, 12, 10);
        }
    }

    // 덱 보기에서 젬을 끼울 수 있는 카드인가
    socketable(card) {
        return !!(card && this.gems && card.def.spell && Spell.data(card).sockets > 0);
    }

    close() {
        if (!this.mode) return;
        this.mode = null;
        CardInspector.hide(this);
        CardInspector.untrack(this);
        Modal.show(this.root, false);
    }

    setTab(id) {
        this.tab = id;
        this.selected = null;
        this.scroll.scrollTo(0);
        this.rebuild();
    }

    entries() {
        if (this.mode === "pick" || this.mode === "multi") return this.pickCards;
        const c = this.player.cards;
        if (this.mode === "owned") return [...this.ownedCards()].sort((a, b) => a.def.name.localeCompare(b.def.name, "ko"));
        const byName = (list) => [...list].sort((a, b) => a.def.name.localeCompare(b.def.name, "ko"));
        if (this.tab === "deck") return byName(c.deck);
        if (this.tab === "graveyard") return [...c.graveyard].reverse();
        return byName([...c.hand.filter((k) => k.isSkill), ...c.deck, ...c.graveyard]);
    }

    select(card) {
        this.selected = card;
        const multi = this.mode === "multi";
        for (const v of this.views) v.view.setSelected(multi ? this.picked.includes(v.card) : v.card === card);
        const hint = multi ? `카드를 눌러 고른다 (${this.range.min === this.range.max ? this.range.min : this.range.min + "~" + this.range.max}장)` : this.mode === "pick" ? "카드를 눌러 고른다" : "카드를 누르면 설명이 나온다";
        this.info.setText(card ? `${card.name} · ${CardDef.kindName(card.def)}${card.cost ? " · " + CardDef.costText(card.cost) : ""}\n${card.text(this.verbose)}` : hint);
        const v = card && this.views.find((x) => x.card === card);
        if (card) CardInspector.show(card, { verbose: this.verbose, near: v ? this.info.getComponent(RectTransform) : null, owner: this });
        else CardInspector.hide(this);
        if (multi) {
            this.pickButton.text.setText(`확정 (${this.picked.length}장)`);
            UIKit.setEnabled(this.pickButton, this.picked.length >= this.range.min && this.picked.length <= this.range.max);
        } else if (this.mode === "pick") UIKit.setEnabled(this.pickButton, !!card);
        else {
            const gem = this.socketable(card);
            this.layoutButtons(gem);
            if (gem) {
                const d = Spell.data(card);
                this.pickButton.text.setText(`젬 ${d.gems.length}/${d.sockets}`);
                UIKit.setEnabled(this.pickButton, true);
            }
        }
    }

    confirm() {
        if (this.mode === "view" && this.socketable(this.selected)) {
            const card = this.selected;
            this.close();
            this.gems.openCard(card);
            return;
        }
        if (this.mode === "multi") {
            if (this.picked.length < this.range.min) return;
            const picks = [...this.picked];
            const done = this.onDone;
            this.close();
            if (done) done(picks);
            return;
        }
        if (this.mode !== "pick" || !this.selected) return;
        const card = this.selected;
        const fn = this.onPick;
        this.close();
        if (fn) fn(card);
    }

    rebuild() {
        for (const v of this.views) v.go.destroy();
        this.views = [];
        CardInspector.untrack(this);
        for (const card of this.entries()) {
            const go = this.content.createChild("card");
            const view = go.addComponent(new CardView(card));
            this.views.push({ go, view, card });
            CardInspector.track(this, go.getComponent(RectTransform), card, this.verbose);
        }
        this.emptyText.setText(this.views.length ? "" : "카드가 없다");
        if (this.mode === "view") {
            const c = this.player.cards;
            const counts = { deck: c.deck.length, graveyard: c.graveyard.length, all: c.hand.filter((k) => k.isSkill).length + c.deck.length + c.graveyard.length };
            for (const [id, label] of DeckViewer.TABS) {
                const b = this.tabButtons[id];
                b.text.setText(`${label} ${counts[id]}`);
                b.rect.color = id === this.tab ? UIKit.COLORS.buttonOn : UIKit.COLORS.buttonOff;
            }
        }
        this.select(null);
        this._width = null;
    }

    update() {
        if (!this.mode) return;
        if (Input.getButtonDown("cancel")) return this.close();
        const width = Math.round(this.list.rect.width / this.list.uiRoot.scale);
        if (width === this._width || width <= 0) return;
        this._width = width;
        const w = DeckViewer.CARD_W;
        const gap = 8;
        const cols = Math.max(2, Math.floor((width - gap) / (w + gap)));
        const left = Math.floor((width - (cols * w + (cols - 1) * gap)) / 2);
        let h = 0;
        this.views.forEach((v, i) => {
            h = v.view.layout(w);
            CardView.place(v.go, left + (i % cols) * (w + gap), gap + Math.floor(i / cols) * (h + gap), w, h);
        });
        this.scroll.contentHeight = this.views.length ? gap + Math.ceil(this.views.length / cols) * (h + gap) : 0;
    }
}

// 카드 고르기 창구: 카드가 쓰는 도중 "버릴 카드를 골라라" 같은 것을 DeckViewer에게 부탁한다 (main.js가 viewer를 정한다)
class CardPicker {
    static viewer = null;

    static open(title, cards, min, max, done) {
        CardPicker.viewer.pickMany(title, cards, { min, max }, done);
    }
}

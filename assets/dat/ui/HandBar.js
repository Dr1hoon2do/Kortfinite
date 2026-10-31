// 화면 아래 패. 왼쪽 탭으로 [행동 패]와 [인벤토리 패](소지품: 물약·장비·젬)를 바꿔 본다 (Tab 키). 한 줄로 펼쳐진다 (많으면 겹친다).
//   쓸 수 있는 카드를 누르면 바로 칸 지정이 된다: 안내줄에 설명과 [쓰기] [묘지로] [취소] (TileTargeting).
//     칸을 골라 쓰는 카드는 땅을 탭하면 쓰고, 칸이 필요 없는 카드는 나를 누르거나 [사용] (한 번 더 눌러도 쓴다).
//   장비·젬·지금 못 쓰는 카드는 위에 설명 칸이 뜬다 [장착]/[끼우기]/[사용] [버리기] (젬 칸이 있으면 [젬]).
//   숫자 키 1~9: 그 자리 카드를 고르기 (다시 누르면 쓰기)
// 카드 줄 위 왼쪽: [드로우 (덱 n)] [대기], 오른쪽: 덱·묘지 장수 (누르면 이번 전투의 덱 보기)
// 카드 쓰기·버리기·장착은 턴을 쓰지 않는다. 뽑기·대기만 1턴.
class HandBar extends Component {
    static HEIGHT = 196;   // 아래에서 차지하는 높이 (UI 단위). 카메라가 이만큼 피해서 방을 맞춘다
    static CARD_W = 60;
    static CARD_H = 100;
    static BUTTON = 44;
    static BUTTON_W = 72;
    static TAB_W = 46;   // 왼쪽 탭 폭

    // options: { engine, player, world, targeting, gems(GemDialog), deckView(DeckViewer) }
    constructor(options) {
        super();
        this.engine = options.engine;
        this.player = options.player;
        this.world = options.world;
        this.targeting = options.targeting;
        this.gems = options.gems ?? null;
        this.deckView = options.deckView ?? null;
        this.selected = null;
        this.mode = "action"; // 보이는 패: "action" 행동 패 / "inv" 인벤토리 패
        this.views = [];
        this._key = null;
    }

    get cards() {
        return this.player.cards;
    }

    start() {
        Input.defineButton("draw", ["Space", "KeyR"]);
        Input.defineButton("wait", ["KeyZ"]);
        Input.defineButton("interact", ["KeyE"]);
        Input.defineButton("handTab", ["Tab", "KeyI"]);
        const e = this.engine;

        // 카드 줄 바탕
        this.tray = e.createUI("handTray");
        const trt = this.tray.getComponent(RectTransform);
        trt.sortOrder = UILayer.HAND;
        trt.setAnchor(0, 1, 1, 1);
        trt.setOffsets(0, -(HandBar.CARD_H + 20), 0, 0);
        this.tray.addComponent(new UIRect({ color: "rgba(18, 13, 10, 0.78)", borderColor: "#5a4a3a", borderWidth: 1 }));
        this.tray.addComponent(new UIButton({ onTap: () => this.select(null) })); // 빈 곳을 누르면 고르기 해제
        this.trayRT = trt;
        this.cardsRoot = trt.createChild("cards").getComponent(RectTransform);
        this.cardsRoot.setAnchor(0, 0, 1, 1);
        this.cardsRoot.setOffsets(HandBar.TAB_W, 0, 0, 0);
        // 왼쪽 탭: 행동 패 / 인벤토리 패
        const tabH = (HandBar.CARD_H + 20 - 12) / 2;
        this.tabs = {};
        for (const [i, mode] of ["action", "inv"].entries()) {
            const b = UIKit.button(trt, "tab " + mode, "", () => this.setMode(mode), { fontSize: 10 });
            b.rt.setAnchor(0, 0, 0, 0);
            b.rt.setSizeAndPosition(HandBar.TAB_W - 8, tabH, 4 + (HandBar.TAB_W - 8) / 2, 4 + tabH / 2 + i * (tabH + 4));
            if (b.text.wrap !== undefined) b.text.wrap = true;
            this.tabs[mode] = b;
        }
        this.emptyText = UIKit.label(trt, "empty", "", 0, 40, null, 20, { fontSize: 11, color: UIKit.COLORS.dim, align: "center" });

        // 버튼 줄
        // [드로우] 덱에서 1장 뽑기 (1턴) · [대기] 아무것도 안 하고 1턴
        const y = -(HandBar.CARD_H + 20 + 6 + HandBar.BUTTON / 2);
        const bw = HandBar.BUTTON_W;
        this.drawButton = this.textButton("draw", "드로우", 12 + bw / 2, y, () => this.draw());
        this.waitButton = this.textButton("wait", "대기", 12 + bw / 2 + (bw + 6), y, () => this.wait());
        this.deckText = this.drawButton.sub;

        // 오른쪽: 덱·묘지 (누르면 덱 보기)
        this.pile = UIKit.button(e.createUI("pileRoot").getComponent(RectTransform), "pile", "", () => this.deckView && this.deckView.open(), { fontSize: 11 });
        const prt = this.pile.go.getComponent(RectTransform).parent;
        prt.sortOrder = UILayer.HAND;
        prt.setAnchor(1, 1, 1, 1);
        prt.setOffsets(-130, y - 16, 12, -(y + 16));
        this.pile.rt.setAnchor(0, 0, 1, 1);

        // 고른 카드 설명 칸 (버튼 줄 위)
        this.detail = e.createUI("cardDetail");
        const drt = this.detail.getComponent(RectTransform);
        drt.sortOrder = UILayer.HAND + 1;
        drt.setAnchor(0.5, 1, 0.5, 1);
        this.detail.addComponent(new UIRect({ color: "rgba(30, 24, 20, 0.95)", borderColor: UIKit.COLORS.gold, borderWidth: 1 }));
        this.detail.addComponent(new UIElement());
        this.detailTitle = UIKit.label(drt, "name", "", 10, 7, null, 16, { fontSize: 12, fontWeight: "bold" });
        this.detailText = UIKit.label(drt, "text", "", 10, 26, null, 60, { fontSize: 12, color: "#d8c8a0", wrap: true, lineHeight: 1.35, rich: true });
        this._ctx = document.createElement("canvas").getContext("2d");
        this.useButton = UIKit.button(drt, "use", "사용", () => this.useSelected());
        this.discardButton = UIKit.button(drt, "discard", "버리기", () => this.discardSelected());
        this.gemButton = UIKit.button(drt, "gems", "젬", () => this.selected && this.gems && this.gems.openCard(this.selected));
        this.detail.setActive(false);
    }

    // 글자 버튼 (위: 이름, 아래: 작은 글자)
    textButton(name, label, x, y, onTap) {
        const go = this.engine.createUI("action " + name);
        const rt = go.getComponent(RectTransform);
        rt.sortOrder = UILayer.HAND;
        rt.setAnchor(0, 1, 0, 1);
        rt.setSizeAndPosition(HandBar.BUTTON_W, HandBar.BUTTON, x, y);
        const b = UIKit.button(rt, "button", "", onTap, { fontSize: 13 });
        b.rt.setAnchor(0, 0, 1, 1);
        b.rect.borderColor = "#8a7050";
        b.text.getComponent(RectTransform).setOffsets(0, 4, 0, 16);
        b.text.setText(label);
        b.text.fontWeight = "bold";
        const sub = b.rt.createChild("sub");
        const srt = sub.getComponent(RectTransform);
        srt.setAnchor(0, 1, 1, 1);
        srt.setOffsets(2, -17, 2, 3);
        b.sub = sub.addComponent(new UIText("", { fontSize: 10, color: "#a89878" }));
        b.go = go;
        return b;
    }

    // 지금 보이는 패의 카드들 (탭에 따라 행동 카드 또는 소지품)
    get order() {
        return this.mode === "inv" ? [...this.cards.items] : [...this.cards.actions];
    }

    setMode(mode) {
        if (this.mode === mode) return;
        this.mode = mode;
        if (this.selected && !this.order.includes(this.selected)) {
            this.targeting.cancel(true);
            this.selected = null;
        }
        this._key = null;
    }

    select(card) {
        if (this.targeting.active && this.targeting.card && this.targeting.card !== card) this.targeting.cancel(true);
        this.selected = card;
        this._justSelected = true; // 이번 프레임의 탭은 바깥 탭으로 치지 않는다
        this._detailKey = null;
        this.layout();
        if (!card) return;
        // 쓸 수 있는 카드는 바로 칸 지정 (칸이 필요 없는 카드는 내 칸)
        if (this.direct(card)) this.targeting.beginCard(card);
    }

    // 고르자마자 칸 지정으로 가는 카드인가 (장비·젬은 설명 칸에서 장착·끼우기)
    direct(card) {
        const d = card.def;
        return !!(d.use && !d.slot && !d.gem && this.player.alive && this.player.canUse(card));
    }

    tapCard(card) {
        if (Modal.isOpen || !this.player.alive) return;
        if (this.selected === card) {
            if (this.targeting.active && this.targeting.request.self) this.targeting.confirm(); // 나에게 쓰는 카드는 한 번 더 누르면 쓴다
            else if (card.target) this.select(null); // 칸 카드는 다시 누르면 취소
            else this.useSelected();
            return;
        }
        this.select(card);
    }

    useSelected() {
        const card = this.selected;
        if (!card || !this.player.alive || !this.cards.hand.includes(card)) return;
        if (card.def.gem) {
            if (this.gems) this.gems.openGem(card);
            return;
        }
        if (card.def.slot) {
            if (this.cards.isEquipped(card)) this.cards.unequip(card);
            else this.cards.equip(card);
            return;
        }
        if (!card.def.use) {
            MessageLog.add(`${josa(card.def.name, "은는")} 쓸 수 없다`, "#c8b890");
            return;
        }
        if (card.target) this.targeting.beginCard(card);
        else {
            this.player.requestCard(card);
            this.selected = null;
        }
    }

    discardSelected() {
        const card = this.selected;
        if (!card || !this.player.alive) return;
        if (!this.cards.discard(card)) return;
        if (!card.isSkill) MessageLog.add(`${josa(card.name, "을를")} 버렸다`, "#e8c860");
        this.targeting.cancel(true);
        this.selected = null;
    }

    update() {
        const p = this.player;
        const c = this.cards;
        const lock = p.drawLock > 0;
        this.deckText.setText(lock ? `쉼 ${p.drawLock}턴` : c.deck.length ? `1장 · 1턴` : c.graveyard.length ? "묘지 섞기" : "덱 없음");
        this.deckText.color = lock ? "#f0a070" : c.deck.length ? "#a8b8d0" : c.graveyard.length ? "#a0b8e8" : "#8a7a6a";
        this.waitButton.sub.setText("1턴 쉬기");
        this.pile.text.setText(`덱 ${c.deck.length} · 묘지 ${c.graveyard.length}`);

        if (this.selected && !c.hand.includes(this.selected)) this.selected = null;
        // 칸 지정을 [취소]하면 카드 고르기도 풀린다
        const tc = this.targeting.active ? this.targeting.card : null;
        if (this._tcard && !tc && this.selected === this._tcard) this.selected = null;
        this._tcard = tc;
        this.refreshTabs();
        if (this.targeting.active && this.targeting.card && this.targeting.card !== this.selected) this.selected = this.targeting.card;

        const width = Math.round(this.engine.width / this.engine.uiRoot.scale);
        const key = c.version + ":" + width + ":" + this.mode;
        if (key !== this._key) {
            this._key = key;
            this.rebuild();
        }
        this.refreshViews();
        this.refreshDetail(width);
        this.dismissDetail();

        if (!p.alive || Modal.isOpen) return;
        if (Input.getButtonDown("draw")) {
            if (this.targeting.active) this.targeting.confirm();
            else this.draw();
        }
        if (Input.getButtonDown("wait")) this.wait();
        if (Input.getButtonDown("interact")) this.interact(); // E 키 (버튼은 없앴다. 탭으로 말 걸기·열기가 된다)
        if (Input.getButtonDown("handTab")) this.setMode(this.mode === "inv" ? "action" : "inv");
        for (let i = 1; i <= 9; i++) {
            if (Input.getKeyDown("Digit" + i)) {
                const card = this.order[i - 1];
                if (card) this.tapCard(card);
            }
        }
    }

    draw() {
        this.targeting.cancel(true);
        this.selected = null;
        this.player.wantsDraw = true;
    }

    wait() {
        this.targeting.cancel(true);
        this.selected = null;
        this.player.wantsWait = true;
    }

    // 상호작용: 바로 옆에 하나뿐이면 바로, 아니면 칸 고르기
    interact() {
        if (this.targeting.active && this.targeting.request.kind === "interact") return this.targeting.cancel();
        const p = this.player;
        const near = [];
        for (const [dx, dy] of Entity.DIRS) {
            const e = this.world.entityAt(p.x + dx, p.y + dy);
            if (e && e.interactable) near.push(e);
        }
        if (near.length === 1) {
            p.wantsInteract = { x: near[0].x, y: near[0].y };
            return;
        }
        this.targeting.begin({
            kind: "interact", name: "상호작용", range: 1, includeSelf: false, taps: 1, color: "#7cc4e8", verb: "확인",
            onConfirm: (t) => { p.wantsInteract = t; }
        });
    }

    // 카드 UI를 새로 만든다 (패가 바뀌거나 화면 폭이 바뀌면)
    rebuild() {
        for (const v of this.views) v.go.destroy();
        this.views = [];
        CardInspector.untrack(this);
        const list = this.order;
        for (const card of list) {
            const go = this.cardsRoot.createChild("card");
            const view = go.addComponent(new CardView(card, this.cards.isEquipped(card)));
            view.layout(HandBar.CARD_W);
            go.addComponent(new UIButton({ onTap: () => this.tapCard(card) }));
            this.views.push({ go, view, card });
            CardInspector.track(this, go.getComponent(RectTransform), card, false); // 마우스를 올리면 크게 (전투 중이라 수치만)
        }
        this.emptyText.setText(list.length ? "" : this.mode === "inv" ? "소지품 패가 비었다 · 물약·장비·젬이 여기 들어온다" : "행동 패가 비었다 · [드로우](Space)로 덱에서 카드를 뽑는다 (1턴)");
        this.layout();
    }

    // 탭 글자: 장수 / 한도. 보고 있는 탭은 밝게
    refreshTabs() {
        const c = this.cards;
        const n = c.counts();
        const over = c.overflow; // 소지품이 넘쳐서 행동 패 자리를 차지한 장수
        const key = `${this.mode}:${n.a}/${c.actionLimit}:${n.i}/${c.invLimit}:${over}`;
        if (key === this._tabKey) return;
        this._tabKey = key;
        // 넘치면: 행동 탭 "3/4 (-1칸)" 빨갛게, 소지품 탭 "5/4" 주황
        const label = {
            action: over ? `행동\n${n.a}/${c.actionLimit}\n(-${over}칸)` : `행동\n${n.a}/${c.actionLimit}`,
            inv: `소지품\n${n.i}/${c.invLimit}`
        };
        for (const [mode, b] of Object.entries(this.tabs)) {
            const warn = over > 0;
            b.text.setText(label[mode]);
            b.text.fontSize = mode === "action" && over ? 9 : 10;
            const on = mode === this.mode;
            b.rect.color = warn && mode === "action" ? (on ? "#7a3428" : "#4a2420") : on ? "#6a5238" : "rgba(42, 35, 30, 0.95)";
            b.rect.borderColor = warn ? "#e07050" : UIKit.COLORS.border;
            b.text.color = warn ? (mode === "action" ? "#ffb0a0" : "#f0b070") : on ? UIKit.COLORS.gold : UIKit.COLORS.dim;
        }
    }

    // 카드 자리: 가운데 정렬, 폭이 모자라면 겹친다
    layout() {
        const width = this.engine.width / this.engine.uiRoot.scale - HandBar.TAB_W;
        const n = this.views.length;
        if (!n) return;
        const w = HandBar.CARD_W;
        const gap = 6;
        const split = n;
        const extra = 0;
        const avail = width - 16;
        let step = w + gap;
        if (n > 1 && n * w + (n - 1) * gap + extra > avail) step = Math.max(14, (avail - w - extra) / (n - 1));
        const total = w + step * (n - 1) + extra;
        let x = (width - total) / 2;
        this.views.forEach((v, i) => {
            if (i === split && i > 0) x += extra;
            const lift = v.card === this.selected ? 12 : 0;
            CardView.place(v.go, x, 10 - lift, w, HandBar.CARD_H);
            x += step;
        });
        // 고른 카드가 옆 카드에 가리지 않게 맨 위로 (그리는 순서 = 자식 순서)
        const kids = this.cardsRoot.children;
        const sel = this.views.find((v) => v.card === this.selected);
        const order = this.views.map((v) => v.go.getComponent(RectTransform)).filter((rt) => !sel || rt !== sel.go.getComponent(RectTransform));
        if (sel) order.push(sel.go.getComponent(RectTransform));
        kids.length = 0;
        kids.push(...order);
    }

    refreshViews() {
        for (const v of this.views) {
            const card = v.card;
            const usable = this.player.canUse(card);
            const rt = v.go.getComponent(RectTransform);
            rt.alpha = usable || card === this.selected ? 1 : 0.55;
            v.view.setSelected(card === this.selected);
        }
        if (this._layoutSel !== this.selected) {
            this._layoutSel = this.selected;
            this.layout();
        }
    }

    // 고른 카드 설명 칸
    // 설명 창이 떠 있을 때 창 바깥을 탭(끌지 않고 뗌)하면 고르기를 푼다. 칸을 고르는 중(대상 지정)에는 땅 탭이 대상 고르기라 건드리지 않는다
    dismissDetail() {
        const fresh = this._justSelected;
        this._justSelected = false;
        if (!this.selected || fresh || this.targeting.active || Modal.isOpen || !this.detail.isActive) return;
        const rt = this.detail.getComponent(RectTransform);
        for (const p of Input.pointers) {
            if (p.released && p.dragDistance <= Input.dragThreshold && !rt.containsPoint(p.position.x, p.position.y)) {
                this.selected = null;
                this._detailKey = null;
                this.layout();
                return;
            }
        }
    }

    refreshDetail(width) {
        const card = this.selected;
        const show = !!card && !this.targeting.active && !Modal.isOpen;
        this.detail.setActive(show);
        if (!show) return;
        const key = card.id + ":" + this.cards.version + ":" + width + ":" + this.player.energy + ":" + this.player.mana;
        if (key === this._detailKey) return;
        this._detailKey = key;
        const w = Math.min(340, width - 24);
        const body = card.text(false);
        const terms = CardInspector.enabled() ? CardText.glossary(body) : "";
        const text = terms ? `${body}\n\n${terms}` : body;
        this.detailText.setText(text);
        const lines = this.detailText.measureLines(this._ctx, w - 20);
        const th = Math.ceil(lines * 12 * 1.35);
        const h = 26 + th + 8 + 34;
        const bottom = HandBar.CARD_H + 20 + 6 + HandBar.BUTTON + 8;
        this.detail.getComponent(RectTransform).setOffsets(-w / 2, -(bottom + h), -w / 2, bottom);
        const cost = CardDef.costText(card.cost);
        const worn = this.cards.isEquipped(card) ? " · 착용 중" : "";
        this.detailTitle.setText(`${card.name} · ${CardDef.kindName(card.def)}${cost ? " · " + cost : ""}${worn}`);
        this.detailText.getComponent(RectTransform).setOffsets(10, 26, 10, -(26 + th + 4));

        const def = card.def;
        const socketed = def.spell && Spell.data(card).sockets > 0;
        const buttons = [this.useButton, ...(socketed ? [this.gemButton] : []), this.discardButton];
        this.gemButton.go.setActive(!!socketed);
        buttons.forEach((b, i) => {
            b.rt.setAnchor(i / buttons.length, 1, (i + 1) / buttons.length, 1);
            b.rt.setOffsets(i === 0 ? 8 : 3, -38, i === buttons.length - 1 ? 8 : 3, 8);
        });
        const payable = this.player.canUse(card);
        this.useButton.text.setText(def.slot ? (this.cards.isEquipped(card) ? "해제" : "장착") : def.gem ? "끼우기" : card.target ? "칸 고르기" : "사용");
        UIKit.setEnabled(this.useButton, !!(def.slot || def.gem || (def.use && payable)));
        if (socketed) this.gemButton.text.setText(`젬 ${Spell.data(card).gems.length}/${Spell.data(card).sockets}`);
        this.discardButton.text.setText(card.isSkill ? "묘지로" : "버리기");
    }
}

// 카드 크게 보기: 카드 이름·비용·설명 전체와 설명에 나온 용어 풀이를 큰 글자로 띄운다.
//   상점·보상·덱 보기에서 카드를 고르면 뜨고, 마우스를 카드 위에 올려도 뜬다 (손을 떼거나 닫으면 사라진다).
//   설정 "카드 정보 창"을 끄면 뜨지 않는다.
//   창은 누르기를 막지 않는다 (아래 버튼이 그대로 눌린다).
//   고정된 창(탭해서 연 것)은 창 바깥을 탭하면 닫힌다 (끌어서 스크롤하는 건 닫지 않는다). 다른 카드를 탭하면 그 카드로 바뀐다.
// 쓰기: CardInspector.show(card, { verbose, near: RectTransform, onHide }) / CardInspector.hide(owner)
//       onHide: 창이 닫힐 때(바깥 탭 포함) 부르는 함수 — 부르는 쪽이 "고른 카드" 표시를 지울 때 쓴다
//       CardInspector.track(owner, rt, card, verbose) — 마우스를 올리면 뜨는 카드 (owner가 바뀌면 untrack(owner))
class CardInspector extends Component {
    static current = null;
    static W = 320;

    constructor(options) {
        super();
        this.engine = options.engine;
        this.card = null;
        this.owner = null;
        this.tracked = new Map(); // owner → [{ rt, card, verbose }]
        CardInspector.current = this;
    }

    static enabled() {
        return Settings.get("cardInfo") !== false;
    }

    static show(card, opts = {}) {
        const I = CardInspector.current;
        if (!I) return;
        if (!card || !CardInspector.enabled()) return I._hide();
        I._unpin(); // 바뀌기 전 것의 onHide (다른 카드를 탭하면 앞 카드의 고른 표시가 풀린다)
        I.pinned = { card, verbose: opts.verbose ?? true, near: opts.near ?? null, owner: opts.owner ?? null, onHide: opts.onHide ?? null };
        I._justPinned = true; // 이번 프레임의 탭은 바깥 탭으로 치지 않는다
    }

    static hide(owner = null) {
        const I = CardInspector.current;
        if (!I || !I.pinned) return;
        if (owner && I.pinned.owner !== owner) return;
        I._unpin();
    }

    _unpin() {
        const p = this.pinned;
        this.pinned = null;
        if (p && p.onHide) p.onHide();
    }

    static track(owner, rt, card, verbose = true) {
        const I = CardInspector.current;
        if (!I) return;
        if (!I.tracked.has(owner)) I.tracked.set(owner, []);
        I.tracked.get(owner).push({ rt, card, verbose });
    }

    static untrack(owner) {
        const I = CardInspector.current;
        if (I) I.tracked.delete(owner);
    }

    start() {
        this.root = this.engine.createUI("cardInspector");
        const rt = this.root.getComponent(RectTransform);
        rt.sortOrder = 900;
        rt.setAnchor(0.5, 0, 0.5, 0);
        this.root.addComponent(new UIRect({ color: "rgba(24, 18, 14, 0.97)", borderColor: UIKit.COLORS.gold, borderWidth: 2 }));
        this.rt = rt;
        this.iconGo = rt.createChild("icon");
        this.iconGo.addComponent(new UIRect({ color: "#3a332d", borderColor: "#1e1610", borderWidth: 1 }));
        this.icon = this.iconGo.addComponent(new UIImage(Resource.image("cards"), { region: { x: 0, y: 0, width: 16, height: 16 } }));
        this.nameText = UIKit.label(rt, "name", "", 0, 0, 10, 18, { fontSize: 15, fontWeight: "bold", color: UIKit.COLORS.gold });
        this.kind = UIKit.label(rt, "kind", "", 0, 0, 10, 15, { fontSize: 12, color: "#c8b890", rich: true });
        this.desc = UIKit.label(rt, "desc", "", 0, 0, 10, 10, { fontSize: 13, color: "#efe2c4", wrap: true, lineHeight: 1.4, rich: true });
        this.line = rt.createChild("line");
        this.line.addComponent(new UIRect({ color: "rgba(232, 184, 64, 0.35)" }));
        this.terms = UIKit.label(rt, "terms", "", 0, 0, 10, 10, { fontSize: 11, color: "#bfb090", wrap: true, lineHeight: 1.4, rich: true });
        this.root.setActive(false);
        this._ctx = document.createElement("canvas").getContext("2d");
    }

    _hide() {
        this.card = null;
        this.root.setActive(false);
    }

    // 마우스가 올라간 추적 카드 (마지막에 등록된 것 = 위에 그려진 것 우선)
    hovered() {
        const p = Input.pointer;
        if (!p || p.type !== "mouse") return null;
        let hit = null;
        for (const list of this.tracked.values()) {
            for (const t of list) {
                if (!t.rt.gameObject || !t.rt.gameObject.activeInHierarchy) continue;
                if (t.rt.containsPoint(p.position.x, p.position.y)) hit = t;
            }
        }
        return hit;
    }

    update() {
        if (!CardInspector.enabled()) return this.card && this._hide();
        // 추적 목록에서 사라진(파괴된) 카드 정리
        for (const [owner, list] of this.tracked) {
            const alive = list.filter((t) => t.rt.gameObject && !t.rt.gameObject.isDestroyed);
            if (alive.length !== list.length) this.tracked.set(owner, alive);
        }
        // 고정된 창: 창 바깥을 탭(끌지 않고 뗌)하면 닫는다
        if (this.pinned && !this._justPinned) {
            for (const p of Input.pointers) {
                if (p.released && p.dragDistance <= Input.dragThreshold && !this.rt.containsPoint(p.position.x, p.position.y)) {
                    this._unpin();
                    break;
                }
            }
        }
        this._justPinned = false;
        const h = this.hovered();
        const want = h ? { card: h.card, verbose: h.verbose, near: h.rt } : this.pinned;
        if (!want) return this.card && this._hide();
        const key = `${want.card.id}:${want.verbose}:${want.card.description}:${Math.round(this.engine.width)}x${Math.round(this.engine.height)}:${want.near ? Math.round(want.near.rect.y) : ""}`;
        this.root.setActive(true);
        if (key === this._key && this.card === want.card) return;
        this._key = key;
        this.card = want.card;
        this.layout(want);
    }

    layout(want) {
        const card = want.card;
        const def = card.def;
        const scale = this.engine.uiRoot.scale;
        const screenW = this.engine.width / scale;
        const screenH = this.engine.height / scale;
        const W = Math.min(CardInspector.W, screenW - 16);
        const pad = 12;
        const text = card.text(want.verbose);
        const terms = CardInspector.enabled() ? CardText.glossary(text) : "";

        this.icon.setSprite(Resource.image(def.sprite), { x: def.frame * 16, y: 0, width: 16, height: 16 });
        UIKit.place(this.iconGo, pad, pad, 40, 40);
        const cost = CardDef.costText(card.cost);
        const rarity = def.rarity ? ` · ${ShopDialog.RARITY[def.rarity]}` : "";
        this.nameText.setText(card.name);
        this.kind.setText(`${CardDef.kindName(def)}${rarity}${cost ? " · " + cost : ""}`);
        UIKit.place(this.nameText.gameObject, pad + 48, pad + 2, W - pad * 2 - 48, 18);
        UIKit.place(this.kind.gameObject, pad + 48, pad + 23, W - pad * 2 - 48, 15);

        let y = pad + 48;
        const tw = W - pad * 2;
        this.desc.setText(text);
        const dl = this.desc.measureLines(this._ctx, tw);
        const dh = Math.ceil(dl * 13 * 1.4);
        UIKit.place(this.desc.gameObject, pad, y, tw, dh);
        y += dh + 6;
        this.line.setActive(!!terms);
        this.terms.gameObject.setActive(!!terms);
        if (terms) {
            UIKit.place(this.line, pad, y, tw, 1);
            y += 7;
            this.terms.setText(terms);
            const tl = this.terms.measureLines(this._ctx, tw);
            const th = Math.ceil(tl * 11 * 1.4);
            UIKit.place(this.terms.gameObject, pad, y, tw, th);
            y += th + 4;
        }
        const H = Math.min(y + pad - 4, screenH - 16);
        // 자리: 기준 카드가 화면 아래쪽이면 그 위에, 위쪽이면 그 아래에. 없으면 화면 위쪽
        let top = 56;
        if (want.near && want.near.rect) {
            const r = want.near.rect;
            const cy = (r.y + r.height / 2) / scale;
            const above = r.y / scale - H - 8;
            const below = (r.y + r.height) / scale + 8;
            top = cy > screenH / 2 ? above : below;
            if (top < 8) top = 8;
            if (top + H > screenH - 8) top = Math.max(8, screenH - 8 - H);
        }
        this.rt.setAnchor(0.5, 0, 0.5, 0);
        this.rt.setPivot(0.5, 0);
        this.rt.setSizeAndPosition(W, H, 0, top);
    }
}

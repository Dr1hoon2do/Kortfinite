// 도감: 시작 화면에서 여는 카드·몬스터 목록. 런 밖이라 수치는 기본 능력치(공격력 5 등) 기준으로 자세히 보인다.
//   탭: [카드] [강화] [몬스터]  (내용은 카드 공방에서 내보낸 데이터)
//   카드를 누르면(마우스를 올려도) 카드 정보 창이 크게 뜬다. 주문·젬은 카드마다 비용·품질이 달라서 대표 한 장을 보여 준다.
class Codex extends Component {
    static TABS = [["skill", "카드"], ["upgrade", "강화"], ["monster", "몬스터"]];
    static CARD_W = 80;

    // 적 설명: 공방의 행동 글 + 나오는 층 + 떨어뜨리는 재료
    static patternText(k) {
        const drops = (k.drops ?? []).map((d) => `${GameContent.materials.get(d.id)?.name ?? d.id} ${d.chance}%`).join(", ");
        return [k.note, k.pattern, drops ? `재료: ${drops}` : ""].filter(Boolean).join("\n");
    }

    // 비용 경우가 여럿인 카드는 경우마다 따로 한 장씩 (나올 때 그중 하나가 정해지니까)
    static variants(def) {
        const n = Card.costOptions(def).length;
        if (n < 2) return [new Card(def.id)];
        return Array.from({ length: n }, (_, i) => { const c = new Card(def.id); c.ensureData().pay = i; return c; });
    }

    constructor(options) {
        super();
        this.engine = options.engine;
        this.tab = "skill";
        this.views = [];
        this.rows = [];
        this.open_ = false;
        this._ctx = document.createElement("canvas").getContext("2d");
    }

    get isOpen() {
        return this.open_;
    }

    start() {
        const { root, box } = Modal.create(this.engine, "codex", 460, 600, () => this.close());
        this.root = root;
        this.box = box;
        UIKit.label(box, "title", "도감", 14, 10, null, 18, { fontSize: 14, fontWeight: "bold", color: UIKit.COLORS.gold });
        this.note = UIKit.label(box, "note", "", 70, 12, null, 16, { fontSize: 10, color: UIKit.COLORS.dim });
        const tabs = box.createChild("tabs");
        this.tabsRT = tabs.getComponent(RectTransform);
        this.tabsRT.setAnchor(0, 0, 1, 0);
        this.tabsRT.setOffsets(12, 34, 12, -62);
        this.tabButtons = {};
        Codex.TABS.forEach(([id, label], i) => {
            const n = Codex.TABS.length;
            const b = UIKit.button(this.tabsRT, id, label, () => this.setTab(id), { fontSize: 12 });
            b.rt.setAnchor(i / n, 0, (i + 1) / n, 1);
            b.rt.setOffsets(i === 0 ? 0 : 2, 0, i === n - 1 ? 0 : 2, 0);
            this.tabButtons[id] = b;
        });
        const list = box.createChild("list");
        this.list = list.getComponent(RectTransform);
        this.list.setAnchor(0, 0, 1, 1);
        this.list.setOffsets(12, 68, 12, 56);
        list.addComponent(new UIRect({ color: "rgba(0, 0, 0, 0.25)" }));
        list.addComponent(new UIMask());
        this.content = this.list.createChild("content").getComponent(RectTransform);
        const bar = this.list.createChild("scrollbar");
        bar.addComponent(new UIRect({ color: "rgba(232, 217, 184, 0.45)" }));
        this.scroll = list.addComponent(new UIScrollView({
            content: this.content, bar: bar.getComponent(RectTransform),
            onTap: (pointer) => {
                const v = this.views.find((v) => UIKit.contains(v.go.getComponent(RectTransform), pointer.position));
                if (v) this.select(v.card === this.selected ? null : v);
            }
        }));
        const close = UIKit.button(box, "close", "닫기", () => this.close(), { fontSize: 13 });
        close.rt.setAnchor(0, 1, 1, 1);
        close.rt.setOffsets(12, -46, 12, 10);
    }

    open() {
        this.open_ = true;
        Modal.fit(this.engine, this.box, 460, 600);
        Modal.show(this.root, true);
        this.setTab(this.tab);
    }

    close() {
        if (!this.open_) return;
        this.open_ = false;
        CardInspector.hide(this);
        CardInspector.untrack(this);
        Modal.show(this.root, false);
    }

    setTab(id) {
        this.tab = id;
        this.selected = null;
        CardInspector.hide(this);
        this.scroll.scrollTo(0);
        for (const [tid, b] of Object.entries(this.tabButtons)) b.rect.color = tid === id ? UIKit.COLORS.buttonOn : UIKit.COLORS.buttonOff;
        this.rebuild();
    }

    select(v) {
        this.selected = v ? v.card : null;
        for (const x of this.views) x.view.setSelected(x.card === this.selected);
        if (v) CardInspector.show(v.card, { verbose: true, owner: this, near: v.go.getComponent(RectTransform) });
        else CardInspector.hide(this);
    }

    // 탭별 카드 (이름순, 희귀도순)
    cards(tab) {
        const order = { undefined: 0, common: 1, uncommon: 2, rare: 3 };
        const defs = [...CardDef.defs.values()];
        const byRarity = (a, b) => (order[a.def.rarity] ?? 0) - (order[b.def.rarity] ?? 0) || a.def.name.localeCompare(b.def.name, "ko");
        const rng = Rng.make(20240607);
        if (tab === "skill") return defs.filter((d) => d.type === "skill" && !d.upgradeKey && d.base).flatMap((d) => Codex.variants(d)).sort((a, b) => (a.def.kind === "basic" ? 0 : 1) - (b.def.kind === "basic" ? 0 : 1) || a.def.name.localeCompare(b.def.name, "ko"));
        return defs.filter((d) => d.type === "skill" && d.upgradeKey).flatMap((d) => Codex.variants(d)).sort((a, b) => a.def.base.localeCompare(b.def.base) || a.def.name.localeCompare(b.def.name, "ko"));
    }

    rebuild() {
        for (const v of this.views) v.go.destroy();
        for (const r of this.rows) r.destroy();
        this.views = [];
        this.rows = [];
        CardInspector.untrack(this);
        this._width = null;
        if (this.tab === "monster") {
            this.note.setText("1층 기준 · 정예·우두머리는 더 세다");
            return;
        }
        this.note.setText(this.tab === "upgrade" ? "캠프에서 재료를 내고 강화 · 공격력 5 기준" : "누르면 크게 · 공격력 5 기준");
        for (const card of this.cards(this.tab)) {
            const go = this.content.createChild("card");
            const view = go.addComponent(new CardView(card));
            this.views.push({ go, view, card });
            CardInspector.track(this, go.getComponent(RectTransform), card, true);
        }
    }

    // 몬스터 한 줄: 그림, 이름, 능력치, 패턴 설명
    buildMonsters(width) {
        for (const r of this.rows) r.destroy();
        this.rows = [];
        let y = 6;
        const textW = width - 12 - 56 - 8;
        // 맨 위: 강해지는 규칙
        const head = this.content.createChild("rules");
        const rule = UIKit.label(this.content, "rulesText", "층 Lv마다 [[hp:체력 +30%]] · [[atk:공격력 +1]]. 정예: [[hp:체력 ×1.8]] · [[atk:공격력 +2]]. 우두머리: [[hp:체력 ×3.5]] · [[atk:공격력 +3]].", 10, y, width - 20, 10, { fontSize: 11, color: "#c8b890", wrap: true, lineHeight: 1.4, rich: true });
        const rl = rule.measureLines(this._ctx, width - 20);
        UIKit.place(rule.gameObject, 10, y, width - 20, Math.ceil(rl * 11 * 1.4));
        this.rows.push(head, rule.gameObject);
        y += Math.ceil(rl * 11 * 1.4) + 8;
        for (const [kind, k] of Object.entries(Monster.KINDS)) {
            const go = this.content.createChild("monster");
            const rt = UIKit.place(go, 6, y, width - 12, 10);
            go.addComponent(new UIRect({ color: "rgba(42, 35, 30, 0.95)", borderColor: UIKit.COLORS.border, borderWidth: 1 }));
            const icon = rt.createChild("icon");
            UIKit.place(icon, 6, 6, 44, 44);
            icon.addComponent(new UIRect({ color: "#2a2520", borderColor: "#1e1610", borderWidth: 1 }));
            icon.addComponent(new UIImage(Resource.image(k.sprite ?? kind), { region: { x: 0, y: 0, width: 16, height: 16 } }));
            UIKit.label(rt, "name", k.name, 58, 6, textW, 16, { fontSize: 13, fontWeight: "bold", color: UIKit.COLORS.text });
            const stats = `[[hp:체력 ${k.hp}]] · [[atk:공격력 ${k.attack}]] · [[def:방어력 ${k.defense}]]${k.moves > 1 ? ` · [[spd:이동 ${k.moves}칸]]` : ""}`;
            UIKit.label(rt, "stats", stats, 58, 24, textW, 14, { fontSize: 11, color: "#c8b890", rich: true });
            const pat = UIKit.label(rt, "pattern", Codex.patternText(k), 58, 42, textW, 10, { fontSize: 11, color: "#d8c8a0", wrap: true, lineHeight: 1.4, rich: true });
            const lines = pat.measureLines(this._ctx, textW);
            const ph = Math.ceil(lines * 11 * 1.4);
            UIKit.place(pat.gameObject, 58, 42, textW, ph);
            const h = Math.max(56, 42 + ph + 8);
            UIKit.place(go, 6, y, width - 12, h);
            this.rows.push(go);
            y += h + 6;
        }
        this.scroll.contentHeight = y;
    }

    update() {
        if (!this.open_) return;
        if (Input.getButtonDown("cancel")) return this.close();
        const width = Math.round(this.list.rect.width / this.list.uiRoot.scale);
        if (width === this._width || width <= 0) return;
        this._width = width;
        if (this.tab === "monster") return this.buildMonsters(width);
        const w = Codex.CARD_W;
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

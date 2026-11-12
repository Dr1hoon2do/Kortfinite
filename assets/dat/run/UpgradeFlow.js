// 카드 강화 흐름 (모닥불·상인이 같이 쓴다). 담당: UpgradeFlow 에이전트가 채운다.
// 강화 색: red 붉은 · blue 푸른 · yellow 노란 (쉬움), green 초록 · purple 보라 (어려움).
// 계약 (다른 코드가 이 모양으로 부른다):
//   UpgradeFlow.COLORS[key] = { name: "붉은", css: "#e8584a", hard: false }
//   UpgradeFlow.EASY = ["red","blue","yellow"], UpgradeFlow.HARD = ["green","purple"]
//   UpgradeFlow.candidates(player, colors = null) → 그 색(null이면 아무 색) 강화를 지금 받을 수 있는 행동 카드들 (Card[])
//   UpgradeFlow.open({ colors = null, title = "강화", onDone = null })
//       ① Game.deckView로 카드를 먼저 고른다(colors가 있으면 그 색 강화를 받을 카드만)
//       ② 강화 선택 창(UpgradeOptionDialog): 지금 카드 + 그 카드가 받을 수 있는 강화들(colors가 있으면 그 색만)을 현재→강화 후로 비교해 보이고, 하나 골라 [강화한다]. 하나뿐이어도 확인을 거친다.
//       상점용: shop = { prices: { 색: 값 }, sold: { 색: true }, money: 숫자 또는 () => 숫자, note }. prices에 있는 색(품절 아님)만 고를 수 있고 값이 보인다.
//       그 밖의 색은 흐리게 "이 상점에서는 팔지 않는다"/"품절"로 보이기만 한다. 카드 후보도 파는 색을 받을 수 있는 것만. 확정 버튼은 값을 보이고 돈이 모자라면 꺼진다.
//       바꿨으면 onDone(바뀐 Card, 고른 색 키), 취소하거나 후보가 없으면 onDone(null). 부르는 쪽은 onDone(card)일 때만 값·기회를 쓴다.
class UpgradeFlow {
    static COLORS = {
        red: { name: "붉은", css: "#e8584a", hard: false },
        blue: { name: "푸른", css: "#58a0f0", hard: false },
        yellow: { name: "노란", css: "#f0d040", hard: false },
        green: { name: "초록", css: "#5cc86c", hard: true },
        purple: { name: "보라", css: "#b078e0", hard: true }
    };
    static EASY = ["red", "blue", "yellow"];
    static HARD = ["green", "purple"];

    // 그 카드가 지금 받을 수 있는 강화들 (변형 키가 colors 안인 것. null이면 전부)
    static optionsOf(card, colors = null) {
        return GameContent.upgradesOf(card.defId).filter((d) => !colors || colors.includes(d.upgradeKey));
    }

    static candidates(player, colors = null) {
        return player.cards.allActions.filter((c) => UpgradeFlow.optionsOf(c, colors).length > 0);
    }

    // 제목: 색이 하나면 그 색 이름을 앞에 붙인다 ("붉은 강화")
    static headline(title, colors) {
        const base = title.split(" · ")[0];
        const c = colors && colors.length === 1 ? UpgradeFlow.COLORS[colors[0]] : null;
        return c ? `${c.name} ${base}` : base;
    }

    // deckView.pick에 "취소" 알림을 덧붙인다 (그만두기·닫기·Esc로 닫히면 onCancel)
    static pick(deckView, title, cards, onPick, onCancel) {
        let picked = false;
        const release = () => delete deckView.close;
        const orig = deckView.close.bind(deckView);
        deckView.close = () => {
            release();
            orig();
            Promise.resolve().then(() => { if (!picked) onCancel(); });
        };
        deckView.pick(title, cards, (card) => {
            picked = true;
            onPick(card);
        });
    }

    // 카드 먼저 → 그 카드의 강화 전부와 바뀌는 효과 보기 → 하나 고르기 → [강화한다].
    // 강화 선택 창에서 [뒤로]는 카드 고르기로, 닫기·배경·Esc는 취소(onDone(null)).
    static open({ colors = null, title = "강화", onDone = null, shop = null } = {}) {
        const done = (card, color = null) => { if (onDone) onDone(card, color); };
        if (shop) colors = UpgradeFlow.shopColors(shop);
        const cards = UpgradeFlow.candidates(Game.player, colors);
        if (cards.length === 0) {
            MessageLog.add("강화할 수 있는 카드가 없다", "#c8b890");
            return done(null);
        }
        const head = UpgradeFlow.headline(title, colors);
        const first = title.includes("카드를 고른다") ? (colors && colors.length === 1 ? `${UpgradeFlow.COLORS[colors[0]].name} ${title}` : title) : `${head} · 카드를 고른다`;
        const choose = () => {
            UpgradeFlow.pick(Game.deckView, first, cards, (card) => {
                const opts = UpgradeFlow.optionsOf(card, shop ? null : colors);
                if (opts.length === 0 || (shop && UpgradeFlow.optionsOf(card, colors).length === 0)) return done(null);
                UpgradeFlow.optionDialog().open(card, opts, {
                    title: `${head} · 무엇이 바뀌나`,
                    shop,
                    onApply: (def) => UpgradeFlow.apply(card, def, (c) => done(c, def.upgradeKey)),
                    onBack: choose,
                    onCancel: () => done(null)
                });
            }, () => done(null));
        };
        choose();
    }

    // 상점이 지금 파는 색들 (값이 있고 품절 아닌 것)
    static shopColors(shop) {
        return Object.keys(shop.prices).filter((k) => !(shop.sold && shop.sold[k]));
    }

    // 강화 적용: 정의를 바꾸고 비용 경우를 다시 정한다
    static apply(card, def, done) {
        const before = card.name;
        card.defId = def.id;
        card.rollCost();
        Game.player.cards._changed();
        MessageLog.add(`${before} → ${card.name} 강화했다`, "#f0c080");
        done(card);
    }

    // 강화 선택 창 (처음 필요할 때 만든다)
    static optionDialog() {
        const deckView = Game.deckView;
        if (!UpgradeFlow._dialog || UpgradeFlow._dialog.engine !== deckView.engine) {
            UpgradeFlow._dialog = deckView.gameObject.addComponent(new UpgradeOptionDialog({ engine: deckView.engine }));
        }
        return UpgradeFlow._dialog;
    }

    // ---------- 바뀌는 효과 비교 ----------
    // 강조 글자색 키 (CardText.STATS에 올려 [[upnew:글]]로 칠한다)
    static ensureKeys() {
        if (!CardText.STATS.upnew) CardText.STATS.upnew = { name: "강화", light: "#ffdc50", dark: "#a06000" };
    }

    // 설명글을 낱말로: [{ w, key, sp }] (sp: 앞에 공백이 있었나). [[키:글]] 안의 글도 낱말로 나누고 키를 달고 간다
    static tokens(line) {
        const out = [];
        const re = /\[\[(\w+):([^\]]*)\]\]/g;
        let sp = false;
        const add = (text, key) => {
            for (const part of text.split(/(\s+)/)) {
                if (part === "") continue;
                if (/^\s+$/.test(part)) sp = true;
                else {
                    out.push({ w: part, key, sp });
                    sp = false;
                }
            }
        };
        let last = 0;
        let m;
        while ((m = re.exec(line))) {
            add(line.slice(last, m.index), null);
            add(m[2], m[1]);
            last = re.lastIndex;
        }
        add(line.slice(last), null);
        return out;
    }

    // 최장 공통 부분열로 짝을 맞춘다: 같은 항목끼리의 [i, j] 목록
    static lcs(a, b, same) {
        const n = a.length, m = b.length;
        const t = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
        for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) t[i][j] = same(a[i], b[j]) ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
        const pairs = [];
        let i = 0, j = 0;
        while (i < n && j < m) {
            if (same(a[i], b[j])) pairs.push([i++, j++]);
            else if (t[i + 1][j] >= t[i][j + 1]) i++;
            else j++;
        }
        return pairs;
    }

    // 낱말을 다시 글로. mark(i)가 참인 낱말은 강조색으로
    // plain이면 그대로인 낱말의 색 표시를 벗겨 강조가 돋보이게 한다
    static render(toks, mark, plain = false) {
        return toks.map((t, i) => {
            const body = mark(i) ? `[[upnew:${t.w}]]` : t.key && !plain ? `[[${t.key}:${t.w}]]` : t.w;
            return (i > 0 && t.sp ? " " : "") + body;
        }).join("");
    }

    // 현재 효과글 → 강화 후 효과글 비교. 반환: { lines: [{ text, kind: "same"|"changed"|"added" }], removed: [글…] }
    //   같은 줄: 색 표시를 벗기고 흐리게 / 바뀐 줄: 달라진 낱말만 강조 / 새 줄: 낱말 전부 강조 / 없어진 줄: removed
    static diff(oldText, newText) {
        UpgradeFlow.ensureKeys();
        const A = String(oldText ?? "").split("\n").filter((l) => l.trim() !== "");
        const B = String(newText ?? "").split("\n").filter((l) => l.trim() !== "");
        const P = (l) => CardText.strip(l).trim();
        const anchors = UpgradeFlow.lcs(A, B, (x, y) => P(x) === P(y));
        anchors.push([A.length, B.length]);
        const lines = [];
        const removed = [];
        let ai = 0, bi = 0;
        for (const [ea, eb] of anchors) {
            const oldGap = A.slice(ai, ea);
            const newGap = B.slice(bi, eb);
            // 새 줄마다 옛 줄 중 낱말이 가장 많이 겹치는 것과 (순서를 지키며) 짝지어 달라진 낱말만 강조. 겹침이 적으면 새 줄
            let from = 0;
            const usedOld = new Set();
            newGap.forEach((line) => {
                const toks = UpgradeFlow.tokens(line);
                let best = -1, bestKeep = null, bestN = 0;
                for (let j = from; j < oldGap.length; j++) {
                    const old = UpgradeFlow.tokens(oldGap[j]);
                    const pairs = UpgradeFlow.lcs(old, toks, (x, y) => x.w === y.w);
                    if (pairs.length > bestN) { best = j; bestN = pairs.length; bestKeep = new Set(pairs.map((q) => q[1])); }
                }
                if (best >= 0 && bestN * 2 >= Math.min(toks.length, UpgradeFlow.tokens(oldGap[best]).length)) {
                    usedOld.add(best);
                    from = best + 1;
                    const keep = bestKeep;
                    lines.push({ text: UpgradeFlow.render(toks, (i) => !keep.has(i), true), kind: "changed" });
                } else lines.push({ text: UpgradeFlow.render(toks, () => true), kind: "added" });
            });
            oldGap.forEach((l, j) => { if (!usedOld.has(j)) removed.push(CardText.strip(l)); });
            if (ea < A.length) lines.push({ text: P(B[eb]), kind: "same" });
            ai = ea + 1;
            bi = eb + 1;
        }
        return { lines, removed };
    }

    // 강화 후 이 카드가 낼 수 있는 비용들 (비용 경우가 여럿이고 지금 고른 경우가 새 정의에서도 유효하면 그것 하나, 아니면 모두 "그중 하나")
    static costsAfter(card, def) {
        const opts = Card.costOptions(def);
        if (opts.length < 2) return [opts[0]];
        const pay = card.data?.pay;
        return Number.isInteger(pay) && pay >= 0 && pay < opts.length ? [opts[pay]] : opts;
    }

    static costLabel(cost) {
        return CardDef.costText(cost) || "비용 없음";
    }

    // 비용 비교 글 (rich): 같으면 "기력 2 (같음)", 달라지면 "기력 2 → [[upnew:마나 2]]", 여럿이면 "… / …  중 하나"
    static costLine(card, def) {
        const now = UpgradeFlow.costLabel(card.cost);
        const after = UpgradeFlow.costsAfter(card, def).map(UpgradeFlow.costLabel);
        const same = after.length === 1 && after[0] === now;
        if (same) return `비용 ${now} (같음)`;
        const shown = after.length === 1 ? after[0] : `${after.join(" / ")} 중 하나`;
        return `비용 ${now} → [[upnew:${shown}]]`;
    }
}

// 강화 선택 창: 위에 "지금 카드", 아래에 그 카드가 받을 수 있는 강화들(효과 변화 강조). 줄을 눌러 고르고 [강화한다].
//   세로로 끌거나 휠로 스크롤한다. [뒤로] 카드 고르기로 / [닫기]·배경·Esc 취소.
class UpgradeOptionDialog extends Component {
    static W = 420;
    static H = 600;
    static PAD = 8;

    constructor(options) {
        super();
        this.engine = options.engine;
        this.card = null;
        this.opts = [];
        this.handlers = null;
        this.selected = null;
        this.rows = [];
        this.views = [];
        this.armed = false;
        this._ctx = document.createElement("canvas").getContext("2d");
    }

    get isOpen() {
        return this.handlers !== null;
    }

    start() {
        this.build();
    }

    build() {
        if (this.root) return;
        const { root, box } = Modal.create(this.engine, "upgradeOption", UpgradeOptionDialog.W, UpgradeOptionDialog.H, () => this.finish("cancel"));
        this.root = root;
        this.box = box;
        this.title = UIKit.label(box, "title", "", 14, 10, null, 18, { fontSize: 14, fontWeight: "bold", color: UIKit.COLORS.gold });
        this.sub = UIKit.label(box, "sub", "강화를 하나 고르면 효과가 어떻게 바뀌는지 보인다.", 14, 31, null, 14, { fontSize: 11, color: "#c8b890" });

        const list = box.createChild("list");
        this.list = list.getComponent(RectTransform);
        this.list.setAnchor(0, 0, 1, 1);
        this.list.setOffsets(12, 52, 12, 116);
        list.addComponent(new UIRect({ color: "rgba(0, 0, 0, 0.25)" }));
        list.addComponent(new UIMask());
        this.content = this.list.createChild("content").getComponent(RectTransform);
        const bar = this.list.createChild("scrollbar");
        bar.addComponent(new UIRect({ color: "rgba(232, 217, 184, 0.45)" }));
        this.scroll = list.addComponent(new UIScrollView({
            content: this.content, bar: bar.getComponent(RectTransform),
            onTap: (pointer) => {
                const v = this.views.find((v) => UIKit.contains(v.rt, pointer.position));
                if (v) this.select(v.def);
            }
        }));
        this.measurer = UIKit.label(box, "measure", "", 0, 0, 10, 10, { fontSize: 12, wrap: true, lineHeight: 1.35, rich: true });

        // 아래: 큰 [강화한다], 그 아래 [뒤로] [닫기]
        this.confirmButton = UIKit.button(box, "confirm", "", () => this.confirm(), { fontSize: 15 });
        this.confirmButton.rt.setAnchor(0, 1, 1, 1);
        this.confirmButton.rt.setOffsets(12, -108, 12, 46);
        this.backButton = UIKit.button(box, "back", "뒤로 (카드 다시 고르기)", () => this.finish("back"), { fontSize: 12 });
        this.backButton.rt.setAnchor(0, 1, 0.65, 1);
        this.backButton.rt.setOffsets(12, -40, 3, 10);
        const close = UIKit.button(box, "close", "닫기", () => this.finish("cancel"), { fontSize: 12 });
        close.rt.setAnchor(0.65, 1, 1, 1);
        close.rt.setOffsets(3, -40, 12, 10);
    }

    // handlers: { title, onApply(def), onBack(), onCancel() }
    open(card, opts, handlers) {
        this.build();
        this.card = card;
        this.opts = opts;
        this.handlers = handlers;
        this.armed = false;
        this.shop = handlers.shop ?? null;
        const pickable = opts.filter((d) => this.canPick(d));
        this.selected = pickable.length === 1 ? pickable[0] : null; // 하나뿐이면 미리 골라 둔다 (그래도 [강화한다]를 눌러야 한다)
        this.title.setText(handlers.title ?? "강화");
        this.sub.setText(this.shop ? (this.shop.note ?? "이 상점이 파는 색만 고를 수 있다. 값은 강화할 때 낸다.") : "강화를 하나 고르면 효과가 어떻게 바뀌는지 보인다.");
        const size = Modal.fit(this.engine, this.box, UpgradeOptionDialog.W, UpgradeOptionDialog.H);
        this.scroll.scrollTo(0);
        Modal.show(this.root, true);
        this._width = null;
        this.layoutAfterShow = true;
        this.rebuild();
    }

    // 상점이면 파는(품절 아닌) 색만 고를 수 있다
    canPick(def) {
        return !this.shop || (def.upgradeKey in this.shop.prices && !(this.shop.sold && this.shop.sold[def.upgradeKey]));
    }

    shopMoney() {
        const m = this.shop.money;
        return typeof m === "function" ? m() : m;
    }

    select(def) {
        if (!this.canPick(def)) return;
        this.selected = def;
        this.rebuild();
    }

    confirm() {
        if (!this.selected) return;
        this.finish("apply");
    }

    finish(kind) {
        const h = this.handlers;
        if (!h) return;
        const def = this.selected;
        this.handlers = null;
        Modal.show(this.root, false);
        if (kind === "apply") h.onApply(def);
        else if (kind === "back") h.onBack();
        else h.onCancel();
    }

    // 글이 width 안에서 몇 줄인가
    lines(text, size, width, bold = false) {
        const t = this.measurer;
        t.fontSize = size;
        t.fontWeight = bold ? "bold" : "normal";
        t.setText(text);
        const n = t.measureLines(this._ctx, width);
        t.setText("");
        return Math.max(1, n);
    }

    // 글 칸 하나 만들기: 높이를 재서 놓고 쓴 높이를 돌려준다
    text(parent, name, text, x, y, w, size, opt = {}) {
        const h = Math.ceil(this.lines(text, size, w, opt.bold) * size * 1.35);
        UIKit.label(parent, name, text, x, y, w, h, { fontSize: size, color: opt.color ?? UIKit.COLORS.text, fontWeight: opt.bold ? "bold" : "normal", wrap: true, lineHeight: 1.35, rich: true, align: opt.align ?? "left" });
        return h;
    }

    rebuild() {
        if (!this.handlers) return;
        for (const go of this.rows) go.destroy();
        this.rows = [];
        this.views = [];
        UpgradeFlow.ensureKeys();
        const PAD = UpgradeOptionDialog.PAD;
        const width = Math.floor(this.list.rect.width / this.list.uiRoot.scale) - 6; // 스크롤바 자리
        const tw = width - PAD * 2;
        const card = this.card;
        const nowText = card.text(true);
        let y = 6;

        // ---- 지금 카드 ----
        {
            const go = this.content.createChild("now");
            const rt = UIKit.place(go, 3, y, width, 40);
            go.addComponent(new UIRect({ color: "rgba(30, 40, 52, 0.95)", borderColor: "#5a7a9a", borderWidth: 1 }));
            UIKit.icon(rt, "icon", card.def, PAD, PAD, 36);
            UIKit.label(rt, "tag", "지금 카드", PAD + 44, PAD - 1, null, 13, { fontSize: 10, color: "#8ab4d8" });
            UIKit.label(rt, "name", card.name, PAD + 44, PAD + 13, tw - 44, 17, { fontSize: 14, fontWeight: "bold", color: UIKit.COLORS.text });
            const cost = UpgradeFlow.costLabel(card.cost);
            const rarity = card.def.rarity ? ` · ${UpgradeOptionDialog.RARITY[card.def.rarity] ?? card.def.rarity}` : "";
            let by = PAD + 36 + 8;
            by += this.text(rt, "cost", `비용 ${cost}${rarity}`, PAD, by, tw, 11, { color: "#c8b890" }) + 3;
            by += this.text(rt, "text", nowText, PAD, by, tw, 12, { color: "#efe2c4" });
            const h = by + PAD;
            rt.setOffsets(3, y, -(3 + width), -(y + h));
            this.rows.push(go);
            y += h + 8;
        }

        // ---- 머리글 ----
        {
            const go = this.content.createChild("head");
            const rt = UIKit.place(go, 3, y, width, 18);
            UIKit.label(rt, "t", `이 카드가 받을 수 있는 강화 ${this.opts.length}개 · 하나를 고른다`, 2, 2, null, 15, { fontSize: 12, fontWeight: "bold", color: UIKit.COLORS.gold });
            const line = rt.createChild("line");
            UIKit.place(line, 0, 17, null, 1);
            line.addComponent(new UIRect({ color: UIKit.COLORS.border }));
            this.rows.push(go);
            y += 22;
        }

        // ---- 강화 줄들 (붉·푸·노·초·보라 순) ----
        const order = [...UpgradeFlow.EASY, ...UpgradeFlow.HARD];
        const sorted = [...this.opts].sort((a, b) => order.indexOf(a.upgradeKey) - order.indexOf(b.upgradeKey));
        for (const def of sorted) {
            const c = UpgradeFlow.COLORS[def.upgradeKey] ?? { name: "", css: UIKit.COLORS.dim, hard: false };
            const on = this.selected === def;
            const sold = !!(this.shop && this.shop.sold && this.shop.sold[def.upgradeKey]);
            const off = !this.canPick(def);
            const price = this.shop ? this.shop.prices[def.upgradeKey] : null;
            const preview = Object.assign(new Card(def.id), { data: card.data ? { ...card.data } : null });
            const diff = UpgradeFlow.diff(nowText, preview.text(true));
            const go = this.content.createChild("opt");
            const rt = UIKit.place(go, 3, y, width, 40);
            const bg = go.addComponent(new UIRect({
                color: off ? "rgba(30, 26, 22, 0.8)" : on ? "rgba(80, 62, 28, 0.98)" : "rgba(42, 35, 30, 0.95)",
                borderColor: on ? UIKit.COLORS.gold : UIKit.COLORS.border, borderWidth: on ? 3 : 1
            }));
            const chip = rt.createChild("chip");
            UIKit.place(chip, PAD + 1, PAD + 1, 22, 22);
            chip.addComponent(new UIRect({ color: off ? UIKit.COLORS.faint : c.css, borderColor: on ? UIKit.COLORS.gold : "#1e1610", borderWidth: on ? 2 : 1 }));
            const tag = c.hard ? "어려움" : "";
            let mark = on ? (tag ? "어려움 · 선택됨" : "선택됨") : tag;
            if (this.shop) mark = sold ? "품절" : off ? "이 상점에서는 팔지 않는다" : `${price} G${on ? " · 선택됨" : ""}`;
            UIKit.label(rt, "mark", mark, PAD, PAD + 4, null, 14, { fontSize: 11, fontWeight: "bold", align: "right", color: off ? UIKit.COLORS.faint : on ? UIKit.COLORS.gold : "#e89060" });
            UIKit.label(rt, "name", preview.name, PAD + 30, PAD + 3, tw - 30 - (this.shop ? 0 : 52), 17, { fontSize: 14, fontWeight: "bold", color: off ? UIKit.COLORS.faint : on ? "#fff0c8" : UIKit.COLORS.text });
            let by = PAD + 28;
            by += this.text(rt, "cost", UpgradeFlow.costLine(card, def), PAD, by, tw, 11, { color: off ? "#7a6e5c" : "#c8b890" }) + 3;
            diff.lines.forEach((ln, k) => {
                const dim = ln.kind === "same" || off;
                const text = ln.kind === "added" ? `+ ${ln.text}` : ln.text;
                by += this.text(rt, "l" + k, text, PAD, by, tw, 12, { color: dim ? "#8a7c66" : "#f4ead0" });
            });
            if (diff.lines.length === 0) by += this.text(rt, "none", "(효과글 없음)", PAD, by, tw, 12, { color: "#8a7c66" });
            diff.removed.forEach((line, k) => {
                by += 1 + this.text(rt, "r" + k, `(없어짐) ${line}`, PAD, by + 1, tw, 11, { color: "#c06a58" });
            });
            const h = by + PAD;
            rt.setOffsets(3, y, -(3 + width), -(y + h));
            this.rows.push(go);
            this.views.push({ def, rt });
            y += h + 6;
        }
        this.scroll.contentHeight = y + 4;
        this.scroll.scrollTo(this.scroll.scroll);

        // 확정 버튼
        const sel = this.selected;
        let ok = !!sel;
        let label = sel ? `[ 강화한다 ▶ ${sel.name} ]` : "위에서 강화를 하나 고른다";
        if (this.shop && sel) {
            const price = this.shop.prices[sel.upgradeKey];
            const money = this.shopMoney();
            if (money < price) {
                ok = false;
                label = `돈이 모자란다 (${price} G 필요 · 내 돈 ${money} G)`;
            } else label = `[ 강화한다 · ${price} G ]`;
        } else if (this.shop) label = "위에서 파는 강화를 하나 고른다";
        this.confirmButton.text.setText(label);
        this.confirmButton.text.color = ok ? UIKit.COLORS.gold : UIKit.COLORS.faint;
        this.confirmButton.text.fontWeight = ok ? "bold" : "normal";
        this.confirmButton.rect.color = ok ? "#6a4a1c" : UIKit.COLORS.buttonOff;
        this.confirmButton.rect.borderColor = ok ? UIKit.COLORS.gold : UIKit.COLORS.border;
        this.confirmButton.ui.enabled = ok;
    }

    update() {
        if (!this.handlers) return;
        if (!this.armed) { this.armed = true; return; }
        if (Input.getButtonDown("cancel")) return this.finish("cancel");
        // 창 크기가 바뀌면(화면 회전·크기 조절) 다시 맞춘다
        const w = Math.floor(this.list.rect.width / this.list.uiRoot.scale);
        if (w !== this._width) {
            this._width = w;
            if (!this.layoutAfterShow) Modal.fit(this.engine, this.box, UpgradeOptionDialog.W, UpgradeOptionDialog.H);
            this.layoutAfterShow = false;
            this.rebuild();
        }
    }

    static RARITY = { common: "흔함", uncommon: "드묾", rare: "희귀", boss: "우두머리" };
}

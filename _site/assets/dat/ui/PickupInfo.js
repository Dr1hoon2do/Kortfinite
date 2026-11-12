// 바닥 물건 곁에 가면 그 물건 정보를 보여 주는 칸.
// 계약: new PickupInfo({ engine, player, world, run }) — 컴포넌트, 플레이어 바로 옆(상하좌우)의 Pickup(entity/Pickups.js)을 찾아 보여 준다.
// - 옆칸 Pickup 집합(또는 폭·돈·카드 정보 설정·상태이상 줄 유무)이 바뀔 때만 다시 만든다 (매 프레임은 열쇠 문자열 비교뿐).
// - 선택창(Modal)이 열려 있거나 칸 고르기 중(Game.targeting.active)이면 숨긴다.
// - 글자와 바탕만 있어서 월드 탭을 가로채지 않는다 (UIElement가 없음 → UIEventSystem.raycast에 안 걸린다).
// - 자리: 손패 막대 위 (칸 고르기 안내줄과 같은 자리 — 안내줄이 뜨면 이쪽이 숨는다).
class PickupInfo extends Component {
    static MAX_W = 320;      // 물건이 하나일 때 칸 폭
    static MIN_W = 150;      // 여럿일 때 나란히 놓을 수 있는 최소 칸 폭
    static GAP = 4;
    static PAD = 8;

    constructor(options) {
        super();
        this.engine = options.engine;
        this.player = options.player;
        this.world = options.world;
        this.run = options.run ?? null;
        this._key = null;
        this._ctx = document.createElement("canvas").getContext("2d");
    }

    start() {
        this.root = this.engine.createUI("pickupInfo");
        this.rt = this.root.getComponent(RectTransform);
        this.rt.sortOrder = UILayer.HAND + 1;
        this.rt.setAnchor(0.5, 1, 0.5, 1);
        this.parts = [];
        // 글 줄 수를 재는 도구 (실제 UI 배율로 재야 한다)
        const m = this.rt.createChild("measure");
        UIKit.place(m, 0, 0, 10, 10);
        this.measurer = m.addComponent(new UIText("", { fontSize: 12, wrap: true, lineHeight: 1.35, rich: true }));
        this.root.setActive(false);
    }

    // 플레이어가 서 있는 칸과 바로 옆의 Pickup들 (서 있는 칸이 먼저, 그다음 위·오른·아래·왼 순). 가지는 건 서 있는 칸의 것뿐
    nearby() {
        const p = this.player;
        const list = [];
        for (const [dx, dy] of [[0, 0], ...Entity.DIRS]) {
            for (const o of this.world.entitiesAt(p.x + dx, p.y + dy)) {
                if (o instanceof Pickup && o.world && o.item) list.push({ pickup: o, dx, dy });
            }
        }
        return list;
    }

    hidden() {
        const g = window.Game;
        return Modal.isOpen || !this.player.alive || !!(g && g.targeting && g.targeting.active);
    }

    update() {
        if (!this.root) return;
        const list = this.hidden() ? [] : this.nearby();
        if (!list.length) {
            if (this._key !== "") {
                this._key = "";
                this.clear();
                this.root.setActive(false);
            }
            return;
        }
        const scale = this.engine.uiRoot.scale;
        const W = Math.floor(this.engine.canvas.width / scale);
        const H = Math.floor(this.engine.canvas.height / scale);
        const priced = list.some((e) => e.pickup.item.price);
        const above = this.statusRowActive() ? 1 : 0;
        const key = `${W}x${H}:${above}:${CardInspector.enabled() ? 1 : 0}:${priced ? this.player.money : "-"}:` +
            list.map((e) => `${e.dx},${e.dy}:${e.pickup.item.key}`).join("|");
        if (key === this._key) return;
        this._key = key;
        this.build(list, W, H, above);
        this.root.setActive(true);
    }

    // 상태이상 아이콘 줄이 떠 있는가 (있으면 그 위로 올린다)
    statusRowActive() {
        if (!this._statusGO || this._statusGO.isDestroyed) this._statusGO = this.engine.find("statusRow");
        return !!(this._statusGO && this._statusGO.isActive);
    }

    clear() {
        for (const go of this.parts) go.destroy();
        this.parts = [];
    }

    // ---- 칸 하나의 내용 ----
    // 반환: { lines: [{ text, size, color, bold, wrap, h }], icon: def|null, w, h } — 폭 w 안에서 높이를 잰다
    describe(entry) {
        const it = entry.pickup.item;
        const rows = [];
        let icon = null;
        let title = "";
        let sub = "";
        if (it.kind === "gold" || !it.card) {
            title = `${it.gold ?? 0} G`;
            sub = "돈 더미";
        } else {
            const card = it.card;
            const def = card.def;
            icon = def;
            title = card.name;
            const cost = CardDef.costText(card.cost);
            const rarity = def.rarity ? ` · ${ShopDialog.RARITY[def.rarity]}` : "";
            sub = `${CardDef.kindName(def)}${rarity}${cost ? " · " + cost : ""}`;
        }
        return { it, icon, title, sub, card: it.card && it.kind !== "gold" ? it.card : null };
    }

    build(list, W, H, above) {
        this.clear();
        const pad = PickupInfo.PAD;
        const gap = PickupInfo.GAP;
        const n = list.length;
        const avail = W - 16;
        // 배치: 하나면 한 칸. 여럿이면 나란히(칸 폭 150 이상) 못 놓을 때 세로로
        let cols = 1;
        if (n > 1) {
            cols = n;
            while (cols > 1 && Math.floor((avail - gap * (cols - 1)) / cols) < PickupInfo.MIN_W) cols--;
        }
        const cardW = n === 1 ? Math.min(PickupInfo.MAX_W, avail) : Math.min(PickupInfo.MAX_W, Math.floor((avail - gap * (cols - 1)) / cols));
        const compact = n > 1;

        // 칸마다 내용을 만들고 높이를 잰다 (자리는 나중에)
        const cells = list.map((e) => this.makeCell(e, cardW, compact));
        const rows = [];
        for (let i = 0; i < n; i += cols) rows.push(cells.slice(i, i + cols));
        const rowH = rows.map((r) => Math.max(...r.map((c) => c.h)));
        const hintText = list.some((n) => n.dx === 0 && n.dy === 0) ? "서 있는 칸의 것을 [상호작용] 버튼(손 모양)이나 E로 가진다" : "그 칸 위에 올라서서 [상호작용] 버튼(손 모양)이나 E로 가진다";
        const footH = 18;

        let totalW = cardW * cols + gap * (cols - 1);
        if (cols > 1 && rows[rows.length - 1].length < cols && rows.length === 1) totalW = cardW * rows[0].length + gap * (rows[0].length - 1);
        const bodyH = rowH.reduce((a, b) => a + b, 0) + gap * (rows.length - 1);
        const totalH = bodyH + gap + footH;
        // 화면 높이에 안 맞으면 어쩔 수 없이 넘치지만, 좁은 화면 대비로 용어 풀이를 이미 뺐다 (여럿일 때)

        const bottom = PlayerHud.BAR_BOTTOM + PlayerHud.BAR_H + 4 + (above ? 24 : 0) + 4;
        this.rt.setSizeAndPosition(totalW, totalH, 0, -(bottom + totalH / 2));

        let y = 0;
        rows.forEach((r, ri) => {
            r.forEach((c, ci) => this.place(c, ci * (cardW + gap), y, cardW, rowH[ri]));
            y += rowH[ri] + gap;
        });
        // 안내 한 줄
        const foot = this.rt.createChild("foot");
        this.parts.push(foot);
        UIKit.place(foot, 0, y, totalW, footH);
        foot.addComponent(new UIRect({ color: "rgba(18, 13, 10, 0.9)", borderColor: UIKit.COLORS.border, borderWidth: 1 }));
        const frt = foot.getComponent(RectTransform);
        UIKit.label(frt, "t", hintText, 4, 0, totalW - 8, footH, { fontSize: 10, color: UIKit.COLORS.dim, align: "center", verticalAlign: "middle" });
    }

    // 칸 한 개를 만들 재료와 높이 (이름 줄·종류 줄·설명·용어·값·묶음 안내)
    makeCell(entry, w, compact) {
        const d = this.describe(entry);
        const pad = PickupInfo.PAD;
        const tw = w - pad * 2;
        const it = d.it;
        const measure = (text, size, wrapW, bold = false) => {
            const t = this.measurer;
            t.fontSize = size;
            t.fontWeight = bold ? "bold" : "normal";
            t.setText(text);
            const lines = t.measureLines(this._ctx, wrapW);
            t.setText(""); // 재는 글이 화면에 그려지지 않게
            return lines;
        };
        const cell = { d, w, items: [] };
        let y = pad;
        const iconSize = compact ? 28 : 36;
        const headW = tw - (d.icon ? iconSize + 6 : 0);
        const headX = pad + (d.icon ? iconSize + 6 : 0);
        // 머리: 그림 + 이름 + 종류 줄
        const nameSize = compact ? 12 : 14;
        cell.items.push({ type: "text", text: d.title, x: headX, y: y + 1, w: headW, h: Math.ceil(nameSize * 1.3), size: nameSize, color: UIKit.COLORS.gold, bold: true });
        const subLines = measure(d.sub, 10, headW);
        const subH = Math.ceil(subLines * 10 * 1.35);
        const subY = y + 1 + Math.ceil(nameSize * 1.3) + 1;
        cell.items.push({ type: "text", text: d.sub, x: headX, y: subY, w: headW, h: subH, size: 10, color: "#c8b890", wrap: true });
        if (d.icon) cell.items.push({ type: "icon", def: d.icon, x: pad, y: y, size: iconSize });
        y = Math.max(subY + subH, y + (d.icon ? iconSize : 0)) + 4;

        // 설명 + 용어 풀이
        if (d.card) {
            const body = d.card.text(false);
            if (body) {
                const size = compact ? 11 : 12;
                const h = Math.ceil(measure(body, size, tw) * size * 1.35);
                cell.items.push({ type: "text", text: body, x: pad, y, w: tw, h, size, color: "#efe2c4", wrap: true });
                y += h + 4;
            }
            const terms = !compact && CardInspector.enabled() ? CardText.glossary(body) : "";
            if (terms) {
                const h = Math.ceil(measure(terms, 10, tw) * 10 * 1.35);
                cell.items.push({ type: "line", x: pad, y: y, w: tw });
                y += 4;
                cell.items.push({ type: "text", text: terms, x: pad, y, w: tw, h, size: 10, color: "#a89878", wrap: true });
                y += h + 4;
            }
        }
        // 값
        if (it.price) {
            const lack = this.player.money < it.price;
            const size = compact ? 13 : 16;
            cell.items.push({ type: "text", text: `값 ${it.price} G`, x: pad, y, w: tw, h: Math.ceil(size * 1.3), size, color: lack ? "#f08c80" : "#f0d878", bold: true });
            y += Math.ceil(size * 1.3) + 2;
            if (lack) {
                const msg = `돈이 모자란다 (지금 ${this.player.money} G)`;
                const h = Math.ceil(measure(msg, 10, tw) * 10 * 1.35);
                cell.items.push({ type: "text", text: msg, x: pad, y, w: tw, h, size: 10, color: "#e8584c", wrap: true });
                y += h + 2;
            }
        }
        // 묶음
        if (it.group) {
            const msg = "셋 중 하나만 가질 수 있다";
            const h = Math.ceil(measure(msg, 10, tw) * 10 * 1.35);
            cell.items.push({ type: "text", text: msg, x: pad, y, w: tw, h, size: 10, color: "#7cc4e8", wrap: true });
            y += h + 2;
        }
        cell.h = y + pad - 2;
        return cell;
    }

    place(cell, x, y, w, h) {
        const go = this.rt.createChild("cell");
        this.parts.push(go);
        UIKit.place(go, x, y, w, h);
        const priceLack = cell.d.it.price && this.player.money < cell.d.it.price;
        go.addComponent(new UIRect({ color: "rgba(18, 13, 10, 0.92)", borderColor: priceLack ? "#a8483c" : UIKit.COLORS.gold, borderWidth: 1 }));
        const crt = go.getComponent(RectTransform);
        for (const e of cell.items) {
            if (e.type === "icon") UIKit.icon(crt, "icon", e.def, e.x, e.y, e.size);
            else if (e.type === "line") {
                const l = crt.createChild("line");
                UIKit.place(l, e.x, e.y, e.w, 1);
                l.addComponent(new UIRect({ color: "rgba(232, 184, 64, 0.35)" }));
            } else {
                UIKit.label(crt, "t", e.text, e.x, e.y, e.w, e.h, { fontSize: e.size, color: e.color, fontWeight: e.bold ? "bold" : "normal", wrap: !!e.wrap, lineHeight: 1.35, rich: true });
            }
        }
    }
}

// 지도 화면: 1막 그물망 지도. 아래(1층)에서 위(우두머리)로. 화면을 가득 덮는다.
//   고르기 모드 (방을 나왔을 때): 갈 수 있는 칸이 금색으로 깜빡이고, 누르면 그 방으로 들어간다.
//   보기 모드 (방 안에서 지도 버튼·M): 지나온 길과 앞으로의 길을 본다. [닫기]
// 칸 그림은 map_icons.png (전투·정예·상점·휴식·보물·우두머리), 칸 사이 선은 MapLines가 그린다.
class MapScreen extends Component {
    static ROW_H = 58;
    static NODE = 34;

    // options: { engine, run, deckView }
    constructor(options) {
        super();
        this.engine = options.engine;
        this.run = options.run;
        this.deckView = options.deckView ?? null;
        this.equipDialog = options.equipDialog ?? null;
        this.mode = null; // "choose" | "view"
        this.nodes = new Map(); // id → { go, rt, ring, node }
    }

    get isOpen() {
        return this.mode !== null;
    }

    start() {
        Input.defineButton("map", ["KeyM"]);
        const e = this.engine;
        this.root = e.createUI("mapScreen");
        const rrt = this.root.getComponent(RectTransform);
        rrt.setAnchor(0, 0, 1, 1);
        rrt.setOffsets(0, 0, 0, 0);
        this.root.addComponent(new UIRect({ color: "rgba(16, 12, 9, 0.97)" }));
        this.root.addComponent(new UIElement());

        this.title = UIKit.label(rrt, "title", "", 14, 12, null, 20, { fontSize: 15, fontWeight: "bold", color: UIKit.COLORS.gold });
        this.sub = UIKit.label(rrt, "sub", "", 14, 34, null, 16, { fontSize: 11, color: "#c8b890" });
        // 범례
        const legend = rrt.createChild("legend");
        this.legend = UIKit.place(legend, 14, 54, null, 18);
        Object.entries(RunMap.TYPES).forEach(([type, info], i) => {
            const icon = this.legend.createChild("icon");
            UIKit.place(icon, i * 58, 0, 16, 16);
            icon.addComponent(new UIImage(Resource.image("map_icons"), { region: { x: info.icon * 16, y: 0, width: 16, height: 16 } }));
            UIKit.label(this.legend, "name", info.name, i * 58 + 18, 1, 40, 16, { fontSize: 10, color: info.color });
        });

        const list = rrt.createChild("list");
        this.list = list.getComponent(RectTransform);
        this.list.setAnchor(0, 0, 1, 1);
        this.list.setOffsets(8, 78, 8, 56); // 넓은 화면에선 update에서 가운데 좁게
        list.addComponent(new UIRect({ color: "rgba(40, 32, 24, 0.6)", borderColor: UIKit.COLORS.border, borderWidth: 1 }));
        list.addComponent(new UIMask());
        this.content = this.list.createChild("content").getComponent(RectTransform);
        const lines = this.content.createChild("lines");
        lines.getComponent(RectTransform).setAnchor(0, 0, 1, 1);
        this.lines = lines.addComponent(new MapLines(this));
        const bar = this.list.createChild("scrollbar");
        bar.addComponent(new UIRect({ color: "rgba(232, 217, 184, 0.45)" }));
        this.scroll = list.addComponent(new UIScrollView({ content: this.content, bar: bar.getComponent(RectTransform) }));

        // 칸들
        const map = this.run.map;
        for (const node of map.nodes.values()) {
            const info = RunMap.TYPES[node.type];
            const go = this.content.createChild("node " + node.id);
            const rt = go.getComponent(RectTransform);
            const ring = rt.createChild("ring");
            ring.getComponent(RectTransform).setAnchor(0, 0, 1, 1);
            ring.getComponent(RectTransform).setOffsets(-4, -4, -4, -4);
            const ringRect = ring.addComponent(new UIRect({ color: "rgba(232, 184, 64, 0.18)", borderColor: UIKit.COLORS.gold, borderWidth: 2 }));
            const back = go.addComponent(new UIRect({ color: "#2a231e", borderColor: info.color, borderWidth: 1 }));
            const icon = rt.createChild("icon");
            icon.getComponent(RectTransform).setAnchor(0, 0, 1, 1);
            icon.getComponent(RectTransform).setOffsets(3, 3, 3, 3);
            icon.addComponent(new UIImage(Resource.image("map_icons"), { region: { x: info.icon * 16, y: 0, width: 16, height: 16 } }));
            go.addComponent(new UIButton({ onTap: () => this.tapNode(node) }));
            this.nodes.set(node.id, { go, rt, ring, ringRect, back, node });
        }

        // 아래 버튼
        this.deckButton = UIKit.button(rrt, "deck", "덱 보기", () => this.deckView && this.deckView.open(), { fontSize: 12 });
        this.deckButton.rt.setAnchor(0, 1, 1 / 3, 1);
        this.deckButton.rt.setOffsets(12, -46, 3, 10);
        // 지도 화면은 아래 패를 가려서, 장비는 여기서 입고 벗는다
        this.equipButton = UIKit.button(rrt, "equip", "장비", () => this.equipDialog && this.equipDialog.open(), { fontSize: 12 });
        this.equipButton.rt.setAnchor(1 / 3, 1, 2 / 3, 1);
        this.equipButton.rt.setOffsets(3, -46, 3, 10);
        this.closeButton = UIKit.button(rrt, "close", "닫기", () => this.close(), { fontSize: 12 });
        this.closeButton.rt.setAnchor(2 / 3, 1, 1, 1);
        this.closeButton.rt.setOffsets(3, -46, 12, 10);

        this.root.setActive(false);
    }

    // choose: 고르기 모드 (방을 나와서), 아니면 보기 모드
    open(choose) {
        this.mode = choose ? "choose" : "view";
        if (!this.root.isActive) Modal.show(this.root, true);
        this._width = null;
        this.closeButton.text.setText(choose ? "고르는 중" : "닫기");
        UIKit.setEnabled(this.closeButton, !choose);
        this.refresh();
        this.scrollToCurrent();
    }

    close() {
        if (!this.mode) return;
        this.mode = null;
        Modal.show(this.root, false);
    }

    toggleView() {
        if (this.mode === "view") this.close();
        else if (!this.mode && !Modal.isOpen && this.run.state === "room") this.open(false);
    }

    tapNode(node) {
        if (this.mode !== "choose") return;
        if (!this.run.choices().some((n) => n.id === node.id)) {
            MessageLog.add("거기로는 갈 수 없다 (이어진 칸만)", "#c8b890");
            return;
        }
        this.run.enter(node.id);
    }

    // 칸 자리 (content 왼쪽 위 기준, UI 단위). 아래가 1층
    nodePos(node, width) {
        const jitter = node.type === "boss" ? 0 : ((Rng.mix(this.run.seed, node.row * 31 + node.col) % 13) - 6);
        const x = 32 + node.x * (width - 64) + jitter;
        const y = 34 + (RunMap.ROWS - node.row) * MapScreen.ROW_H + (node.type === "boss" ? -8 : jitter * 0.6);
        return { x, y };
    }

    get contentHeight() {
        return 34 * 2 + RunMap.ROWS * MapScreen.ROW_H + 10;
    }

    scrollToCurrent() {
        const run = this.run;
        const row = run.current ? run.map.get(run.current).row + 1 : 0;
        const y = 34 + (RunMap.ROWS - row) * MapScreen.ROW_H;
        const view = this.scroll.viewportHeight || 400;
        this.scroll.contentHeight = this.contentHeight;
        this.scroll.scrollTo(y - view * 0.6);
    }

    refresh() {
        const run = this.run;
        const choices = new Set(run.choices().map((n) => n.id));
        const visited = new Set(run.visited);
        const floor = run.current ? run.map.get(run.current).row + 1 : 0;
        this.title.setText(this.mode === "choose" ? `다음 방을 고른다 · ${floor + 1}층` : `지도 · 지금 ${run.floor}층`);
        this.sub.setText(`체력 ${run.player.stats.hp}/${run.player.stats.maxHp} · ${run.player.money} G · 덱 ${run.player.cards.allActions.length}장 · 금색 칸 중에서 고른다`);
        for (const [id, n] of this.nodes) {
            const on = this.mode === "choose" && choices.has(id);
            n.ring.setActive(on || id === run.pending);
            n.ringRect.borderColor = id === run.pending ? "#7cc4e8" : UIKit.COLORS.gold;
            const done = visited.has(id);
            n.back.color = done ? "#4a3e32" : "#2a231e";
            n.go.getComponent(RectTransform).alpha = on || done || id === run.pending ? 1 : 0.6;
        }
    }

    update() {
        if (Input.getButtonDown("map")) this.toggleView();
        if (!this.mode) return;
        if (this.mode === "view" && Input.getButtonDown("cancel") && !(this.equipDialog && this.equipDialog.isOpen)) return this.close();
        const screen = Math.round(this.engine.width / this.engine.uiRoot.scale);
        const side = Math.max(8, Math.floor((screen - 560) / 2));
        if (side !== this._side) {
            this._side = side;
            this.list.setOffsets(side, 78, side, 56);
        }
        const width = Math.round(this.list.rect.width / this.list.uiRoot.scale);
        if (width !== this._width && width > 0) {
            this._width = width;
            for (const n of this.nodes.values()) {
                const p = this.nodePos(n.node, width);
                const size = n.node.type === "boss" ? MapScreen.NODE + 14 : MapScreen.NODE;
                n.rt.setAnchor(0, 0, 0, 0);
                n.rt.setPivot(0.5, 0.5);
                n.rt.setSizeAndPosition(size, size, p.x, p.y);
            }
            this.scroll.contentHeight = this.contentHeight;
            this.scrollToCurrent();
        }
        // 고를 수 있는 칸 깜빡이기
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 220);
        for (const n of this.nodes.values()) if (n.ring.isActive) n.ringRect.opacity = 0.5 + 0.5 * pulse;
    }
}

// 지도 칸 사이 선. 지나온 길은 밝게, 갈 수 있는 길은 금색, 나머지는 점선처럼 흐리게
class MapLines extends Renderer {
    constructor(screen) {
        super();
        this.screen = screen;
        this.sortingLayer = "UI";
    }

    getBounds() {
        return null;
    }

    render(ctx) {
        const s = this.screen;
        const rt = this.getComponent(RectTransform);
        const r = rt.rect;
        const scale = rt.uiRoot.scale;
        const width = s._width;
        if (!width) return;
        const run = s.run;
        const visited = new Set(run.visited);
        const choices = new Set(run.choices().map((n) => n.id));
        const alpha = rt.worldAlpha;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.lineCap = "round";
        for (const node of run.map.nodes.values()) {
            const a = s.nodePos(node, width);
            for (const id of node.next) {
                const next = run.map.get(id);
                const b = s.nodePos(next, width);
                const walked = visited.has(node.id) && (visited.has(id) || id === run.pending);
                const open = node.id === run.current && choices.has(id);
                ctx.strokeStyle = walked ? "#e8d9b8" : open ? "#e8b840" : "rgba(168, 152, 120, 0.35)";
                ctx.lineWidth = (walked || open ? 3 : 2) * scale;
                ctx.setLineDash(walked || open ? [] : [4 * scale, 4 * scale]);
                ctx.beginPath();
                ctx.moveTo(r.x + a.x * scale, r.y + a.y * scale);
                ctx.lineTo(r.x + b.x * scale, r.y + b.y * scale);
                ctx.stroke();
            }
        }
        ctx.restore();
    }
}

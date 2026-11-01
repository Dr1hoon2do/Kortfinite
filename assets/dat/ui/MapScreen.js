// 지도 화면: 이 층의 방 지도 (아이작식 격자). 가 본 방과 그 옆 방만 보인다. 화면을 가득 덮는다.
//   고르기 모드 (방을 나왔을 때): 보이는 방(지금 방 빼고)이 금색으로 깜빡이고, 누르면 그 방으로 들어간다.
//     우두머리를 쓰러뜨렸으면 아래 버튼이 [다음 층으로]가 된다 (남은 방을 더 둘러봐도 된다).
//   보기 모드 (방 안에서 지도 버튼·M): 지도를 본다. [닫기]
// 칸 그림은 map_icons.png (전투·정예·상점·휴식·보물·우두머리·시작), 칸 사이 선은 MapLines가 그린다.
class MapScreen extends Component {
    static SPACING = 56;
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
        this.built = null;      // 칸을 만들어 둔 RunMap (층이 바뀌면 다시)
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
            UIKit.place(icon, i * 52, 0, 16, 16);
            icon.addComponent(new UIImage(Resource.image("map_icons"), { region: { x: info.icon * 16, y: 0, width: 16, height: 16 } }));
            UIKit.label(this.legend, "name", info.name, i * 52 + 18, 1, 34, 16, { fontSize: 9, color: info.color });
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

        this.buildNodes();

        // 아래 버튼
        this.deckButton = UIKit.button(rrt, "deck", "덱 보기", () => this.deckView && this.deckView.open(), { fontSize: 12 });
        this.deckButton.rt.setAnchor(0, 1, 1 / 3, 1);
        this.deckButton.rt.setOffsets(12, -46, 3, 10);
        // 지도 화면은 아래 패를 가려서, 장비는 여기서 입고 벗는다
        this.equipButton = UIKit.button(rrt, "equip", "장비", () => this.equipDialog && this.equipDialog.open(), { fontSize: 12 });
        this.equipButton.rt.setAnchor(1 / 3, 1, 2 / 3, 1);
        this.equipButton.rt.setOffsets(3, -46, 3, 10);
        this.closeButton = UIKit.button(rrt, "close", "닫기", () => this.onThird(), { fontSize: 12 });
        this.closeButton.rt.setAnchor(2 / 3, 1, 1, 1);
        this.closeButton.rt.setOffsets(3, -46, 12, 10);

        this.root.setActive(false);
    }

    // 이 층 지도의 칸들을 만든다 (층이 바뀌면 다시)
    buildNodes() {
        for (const n of this.nodes.values()) n.go.destroy();
        this.nodes.clear();
        const map = this.run.map;
        this.built = map;
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
            go.setActive(false);
            this.nodes.set(node.id, { go, rt, ring, ringRect, back, node });
        }
        this._width = null;
    }

    // 아래 셋째 버튼: 고르는 중에는 [다음 층으로] (내려갈 수 있을 때), 보기 모드에서는 [닫기]
    onThird() {
        if (this.mode === "choose") {
            if (this.run.canDescend) this.run.descend();
            return;
        }
        this.close();
    }

    // choose: 고르기 모드 (방을 나와서), 아니면 보기 모드
    open(choose) {
        this.mode = choose ? "choose" : "view";
        if (this.built !== this.run.map) this.buildNodes();
        if (!this.root.isActive) Modal.show(this.root, true);
        this._width = null;
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
            MessageLog.add("거기로는 갈 수 없다 (지도에 보이는 방만)", "#c8b890");
            return;
        }
        this.run.enter(node.id);
    }

    // 칸 자리 (content 왼쪽 위 기준, UI 단위). 격자 가운데가 가로 가운데
    nodePos(node, width) {
        const b = this.run.map.bounds();
        const sp = MapScreen.SPACING;
        const span = (b.maxY - b.minY) * sp;
        const view = this.list && this.list.rect ? this.list.rect.height / this.list.uiRoot.scale : 0;
        const top = Math.max(34, (view - span) / 2); // 화면이 남으면 가운데로
        return { x: width / 2 + (node.x - (b.minX + b.maxX) / 2) * sp, y: top + (node.y - b.minY) * sp };
    }

    get contentHeight() {
        const b = this.run.map.bounds();
        return 34 * 2 + (b.maxY - b.minY) * MapScreen.SPACING;
    }

    scrollToCurrent() {
        const run = this.run;
        const node = run.map.get(run.pending ?? run.current ?? run.map.start.id);
        const y = this.nodePos(node, this._width || 300).y;
        const view = this.scroll.viewportHeight || 400;
        this.scroll.contentHeight = this.contentHeight;
        this.scroll.scrollTo(y - view * 0.5);
    }

    refresh() {
        const run = this.run;
        const choices = new Set(run.choices().map((n) => n.id));
        const visited = new Set(run.visited);
        const shown = run.map.revealed(run.visited);
        if (run.pending) shown.add(run.pending);
        this.title.setText(this.mode === "choose" ? `다음 방을 고른다 · ${run.floorNo}층` : `${run.floorNo}층 지도`);
        this.sub.setText(`체력 ${run.player.stats.hp}/${run.player.stats.maxHp} · ${run.player.money} G · 덱 ${run.player.cards.allActions.length}장 · ${run.bossCleared ? "우두머리를 쓰러뜨렸다" : "우두머리 방을 찾아라"}`);
        for (const [id, n] of this.nodes) {
            n.go.setActive(shown.has(id));
            const on = this.mode === "choose" && choices.has(id);
            const here = id === run.pending || (!run.pending && this.mode === "choose" && id === run.current);
            n.ring.setActive(on || here);
            n.ringRect.borderColor = here ? "#7cc4e8" : UIKit.COLORS.gold;
            const done = visited.has(id);
            n.back.color = done ? "#4a3e32" : "#2a231e";
            n.go.getComponent(RectTransform).alpha = on || done || here ? 1 : 0.7;
        }
        // 셋째 버튼
        const choose = this.mode === "choose";
        this.closeButton.text.setText(choose ? (run.canDescend ? "다음 층으로 ▼" : run.bossCleared ? "마지막 층" : "고르는 중") : "닫기");
        UIKit.setEnabled(this.closeButton, !choose || run.canDescend);
        this.closeButton.rect.borderColor = choose && run.canDescend ? UIKit.COLORS.gold : UIKit.COLORS.border;
    }

    update() {
        if (Input.getButtonDown("map")) this.toggleView();
        if (!this.mode) return;
        if (this.built !== this.run.map) {
            this.buildNodes();
            this.refresh();
        }
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
                const size = n.node.type === "boss" ? MapScreen.NODE + 6 : MapScreen.NODE;
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

// 지도 칸 사이 선 (문). 가 본 방끼리는 밝게, 아직 안 가 본 쪽은 점선으로 흐리게
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
        const shown = run.map.revealed(run.visited);
        if (run.pending) shown.add(run.pending);
        const alpha = rt.worldAlpha;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.lineCap = "round";
        for (const node of run.map.nodes.values()) {
            if (!shown.has(node.id)) continue;
            const a = s.nodePos(node, width);
            for (const id of node.next) {
                if (id < node.id || !shown.has(id)) continue; // 한 번씩만
                const b = s.nodePos(run.map.get(id), width);
                const walked = visited.has(node.id) && visited.has(id);
                ctx.strokeStyle = walked ? "#e8d9b8" : "rgba(168, 152, 120, 0.55)";
                ctx.lineWidth = (walked ? 3 : 2) * scale;
                ctx.setLineDash(walked ? [] : [4 * scale, 4 * scale]);
                ctx.beginPath();
                ctx.moveTo(r.x + a.x * scale, r.y + a.y * scale);
                ctx.lineTo(r.x + b.x * scale, r.y + b.y * scale);
                ctx.stroke();
            }
        }
        ctx.restore();
    }
}

// 오른쪽 위 토글 버튼 + 화면 오른쪽 패널(제목 줄 + 본문). 인벤토리, 상태창 같은 패널의 공통 틀.
// 같은 자리를 쓰므로 한 번에 하나만 열린다. 상속해서 build(body)로 본문을 만들고 refresh()로 매 프레임 갱신한다.
// UI 루트 오브젝트를 만들어야 해서 엔진을 받는다. 이 컴포넌트는 일반 GameObject에 붙인다.
class SidePanel extends Component {
    static current = null;
    static BUTTON = 48;
    static TOP = 72;
    static SLOTS = 4;   // 오른쪽 위 버튼 수 (상태 · 지도 · 덱 · 메뉴)

    // 좁은 화면(세로 폰)이면 버튼 5개가 체력바와 겹친다: 다섯 번째(slot 4)는 둘째 줄로 내리고 패널은 그만큼 아래에서 시작
    static twoRows(engine) {
        const w = engine.width / engine.uiRoot.scale;
        return w < 16 + SidePanel.SLOTS * (SidePanel.BUTTON + 8) + 110 + 24;
    }

    static top(engine) {
        return SidePanel.twoRows(engine) ? SidePanel.TOP + SidePanel.BUTTON + 8 : SidePanel.TOP;
    }

    // 버튼 자리 (오른쪽 위 기준 중심). slot 4는 좁은 화면에서 둘째 줄 맨 오른쪽
    static buttonPos(engine, slot) {
        const size = SidePanel.BUTTON;
        const two = slot >= 4 && SidePanel.twoRows(engine);
        const col = two ? slot - 4 : slot;
        const row = two ? 1 : 0;
        return { x: -16 - size / 2 - col * (size + 8), y: 16 + size / 2 + row * (size + 8) };
    }

    // options: { engine, action, keys, icon(버튼 시트 칸), slot(오른쪽부터 0,1,..), title, width, open }
    constructor(options) {
        super();
        this.engine = options.engine;
        this.action = options.action;
        this.keys = options.keys ?? [];
        this.icon = options.icon;
        this.slot = options.slot ?? 0;
        this.title = options.title ?? "";
        this.panelWidth = options.width ?? 200;
        this.margin = options.margin ?? 8;
        this.startOpen = options.open ?? false;
        this.open = false;
    }

    start() {
        Input.defineButton(this.action, this.keys);

        const size = SidePanel.BUTTON;
        const toggle = this.engine.createUI(this.action + "Toggle");
        const trt = toggle.getComponent(RectTransform);
        trt.setAnchor(1, 0, 1, 0);
        this.toggleRT = trt;
        toggle.addComponent(new UIImage(Resource.image("buttons"), { region: { x: this.icon * 16, y: 0, width: 16, height: 16 } }));
        toggle.addComponent(new UIButton({ action: this.action, pressedRegion: { x: this.icon * 16, y: 16, width: 16, height: 16 } }));

        this.panel = this.engine.createUI(this.action + "Panel");
        const prt = this.panel.getComponent(RectTransform);
        prt.sortOrder = UILayer.PANEL;
        prt.setAnchor(1, 0, 1, 1);
        this.placeFrame();
        this.panel.addComponent(new UIRect({ color: "rgba(18, 13, 10, 0.82)", borderColor: "#5a4a3a", borderWidth: 1 }));
        this.panel.addComponent(new UIElement()); // 패널 위 탭이 뒤의 월드로 새지 않게 막는다

        const header = prt.createChild("header");
        const hrt = header.getComponent(RectTransform);
        hrt.setAnchor(0, 0, 1, 0);
        hrt.setOffsets(12, 0, 12, -28);
        this.header = header.addComponent(new UIText(this.title, { fontSize: 12, color: "#e8d9b8", align: "left" }));

        const body = prt.createChild("body");
        const brt = body.getComponent(RectTransform);
        brt.setAnchor(0, 0, 1, 1);
        brt.setOffsets(0, 28, 0, 1);
        this.body = brt;
        this.build(brt);

        this.setOpen(this.startOpen);
    }

    // 상속해서 본문을 만든다
    build(body) {}

    // 상속해서 열려 있는 동안 매 프레임 갱신한다
    refresh() {}

    setTitle(text) {
        this.header.setText(text);
    }

    setOpen(value) {
        if (value && SidePanel.current && SidePanel.current !== this) SidePanel.current.setOpen(false);
        const was = this.open;
        this.open = value;
        this.panel.setActive(value);
        if (value && !was) UIKit.fadeIn(this.panel);
        if (value) SidePanel.current = this;
        else if (SidePanel.current === this) SidePanel.current = null;
    }

    // 화면 폭이 바뀌면 버튼·패널 자리를 다시 (좁은 화면은 버튼 두 줄)
    placeFrame() {
        const two = SidePanel.twoRows(this.engine);
        if (two === this._two) return;
        this._two = two;
        const p = SidePanel.buttonPos(this.engine, this.slot);
        this.toggleRT.setSizeAndPosition(SidePanel.BUTTON, SidePanel.BUTTON, p.x, p.y);
        this.panel.getComponent(RectTransform).setOffsets(-this.panelWidth - this.margin, SidePanel.top(this.engine), this.margin, this.margin);
    }

    update() {
        this.placeFrame();
        if (Input.getButtonDown(this.action)) this.setOpen(!this.open);
        if (this.open) this.refresh();
    }
}

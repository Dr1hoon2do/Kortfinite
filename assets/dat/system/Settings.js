// 게임 설정. 세계와 상관없이 이 브라우저에 한 벌 저장된다 (localStorage "kortfinite.settings").
// 값 읽기: Settings.get("animSpeed"). 바뀔 때 할 일: Settings.on("key", (value) => ...)
// 새 설정은 DEFS에 한 줄 추가하면 설정 창에 저절로 나온다:
//   { key, label, section, type: "choice", options: [[값, "보이는 글자"], ...], default }
//   { key, label, section, type: "toggle", default }
class Settings {
    static KEY = "kortfinite.settings";
    static VERSION = 2; // 2: 디버그 표시 불투명도 기본값 0%로 (예전 저장값은 버린다)

    static DEFS = [
        { key: "animSpeed", section: "애니메이션", label: "애니메이션 속도", type: "choice", default: 1.5,
            options: [[0.75, "느리게"], [1, "보통"], [1.5, "빠르게"], [2, "아주 빠르게"], [4, "거의 즉시"]] },
        { key: "together", section: "애니메이션", label: "내 이동과 주변 행동을 함께", type: "toggle", default: true },
        { key: "damageNumbers", section: "애니메이션", label: "피해·회복 숫자", type: "toggle", default: true },
        { key: "shake", section: "애니메이션", label: "화면 흔들림", type: "toggle", default: true },

        { key: "logLines", section: "화면", label: "메시지 줄 수", type: "choice", default: 4,
            options: [[2, "2줄"], [4, "4줄"], [6, "6줄"]] },
        { key: "cardInfo", section: "화면", label: "카드 정보 창 (크게 보기·용어 풀이)", type: "toggle", default: true },

        { key: "debugAlpha", section: "디버그", label: "디버그 표시 불투명도 (F3)", type: "choice", default: 0,
            options: [[1, "100%"], [0.75, "75%"], [0.5, "50%"], [0.25, "25%"], [0, "0% (숨김)"]] }
    ];

    static values = null;
    static listeners = new Map();

    static def(key) {
        return Settings.DEFS.find((d) => d.key === key);
    }

    static load() {
        Settings.values = {};
        for (const d of Settings.DEFS) Settings.values[d.key] = d.default;
        try {
            const saved = JSON.parse(localStorage.getItem(Settings.KEY) ?? "{}");
            if ((saved._v ?? 1) < 2) delete saved.debugAlpha;
            for (const [k, v] of Object.entries(saved)) if (Settings.def(k)) Settings.values[k] = v;
        } catch (e) {
            // 저장소를 못 쓰면 기본값으로
        }
    }

    static get(key) {
        if (!Settings.values) Settings.load();
        return Settings.values[key];
    }

    static set(key, value) {
        if (!Settings.values) Settings.load();
        Settings.values[key] = value;
        try {
            localStorage.setItem(Settings.KEY, JSON.stringify({ ...Settings.values, _v: Settings.VERSION }));
        } catch (e) {
            // 이번 실행 동안만 유지
        }
        for (const fn of Settings.listeners.get(key) ?? []) fn(value);
    }

    // 바뀔 때 부를 함수 등록. 등록할 때 지금 값으로 한 번 부른다
    static on(key, fn) {
        if (!Settings.listeners.has(key)) Settings.listeners.set(key, []);
        Settings.listeners.get(key).push(fn);
        fn(Settings.get(key));
    }

    // 선택지 한 칸 옮기기 (dir: -1 / +1)
    static step(key, dir) {
        const d = Settings.def(key);
        const i = d.options.findIndex(([v]) => v === Settings.get(key));
        const next = Math.min(Math.max((i < 0 ? 0 : i) + dir, 0), d.options.length - 1);
        Settings.set(key, d.options[next][0]);
    }

    static text(key) {
        const d = Settings.def(key);
        const v = Settings.get(key);
        if (d.type === "toggle") return v ? "켜짐" : "꺼짐";
        const opt = d.options.find(([value]) => value === v);
        return opt ? opt[1] : String(v);
    }
}

// 설정 창: 오른쪽 위 메뉴 버튼(키 Esc가 아닌 O)으로 연다. 항목은 Settings.DEFS에서 만든다.
// 아래에 조작법 안내와 [처음 화면으로] [닫기]. (저장은 방 사이에서 저절로 된다)
class SettingsPanel extends Component {
    static ROW = 34;
    static ICON = 11;

    // options: { engine, slot, onExit, seed }
    constructor(options) {
        super();
        this.engine = options.engine;
        this.slot = options.slot ?? 3;
        this.onExit = options.onExit ?? null;
        this.seed = options.seed ?? null;
        this.rows = [];
    }

    get isOpen() {
        return this.root.isActive;
    }

    start() {
        Input.defineButton("settings", ["KeyO"]);

        // 오른쪽 위 메뉴 버튼
        const size = SidePanel.BUTTON;
        const toggle = this.engine.createUI("settingsToggle");
        const trt = toggle.getComponent(RectTransform);
        trt.setAnchor(1, 0, 1, 0);
        trt.setSizeAndPosition(size, size, -16 - size / 2 - this.slot * (size + 8), 16 + size / 2);
        const icon = SettingsPanel.ICON;
        toggle.addComponent(new UIImage(Resource.image("buttons"), { region: { x: icon * 16, y: 0, width: 16, height: 16 } }));
        toggle.addComponent(new UIButton({ onTap: () => this.toggle(), pressedRegion: { x: icon * 16, y: 16, width: 16, height: 16 } }));

        const { root, box } = Modal.create(this.engine, "settings", 340, 560, () => this.close());
        this.root = root;
        this.box = box;
        UIKit.label(box, "title", "설정", 14, 10, null, 18, { fontSize: 14, fontWeight: "bold", color: UIKit.COLORS.gold });
        if (this.seed !== null) UIKit.label(box, "seed", `런 시드 ${this.seed} · 방 사이에서 저절로 저장된다`, 14, 30, null, 14, { fontSize: 10, color: UIKit.COLORS.dim });

        // 항목 목록 (스크롤)
        const list = box.createChild("list");
        this.list = list.getComponent(RectTransform);
        this.list.setAnchor(0, 0, 1, 1);
        this.list.setOffsets(8, 50, 8, 100);
        list.addComponent(new UIRect({ color: "rgba(0, 0, 0, 0.25)" }));
        list.addComponent(new UIMask());
        const content = this.list.createChild("content").getComponent(RectTransform);
        const bar = this.list.createChild("scrollbar");
        bar.addComponent(new UIRect({ color: "rgba(232, 217, 184, 0.45)" }));
        this.scroll = list.addComponent(new UIScrollView({ content, bar: bar.getComponent(RectTransform) }));

        let y = 6;
        let section = null;
        for (const d of Settings.DEFS) {
            if (d.section !== section) {
                section = d.section;
                UIKit.label(content, "section", section, 8, y + 6, null, 16, { fontSize: 11, fontWeight: "bold", color: UIKit.COLORS.gold });
                y += 26;
            }
            this.rows.push(this.buildRow(content, d, y));
            y += SettingsPanel.ROW;
        }
        UIKit.label(content, "section", "조작법", 8, y + 6, null, 16, { fontSize: 11, fontWeight: "bold", color: UIKit.COLORS.gold });
        y += 26;
        const help = [
            "카드: 아래 패에서 누르기 / 숫자 1~9 → 칸 고르기",
            "드로우 Space (1턴) · 대기 Z (1턴) · 말 걸기·열기 E",
            "적이 없는 방: 땅을 탭하면 걸어간다",
            "지도 M · 덱 D · 상태 C · 설정 O · 화면 맞춤 F",
            "줌: 휠, + / -, 두 손가락 · 취소: Esc"
        ];
        for (const line of help) {
            UIKit.label(content, "help", line, 10, y, null, 14, { fontSize: 10, color: "#c8b890" });
            y += 17;
        }
        this.scroll.contentHeight = y + 10;

        // 아래 버튼
        const actions = box.createChild("actions");
        const art = actions.getComponent(RectTransform);
        art.setAnchor(0, 1, 1, 1);
        art.setOffsets(8, -92, 8, 10);
        const exit = UIKit.button(art, "exit", "처음 화면으로 (방 안이면 그 방부터 다시)", () => this.onExit && this.onExit(), { fontSize: 12 });
        exit.rt.setAnchor(0, 0, 1, 0.5);
        exit.rt.setOffsets(0, 0, 0, 3);
        const close = UIKit.button(art, "close", "닫기", () => this.close(), { fontSize: 13 });
        close.rt.setAnchor(0, 0.5, 1, 1);
        close.rt.setOffsets(0, 3, 0, 0);
    }

    // 한 줄: 이름 + (선택지면 [<] 값 [>], 켜기/끄기면 버튼 하나)
    buildRow(parentRT, d, y) {
        const go = parentRT.createChild("setting " + d.key);
        const rt = UIKit.place(go, 6, y, null, SettingsPanel.ROW - 4);
        go.addComponent(new UIRect({ color: "rgba(42, 35, 30, 0.95)", borderColor: UIKit.COLORS.border, borderWidth: 1 }));
        UIKit.label(rt, "name", d.label, 8, 0, null, SettingsPanel.ROW - 4, { fontSize: 11, verticalAlign: "middle" });
        const row = { def: d };
        if (d.type === "toggle") {
            row.value = UIKit.button(rt, "toggle", "", () => Settings.set(d.key, !Settings.get(d.key)), { fontSize: 11 });
            row.value.rt.setAnchor(1, 0, 1, 1);
            row.value.rt.setOffsets(-70, 4, 6, 4);
        } else {
            const prev = UIKit.button(rt, "prev", "<", () => Settings.step(d.key, -1), { fontSize: 12 });
            prev.rt.setAnchor(1, 0, 1, 1);
            prev.rt.setOffsets(-122, 4, 98, 4);
            const next = UIKit.button(rt, "next", ">", () => Settings.step(d.key, 1), { fontSize: 12 });
            next.rt.setAnchor(1, 0, 1, 1);
            next.rt.setOffsets(-30, 4, 6, 4);
            const value = rt.createChild("value");
            const vrt = value.getComponent(RectTransform);
            vrt.setAnchor(1, 0, 1, 1);
            vrt.setOffsets(-98, 0, 30, 0);
            row.text = value.addComponent(new UIText("", { fontSize: 11, color: "#ffffff" }));
        }
        return row;
    }

    toggle() {
        if (this.isOpen) this.close();
        else this.open();
    }

    open() {
        if (this.isOpen) return;
        Modal.fit(this.engine, this.box, 340, 560);
        Modal.show(this.root, true);
    }

    close() {
        Modal.show(this.root, false);
    }

    update() {
        if (Input.getButtonDown("settings")) this.toggle();
        if (!this.isOpen) return;
        if (Input.getButtonDown("cancel")) return this.close();
        for (const row of this.rows) {
            const text = Settings.text(row.def.key);
            if (row.text) row.text.setText(text);
            else {
                row.value.text.setText(text);
                const on = Settings.get(row.def.key);
                row.value.rect.color = on ? UIKit.COLORS.buttonOn : UIKit.COLORS.buttonOff;
                row.value.rect.borderColor = on ? UIKit.COLORS.gold : UIKit.COLORS.border;
            }
        }
    }
}

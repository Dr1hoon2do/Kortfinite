// 글자 입력칸. 엔진 UI에는 글자 입력이 없어서, 이 UI 사각형 위에 HTML <input>을 겹쳐 띄운다.
// (모바일 키보드, 한글 입력을 브라우저가 처리한다.) 오브젝트가 꺼지면 숨고, 파괴되면 지워진다.
class TextField extends Component {
    // options: { engine, placeholder, maxLength, value }
    constructor(options) {
        super();
        this.engine = options.engine;
        this.placeholder = options.placeholder ?? "";
        this.maxLength = options.maxLength ?? 24;
        this.initial = options.value ?? "";
        this.el = null;
    }

    awake() {
        const el = document.createElement("input");
        el.type = "text";
        el.placeholder = this.placeholder;
        el.maxLength = this.maxLength;
        el.value = this.initial;
        el.autocomplete = "off";
        el.spellcheck = false;
        Object.assign(el.style, {
            position: "fixed", boxSizing: "border-box", margin: "0", padding: "0 8px",
            border: "1px solid #5a4a3a", borderRadius: "0", outline: "none",
            background: "#2a231e", color: "#e8d9b8", font: "13px monospace",
            display: "none", zIndex: "10", userSelect: "text", webkitUserSelect: "text"
        });
        el.addEventListener("focus", () => (el.style.borderColor = "#e8b840"));
        el.addEventListener("blur", () => (el.style.borderColor = "#5a4a3a"));
        document.body.appendChild(el);
        this.el = el;
    }

    get value() {
        return this.el ? this.el.value : "";
    }

    set value(v) {
        if (this.el) this.el.value = v;
    }

    onEnable() {
        if (this.el) this.el.style.display = "block";
    }

    onDisable() {
        if (this.el) {
            this.el.blur();
            this.el.style.display = "none";
        }
    }

    onDestroy() {
        if (this.el) this.el.remove();
        this.el = null;
    }

    // 캔버스 픽셀 사각형 → 페이지 CSS 좌표
    lateUpdate() {
        const r = this.getComponent(RectTransform).rect;
        const canvas = this.engine.canvas;
        const box = canvas.getBoundingClientRect();
        const k = box.width / canvas.width;
        Object.assign(this.el.style, {
            left: box.left + r.x * k + "px",
            top: box.top + r.y * k + "px",
            width: r.width * k + "px",
            height: r.height * k + "px"
        });
    }
}

// 시작 화면: [이어하기] (저장된 런이 있으면) · [새 런] (시드, 디버그 명령) · [도감] (카드·몬스터). 런 설명 몇 줄.
// 고르면 자기 UI를 지우고 onPlay({ seed, debug, save })를 부른다.
class TitleScreen extends Component {
    // options: { engine, onPlay({ seed, debug, save }) }
    constructor(options) {
        super();
        this.engine = options.engine;
        this.onPlay = options.onPlay;
        this.objects = [];
    }

    start() {
        this.saved = RunStore.load();
        const bg = this.ui("titleBackground");
        const bgrt = bg.getComponent(RectTransform);
        bgrt.setAnchor(0, 0, 1, 1);
        bgrt.setOffsets(0, 0, 0, 0);
        bg.addComponent(new UIRect({ color: "#16110d" }));
        bg.addComponent(new UIElement());

        const title = bgrt.createChild("title");
        const trt = title.getComponent(RectTransform);
        trt.setAnchor(0, 0, 1, 0);
        trt.setOffsets(0, 40, 0, -80);
        title.addComponent(new UIText("Kortfinite", { fontSize: 30, fontWeight: "bold", color: UIKit.COLORS.gold }));
        const sub = bgrt.createChild("subtitle");
        const srt = sub.getComponent(RectTransform);
        srt.setAnchor(0, 0, 1, 0);
        srt.setOffsets(0, 80, 0, -100);
        sub.addComponent(new UIText("카드로 싸우며 15층을 내려가 우두머리를 쓰러뜨려라", { fontSize: 12, color: UIKit.COLORS.dim }));

        this.box = bgrt.createChild("menu");
        const box = this.box.getComponent(RectTransform);
        box.setAnchor(0.5, 0, 0.5, 0);
        this.continueButton = UIKit.button(box, "continue", "", () => this.resume(), { fontSize: 14 });
        UIKit.place(this.continueButton.go, 0, 0, null, 44);
        this.newButton = UIKit.button(box, "new", "새 런", () => this.showCreate(), { fontSize: 14 });
        UIKit.place(this.newButton.go, 0, 52, null, 44);
        this.codexButton = UIKit.button(box, "codex", "도감 (카드 · 몬스터)", () => this.codex.open(), { fontSize: 13 });
        UIKit.place(this.codexButton.go, 0, 104, null, 38);
        this.inspector = this.gameObject.addComponent(new CardInspector({ engine: this.engine }));
        this.codex = this.gameObject.addComponent(new Codex({ engine: this.engine }));
        this.help = UIKit.label(box, "help", [
            "· 지도에서 다음 방(전투·정예·상점·휴식·보물)을 골라 내려간다",
            "· 방은 입구 → 공간 → 출구. 적을 모두 쓰러뜨리면 출구가 열린다",
            "· 모든 행동은 카드로 한다. 카드 쓰기는 턴이 안 들고 기력을 쓴다",
            "· [드로우]·[대기]만 턴이 지나고, 그때 적이 움직인다",
            "· 이기면 카드 3장 중 하나를 덱에 넣는다. 쓰러지면 런이 끝난다"
        ].join("\n"), 0, 156, null, 110, { fontSize: 11, color: "#c8b890", wrap: true, lineHeight: 1.5 });
        if (this.saved) {
            this.continueButton.text.setText(`이어하기 (${this.savedFloor()}층 · ${this.saved.player.hp} 체력 · ${this.saved.player.money} G)`);
        } else {
            this.continueButton.go.setActive(false);
            UIKit.place(this.newButton.go, 0, 0, null, 44);
            UIKit.place(this.codexButton.go, 0, 52, null, 38);
            UIKit.place(this.help.gameObject, 0, 104, null, 110);
        }

        this.storageNote = UIKit.label(bgrt, "note", "", 0, 0, null, 14, { fontSize: 10, color: UIKit.COLORS.faint, align: "center" });
        this.buildCreateDialog();
    }

    savedFloor() {
        const s = this.saved;
        if (s.pending) return Number(s.pending.split(",")[0]) + 1; // 들어갔다가 못 끝낸 방
        return s.current ? Number(s.current.split(",")[0]) + 2 : 1; // 다음에 고를 층
    }

    ui(name) {
        const go = this.engine.createUI(name);
        this.objects.push(go);
        return go;
    }

    buildCreateDialog() {
        const { root, box } = Modal.create(this.engine, "newRun", 320, 236, () => Modal.show(this.createDialog, false));
        this.objects.push(root);
        this.createDialog = root;
        UIKit.label(box, "title", "새 런", 14, 12, null, 18, { fontSize: 14, fontWeight: "bold", color: UIKit.COLORS.gold });
        this.warn = UIKit.label(box, "warn", "", 14, 32, null, 14, { fontSize: 10, color: "#f0a070" });
        UIKit.label(box, "seedLabel", "시드 (비우면 무작위, 숫자나 글자)", 14, 52, null, 14, { fontSize: 11, color: "#c8b890" });
        const seed = box.createChild("seed");
        UIKit.place(seed, 14, 68, null, 32);
        this.seedField = seed.addComponent(new TextField({ engine: this.engine, placeholder: "무작위", maxLength: 24 }));
        UIKit.label(box, "debugLabel", "디버그 명령 (/give, /summon, /floor …)", 14, 112, null, 14, { fontSize: 11, color: "#c8b890" });
        this.debugOn = false;
        this.debugButton = UIKit.button(box, "debug", "끔", () => this.setDebug(!this.debugOn), { fontSize: 12 });
        UIKit.place(this.debugButton.go, 14, 128, 80, 28);

        const ok = UIKit.button(box, "ok", "시작", () => this.create(), { fontSize: 13 });
        ok.rt.setAnchor(0, 1, 0.5, 1);
        ok.rt.setOffsets(14, -50, 3, 14);
        const cancel = UIKit.button(box, "cancel", "취소", () => Modal.show(this.createDialog, false), { fontSize: 13 });
        cancel.rt.setAnchor(0.5, 1, 1, 1);
        cancel.rt.setOffsets(3, -50, 14, 14);
    }

    setDebug(on) {
        this.debugOn = on;
        this.debugButton.text.setText(on ? "켬" : "끔");
        this.debugButton.rect.color = on ? UIKit.COLORS.buttonOn : UIKit.COLORS.buttonOff;
    }

    showCreate() {
        this.seedField.value = "";
        this.setDebug(false);
        this.warn.setText(this.saved ? "이어 하던 런은 지워진다" : "");
        Modal.show(this.createDialog, true);
    }

    create() {
        const seed = RunStore.seedFrom(this.seedField.value);
        RunStore.clear();
        this.finish({ seed, debug: this.debugOn, save: null });
    }

    resume() {
        if (!this.saved) return;
        this.finish({ seed: this.saved.seed, debug: !!this.saved.debug, save: this.saved });
    }

    finish(meta) {
        for (const go of this.objects) go.destroy();
        if (this.codex.root) this.codex.root.destroy();
        if (this.inspector.root) this.inspector.root.destroy();
        Modal.openCount = 0;
        this.gameObject.destroy();
        this.onPlay(meta);
    }

    // 화면 크기에 맞춰 배치
    update() {
        const scale = this.engine.uiRoot.scale;
        const w = Math.min(360, this.engine.width / scale - 24);
        const h = this.engine.height / scale;
        if (w === this._w && h === this._h) return;
        this._w = w;
        this._h = h;
        const box = this.box.getComponent(RectTransform);
        box.setOffsets(-w / 2, 124, -w / 2, -(124 + 280));
        this.storageNote.getComponent(RectTransform).setOffsets(0, h - 20, 0, -(h - 6));
        this.storageNote.setText(RunStore.persistent ? "저장은 이 브라우저에 남는다 (방 사이에서 저장)" : "이 브라우저에선 저장이 유지되지 않는다");
    }
}

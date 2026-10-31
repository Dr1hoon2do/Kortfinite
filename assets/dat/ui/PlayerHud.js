// 왼쪽 위: 돈·층 + 최근 메시지. 화면 아래(드로우/대기 버튼 위): 체력·기력·마나 막대를 가로로, 그 위에 상태이상 아이콘 줄.
// 상태이상 아이콘(방어도 포함)을 누르면 목록 창. 많으면 +N으로 묶는다. (쓰러지면 EndScreen이 뜬다)
class PlayerHud extends Component {
    static LOG_MAX_WIDTH = 360; // 메시지 칸 최대 너비 (UI 단위). 화면이 좁으면 화면 폭 - 32
    static LOG_WRAP = 4;        // 메시지 하나가 차지할 수 있는 최대 줄 수
    static LOG_FONT = 11;
    static CHIPS = 16;   // 상태이상 아이콘 칸 수 (넘치면 마지막 칸이 +N)
    static CHIP_W = 28;
    static BAR_BOTTOM = 174; // 막대 줄의 아래 끝 (화면 아래에서, UI 단위): 패 120 + 버튼 줄 50 + 틈 4
    static BAR_H = 18;
    static LOG_Y = 40;      // 메시지 칸 위쪽 (돈·층 줄 아래)

    // 글자를 너비에 맞춰 줄로 나눈다 (단어 단위, 너무 긴 단어는 글자 단위).
    // 실제로 그려지는 크기(UI 배율)로 재야 한글 폭이 맞는다. 넘치는 글은 마지막 줄 끝을 …로
    static wrap(text, width, scale = 1) {
        if (!PlayerHud._measure) PlayerHud._measure = document.createElement("canvas").getContext("2d");
        const g = PlayerHud._measure;
        const family = typeof Config !== "undefined" && Config.fontFamily ? Config.fontFamily : "monospace";
        g.font = `normal ${PlayerHud.LOG_FONT * scale}px ${family}`;
        width *= scale;
        const lines = [];
        let line = "";
        for (const word of text.split(" ")) {
            const test = line ? line + " " + word : word;
            if (g.measureText(test).width <= width) {
                line = test;
                continue;
            }
            if (line) lines.push(line);
            line = "";
            for (const ch of word) {
                if (line && g.measureText(line + ch).width > width) {
                    lines.push(line);
                    line = "";
                }
                line += ch;
            }
        }
        lines.push(line);
        if (lines.length > PlayerHud.LOG_WRAP) {
            lines.length = PlayerHud.LOG_WRAP;
            let last = lines[lines.length - 1];
            while (last && g.measureText(last + "…").width > width) last = last.slice(0, -1);
            lines[lines.length - 1] = last + "…";
        }
        return lines;
    }

    get logWidth() {
        const screen = this.engine.width / this.engine.uiRoot.scale;
        // 버튼이 두 줄인 좁은 화면은 둘째 줄 버튼(의뢰) 자리를 비운다
        const right = SidePanel.twoRows(this.engine) ? 16 + SidePanel.BUTTON + 8 : 16;
        const full = Math.max(160, Math.min(PlayerHud.LOG_MAX_WIDTH, Math.floor(screen - 16 - right)));
        // 넓은 화면: 방 왼쪽 빈 곳이 220 이상이면 그 폭만 써서 방을 가리지 않는다
        const run = this.run;
        if (run && run.state === "room" && run.plan && Camera.main) {
            const left = Camera.main.worldToScreen(new Vector(-8, 0)).x / this.engine.uiRoot.scale;
            const room = Math.floor(left - 16 - 10);
            if (room >= 220) return Math.min(full, room);
        }
        return full;
    }

    constructor(options) {
        super();
        this.engine = options.engine;
        this.player = options.player;
        this.world = options.world;
        this.run = options.run ?? null;
        this.maxWidth = options.width ?? 180;
        this.width = this.maxWidth;
        this._logVersion = -1;
        this._dead = false;
        this._statusKey = null;
        this.statusOpen = false;
    }

    start() {
        const w = this.width;

        // ---- 아래: 체력 · 기력 · 마나 막대 (드로우/대기 버튼 위, 가로로)
        this.hpBar = this.bottomBar("hpBar", 0, "#c43434");
        this.energyBar = this.bottomBar("energyBar", 1, "#c8a02c");
        this.manaBar = this.bottomBar("manaBar", 2, "#3c78d8");
        this.hpBack = this.hpBar.back;

        // ---- 그 위: 상태이상 아이콘 줄 (방에 겹쳐 뜨고, 없으면 숨는다)
        const row = this.engine.createUI("statusRow");
        const rrt = row.getComponent(RectTransform);
        rrt.sortOrder = UILayer.HAND;
        rrt.setAnchor(0, 1, 1, 1);
        const top = PlayerHud.BAR_BOTTOM + PlayerHud.BAR_H + 4;
        rrt.setOffsets(12, -(top + 20), 12, top);
        this.statusRT = rrt;
        this.statusGO = row;
        this.chips = [];
        for (let i = 0; i < PlayerHud.CHIPS; i++) {
            const chip = UIKit.button(rrt, "chip" + i, "", () => this.openStatus(), { fontSize: 10 });
            chip.rt.setAnchor(0, 0, 0, 0);
            chip.rt.setPivot(0, 0);
            chip.rt.setSizeAndPosition(PlayerHud.CHIP_W, 18, i * (PlayerHud.CHIP_W + 3), 1);
            chip.go.setActive(false);
            this.chips.push(chip);
        }
        row.setActive(false);
        this.buildStatusDialog();

        // ---- 왼쪽 위: 돈, 지금 층과 방 종류
        const money = this.engine.createUI("money");
        const mrt0 = money.getComponent(RectTransform);
        this.moneyRT = mrt0;
        mrt0.setPivot(0, 0);
        mrt0.setSizeAndPosition(76, 18, 16, 16);
        money.addComponent(new UIRect({ color: "rgba(18, 13, 10, 0.82)", borderColor: "#5a4a3a", borderWidth: 1 }));
        const coin = mrt0.createChild("coin");
        UIKit.place(coin, 2, 1, 16, 16);
        coin.addComponent(new UIImage(Resource.image("cards"), { region: { x: 17 * 16, y: 0, width: 16, height: 16 } }));
        this.moneyText = UIKit.label(mrt0, "value", "", 20, 0, null, 18, { fontSize: 11, color: "#f0d878", verticalAlign: "middle" });

        const where = this.engine.createUI("levelName");
        const wrt = where.getComponent(RectTransform);
        this.levelRT = wrt;
        wrt.setPivot(0, 0);
        wrt.setSizeAndPosition(130, 18, 16 + 76 + 6, 16);
        where.addComponent(new UIRect({ color: "rgba(18, 13, 10, 0.82)", borderColor: "#5a4a3a", borderWidth: 1 }));
        this.levelText = UIKit.label(wrt, "value", "", 0, 0, null, 18, { fontSize: 11, color: "#a0d0f0", align: "center", verticalAlign: "middle" });

        this.logBack = this.engine.createUI("logBack");
        this.logBack.addComponent(new UIRect({ color: "rgba(18, 13, 10, 0.55)" }));
        this.logBack.setActive(false);

        // 메시지 줄: 긴 메시지는 여러 줄로 나뉘므로 넉넉하게 만들어 둔다
        this.lines = [];
        for (let i = 0; i < MessageLog.max * PlayerHud.LOG_WRAP; i++) {
            const go = this.engine.createUI("log");
            const rt = go.getComponent(RectTransform);
            rt.setPivot(0, 0);
            rt.setSizeAndPosition(w, 15, 22, PlayerHud.LOG_Y + 4 + i * 15);
            this.lines.push(go.addComponent(new UIText("", { fontSize: 11, color: "#e8d9b8", align: "left", verticalAlign: "top" })));
        }
    }

    // 아래 막대 한 칸 (바탕 + 채움 + 글자). i번째 칸 (0..2)이 화면 폭을 3등분한다
    bottomBar(name, i, color) {
        const go = this.engine.createUI(name);
        const rt = go.getComponent(RectTransform);
        rt.sortOrder = UILayer.HAND;
        rt.setAnchor(i / 3, 1, (i + 1) / 3, 1);
        rt.setOffsets(i === 0 ? 12 : 3, -(PlayerHud.BAR_BOTTOM + PlayerHud.BAR_H), i === 2 ? 12 : 3, PlayerHud.BAR_BOTTOM);
        const back = go.addComponent(new UIRect({ color: "rgba(18, 13, 10, 0.88)", borderColor: "#5a4a3a", borderWidth: 1 }));
        const fill = rt.createChild("fill").addComponent(new UIRect({ color }));
        const label = rt.createChild("label");
        const lrt = label.getComponent(RectTransform);
        lrt.setAnchor(0, 0, 1, 1);
        lrt.setOffsets(4, 0, 4, 0);
        const text = label.addComponent(new UIText("", { fontSize: 10, color: "#ffffff", align: "left", verticalAlign: "middle" }));
        return { rt, fill, text, back };
    }

    // ---------- 상태이상 아이콘 · 목록 창 ----------
    buildStatusDialog() {
        const { root, box } = Modal.create(this.engine, "statusList", 300, 340, () => this.closeStatus());
        this.statusDlg = root;
        this.statusBox = box;
        UIKit.label(box, "title", "상태이상 · 방어도", 14, 10, null, 18, { fontSize: 14, fontWeight: "bold", color: UIKit.COLORS.gold });
        // 목록은 스크롤 (상태이상이 많을 수 있다)
        const list = box.createChild("list");
        const lrt = list.getComponent(RectTransform);
        lrt.setAnchor(0, 0, 1, 1);
        lrt.setOffsets(12, 36, 12, 52);
        list.addComponent(new UIRect({ color: "rgba(0, 0, 0, 0.25)" }));
        list.addComponent(new UIMask());
        this.statusContent = lrt.createChild("content").getComponent(RectTransform);
        const bar = lrt.createChild("scrollbar");
        bar.addComponent(new UIRect({ color: "rgba(232, 217, 184, 0.45)" }));
        this.statusScroll = list.addComponent(new UIScrollView({ content: this.statusContent, bar: bar.getComponent(RectTransform) }));
        this.statusRows = [];
        const close = UIKit.button(box, "close", "닫기", () => this.closeStatus(), { fontSize: 13 });
        close.rt.setAnchor(0, 1, 1, 1);
        close.rt.setOffsets(12, -44, 12, 10);
    }

    openStatus() {
        if (this.statusOpen) return;
        this.statusOpen = true;
        this._dlgKey = null;
        Modal.fit(this.engine, this.statusBox, 300, 340);
        Modal.show(this.statusDlg, true);
        this.statusScroll.scrollTo(0);
    }

    closeStatus() {
        if (!this.statusOpen) return;
        this.statusOpen = false;
        Modal.show(this.statusDlg, false);
    }

    // 아이콘 줄에 올릴 것들: 방어도(덩어리마다) → 버프 → 디버프
    statusEntries() {
        const p = this.player;
        const blocks = [...p.blocks].sort((a, b) => a.t - b.t).map((b) => ({ key: "block", name: "방어도", color: "#3c78b8", value: b.v, t: b.t, from: null, kind: "block" }));
        const list = Status.entries(p);
        return [...blocks, ...list.filter((e) => e.buff), ...list.filter((e) => !e.buff)];
    }

    // 아이콘 줄과 (열려 있으면) 목록 창을 지금 상태에 맞춘다
    updateStatus() {
        const entries = this.statusEntries();
        const key = entries.map((e) => `${e.key}${e.from ?? ""}:${e.value}:${e.t}`).join("|");
        this.statusGO.setActive(entries.length > 0);
        if (key !== this._statusKey || this._chipCap !== this.chipCap()) {
            this._statusKey = key;
            this._chipCap = this.chipCap();
            const cap = this._chipCap;
            const over = entries.length > cap;
            const shown = over ? cap - 1 : entries.length;
            this.chips.forEach((chip, i) => {
                chip.go.setActive(i < (over ? cap : entries.length));
                if (i >= (over ? cap : entries.length)) return;
                if (over && i === shown) {
                    chip.rect.color = "#3a332d";
                    chip.rect.borderColor = "#a89878";
                    chip.text.color = "#e8d9b8";
                    chip.text.setText(`+${entries.length - shown}`);
                    return;
                }
                const en = entries[i];
                chip.rect.color = en.color;
                chip.rect.borderColor = en.key === "block" ? "#8cc8f0" : en.buff ? "#5cc86c" : "#d8443c";
                chip.text.color = "#140c08";
                chip.text.setText(`${en.key === "block" ? "방" : en.name[0]}${en.value}`);
            });
        }
        if (!entries.length && this.statusOpen) this.closeStatus();
        if (this.statusOpen && key !== this._dlgKey) {
            this._dlgKey = key;
            for (const r of this.statusRows) r.destroy();
            this.statusRows = [];
            let y = 6;
            for (const e of entries) {
                const d = Status.describe(e);
                const color = e.key === "block" ? "#8cc8f0" : e.buff ? "#7cd47c" : "#f08c80";
                const go = this.statusContent.createChild("row");
                const rt = UIKit.place(go, 6, y, null, 52);
                go.addComponent(new UIRect({ color: "rgba(42, 35, 30, 0.95)", borderColor: UIKit.COLORS.border, borderWidth: 1 }));
                UIKit.label(rt, "t", d.title, 8, 5, null, 15, { fontSize: 12, fontWeight: "bold", color });
                UIKit.label(rt, "d", d.desc, 8, 22, null, 28, { fontSize: 10, color: "#c8b890", wrap: true, lineHeight: 1.25 });
                this.statusRows.push(go);
                y += 56;
            }
            this.statusScroll.contentHeight = y + 6;
        }
        if (this.statusOpen && Input.getButtonDown("cancel")) this.closeStatus();
    }

    // 한 줄에 놓을 수 있는 아이콘 수
    chipCap() {
        const screen = this.engine.width / this.engine.uiRoot.scale;
        return Math.max(4, Math.min(PlayerHud.CHIPS, Math.floor((screen - 24 + 3) / (PlayerHud.CHIP_W + 3))));
    }

    static setBar(bar, value, max, label, color) {
        const rt = bar.fill.getComponent(RectTransform);
        rt.setAnchor(0, 0, Math.max(0, Math.min(1, value / max)), 1);
        rt.setOffsets(1, 1, 1, 1);
        if (color) bar.fill.color = color;
        bar.text.setText(label);
    }

    // 좁은 화면에서 오른쪽 위 버튼들과 겹치지 않게 돈·층 칸 너비를 줄인다
    fitWidth() {
        const screen = this.engine.width / this.engine.uiRoot.scale;
        const n = SidePanel.twoRows(this.engine) ? 4 : SidePanel.SLOTS;
        const buttons = 16 + n * SidePanel.BUTTON + (n - 1) * 8;
        const w = Math.max(110, Math.min(this.maxWidth, Math.floor(screen - buttons - 16 - 8)));
        if (w === this.width) return;
        this.width = w;
        this.levelRT.setSizeAndPosition(Math.max(70, Math.min(130, w - 82)), 18, 16 + 76 + 6, 16);
    }

    update() {
        const s = this.player.stats;
        const block = this.player.block;
        const p = this.player;
        PlayerHud.setBar(this.hpBar, s.hp, s.maxHp, block ? `체력 ${s.hp}/${s.maxHp} · 방어 ${block}` : `체력 ${s.hp}/${s.maxHp}`);
        this.hpBack.borderColor = block ? "#8cc8f0" : "#5a4a3a";
        this.hpBack.borderWidth = block ? 2 : 1;
        const lock = p.drawLock > 0 ? ` · 쉼 ${p.drawLock}` : "";
        PlayerHud.setBar(this.energyBar, Math.min(p.energy, p.maxEnergy), p.maxEnergy, `기력 ${p.energy}/${p.maxEnergy}${lock}`, p.energy > 0 ? "#c8a02c" : "#6a5a3a");
        PlayerHud.setBar(this.manaBar, p.mana, p.maxMana, `마나 ${p.mana}/${p.maxMana}`);

        this.updateStatus();
        this.fitWidth();

        // 메시지: 최근 logLines줄 (설정)
        const shown = Settings.get("logLines");
        const logWidth = this.logWidth;
        const key = MessageLog.version + ":" + shown + ":" + logWidth;
        if (key !== this._logVersion) {
            this._logVersion = key;
            const messages = MessageLog.lines.slice(-shown);
            const rows = [];
            messages.forEach((m, i) => {
                const opacity = 0.55 + 0.45 * (i + 1) / messages.length;
                for (const text of PlayerHud.wrap(m.text, logWidth - 14, this.engine.uiRoot.scale)) rows.push({ text, color: m.color, opacity });
            });
            // 오래된 줄부터 버려서 최근 메시지가 늘 보이게 (줄 수 한도 = 설정 × 2)
            while (rows.length > Math.min(this.lines.length, shown * 2)) rows.shift();
            this.lines.forEach((text, i) => {
                const row = rows[i];
                text.setText(row ? row.text : "");
                if (row) {
                    text.color = row.color;
                    text.opacity = row.opacity;
                }
                text.getComponent(RectTransform).setSizeAndPosition(logWidth - 8, 15, 22, PlayerHud.LOG_Y + 4 + i * 15);
            });
            const n = Math.min(rows.length, this.lines.length);
            const brt = this.logBack.getComponent(RectTransform);
            brt.setPivot(0, 0);
            brt.setSizeAndPosition(logWidth, n * 15 + 6, 16, PlayerHud.LOG_Y);
            this.logBack.setActive(n > 0);
        }

        this.moneyText.setText(`${this.player.money} G`);
        if (this.run) {
            const node = this.run.node;
            this.levelText.setText(this.run.state === "room" && node ? `${node.row + 1}층 · ${RunMap.TYPES[node.type].name}` : `${this.run.floor}층 · 지도`);
        }
    }
}

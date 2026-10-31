// 왼쪽 위 상시 표시: 체력바(+방어도) + 마나·기력 막대 + 돈·층 + 최근 메시지. (쓰러지면 EndScreen이 뜬다)
class PlayerHud extends Component {
    static LOG_MAX_WIDTH = 360; // 메시지 칸 최대 너비 (UI 단위). 화면이 좁으면 화면 폭 - 32
    static LOG_WRAP = 4;        // 메시지 하나가 차지할 수 있는 최대 줄 수
    static LOG_FONT = 11;
    static CHIPS = 12;   // 상태이상 아이콘 최대 개수
    static CHIP_W = 28;

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
        this.sy = 0;           // 상태이상 아이콘 줄이 떠 있으면 그 아래 칸들을 밀어 내리는 높이
        this._statusKey = null;
    }

    start() {
        const w = this.width;

        const bar = this.engine.createUI("hpBar");
        const brt = bar.getComponent(RectTransform);
        this.hpRT = brt;
        brt.setPivot(0, 0);
        brt.setSizeAndPosition(w, 18, 16, 16);
        this.hpBack = bar.addComponent(new UIRect({ color: "rgba(18, 13, 10, 0.82)", borderColor: "#5a4a3a", borderWidth: 1 }));
        this.fill = brt.createChild("fill");
        this.fill.addComponent(new UIRect({ color: "#c43434" }));
        const label = brt.createChild("label");
        const lrt = label.getComponent(RectTransform);
        lrt.setAnchor(0, 0, 1, 1);
        lrt.setOffsets(6, 0, 6, 0);
        this.hpText = label.addComponent(new UIText("", { fontSize: 11, color: "#ffffff", align: "left" }));

        // 마나(파랑), 기력(노랑): 얇은 막대. 기력은 행동 카드 비용이고 턴이 지나면 가득 찬다
        this.manaBar = this.smallBar("manaBar", 38, "#3c78d8");
        this.energyBar = this.smallBar("energyBar", 54, "#c8a02c");

        // 상태이상: 기력 막대 아래 아이콘 줄 (없으면 숨기고 아래 칸들을 올린다). 누르면 목록 창
        const row = this.engine.createUI("statusRow");
        this.statusRT = row.getComponent(RectTransform);
        this.statusRT.setPivot(0, 0);
        this.statusRT.setSizeAndPosition(w, 20, 16, 70);
        this.statusGO = row;
        row.setActive(false);
        this.chips = [];
        for (let i = 0; i < PlayerHud.CHIPS; i++) {
            const chip = UIKit.button(this.statusRT, "chip" + i, "", () => this.openStatus(), { fontSize: 10 });
            chip.rt.setPivot(0, 0);
            chip.rt.setSizeAndPosition(PlayerHud.CHIP_W, 18, i * (PlayerHud.CHIP_W + 3), 1);
            chip.go.setActive(false);
            this.chips.push(chip);
        }
        this.buildStatusDialog();

        // 돈: 그 아래 동전 + 숫자
        const money = this.engine.createUI("money");
        const mrt0 = money.getComponent(RectTransform);
        this.moneyRT = mrt0;
        mrt0.setPivot(0, 0);
        mrt0.setSizeAndPosition(76, 18, 16, 70 + this.sy);
        money.addComponent(new UIRect({ color: "rgba(18, 13, 10, 0.82)", borderColor: "#5a4a3a", borderWidth: 1 }));
        const coin = mrt0.createChild("coin");
        UIKit.place(coin, 2, 1, 16, 16);
        coin.addComponent(new UIImage(Resource.image("cards"), { region: { x: 17 * 16, y: 0, width: 16, height: 16 } }));
        this.moneyText = UIKit.label(mrt0, "value", "", 20, 0, null, 18, { fontSize: 11, color: "#f0d878", verticalAlign: "middle" });

        // 지금 층과 방 종류
        const where = this.engine.createUI("levelName");
        const wrt = where.getComponent(RectTransform);
        this.levelRT = wrt;
        wrt.setPivot(0, 0);
        wrt.setSizeAndPosition(130, 18, 16 + 76 + 6, 70 + this.sy);
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
            rt.setSizeAndPosition(w, 15, 22, 96 + this.sy + i * 15);
            this.lines.push(go.addComponent(new UIText("", { fontSize: 11, color: "#e8d9b8", align: "left", verticalAlign: "top" })));
        }

    }

    // ---------- 상태이상 아이콘 · 목록 창 ----------
    buildStatusDialog() {
        const { root, box } = Modal.create(this.engine, "statusList", 300, 320, () => this.closeStatus());
        this.statusDlg = root;
        this.statusBox = box;
        UIKit.label(box, "title", "상태이상", 14, 10, null, 18, { fontSize: 14, fontWeight: "bold", color: UIKit.COLORS.gold });
        this.statusBody = UIKit.label(box, "body", "", 14, 36, null, 220, { fontSize: 12, wrap: true, lineHeight: 1.35 });
        this.statusRows = [];
        const close = UIKit.button(box, "close", "닫기", () => this.closeStatus(), { fontSize: 13 });
        close.rt.setAnchor(0, 1, 1, 1);
        close.rt.setOffsets(12, -44, 12, 10);
        this.statusOpen = false;
    }

    openStatus() {
        if (this.statusOpen) return;
        this.statusOpen = true;
        this._dlgKey = null;
        Modal.fit(this.engine, this.statusBox, 300, 320);
        Modal.show(this.statusDlg, true);
    }

    closeStatus() {
        if (!this.statusOpen) return;
        this.statusOpen = false;
        Modal.show(this.statusDlg, false);
    }

    // 아이콘 줄과 (열려 있으면) 목록 창을 지금 상태에 맞춘다
    updateStatus() {
        const entries = Status.entries(this.player);
        const key = entries.map((e) => `${e.key}${e.from ?? ""}:${e.value}:${e.t}`).join("|");
        const shown = entries.length > 0;
        const sy = shown ? 22 : 0;
        if (sy !== this.sy) {
            this.sy = sy;
            this.moneyRT.setSizeAndPosition(76, 18, 16, 70 + sy);
            this.levelRT.setSizeAndPosition(this.levelRT.width ?? 130, 18, 16 + 76 + 6, 70 + sy);
            this._logVersion = -1;
            this._fitDone = false;
            this.width = -1; // fitWidth가 위치를 다시 잡게
        }
        this.statusGO.setActive(shown);
        if (key !== this._statusKey) {
            this._statusKey = key;
            this.chips.forEach((chip, i) => {
                const en = entries[i];
                chip.go.setActive(!!en);
                if (!en) return;
                chip.rect.color = en.color;
                chip.rect.borderColor = "#140c08";
                chip.text.color = "#140c08";
                chip.text.setText(`${en.name[0]}${en.value}`);
            });
        }
        if (!shown && this.statusOpen) this.closeStatus();
        if (this.statusOpen && key !== this._dlgKey) {
            this._dlgKey = key;
            const lines = entries.map((e) => {
                const d = Status.describe(e);
                return `■ ${d.title}\n   ${d.desc}`;
            });
            this.statusBody.setText(lines.join("\n\n"));
        }
        if (this.statusOpen && Input.getButtonDown("cancel")) this.closeStatus();
    }

    // 얇은 막대 (바탕 + 채움 + 글자)
    smallBar(name, y, color) {
        const go = this.engine.createUI(name);
        const rt = go.getComponent(RectTransform);
        rt.setPivot(0, 0);
        rt.setSizeAndPosition(this.width, 14, 16, y);
        go.addComponent(new UIRect({ color: "rgba(18, 13, 10, 0.82)", borderColor: "#5a4a3a", borderWidth: 1 }));
        const fill = rt.createChild("fill").addComponent(new UIRect({ color }));
        const text = UIKit.label(rt, "label", "", 6, 0, null, 14, { fontSize: 10, color: "#ffffff", verticalAlign: "middle" });
        return { rt, fill, text };
    }

    static setBar(bar, value, max, label, color) {
        const rt = bar.fill.getComponent(RectTransform);
        rt.setAnchor(0, 0, Math.max(0, value) / max, 1);
        rt.setOffsets(1, 1, 1, 1);
        if (color) bar.fill.color = color;
        bar.text.setText(label);
    }

    // 좁은 화면에서 오른쪽 위 버튼들과 겹치지 않게 막대 너비를 줄인다 (아주 좁으면 버튼이 두 줄이라 첫 줄 4개만)
    fitWidth() {
        const screen = this.engine.width / this.engine.uiRoot.scale;
        const n = SidePanel.twoRows(this.engine) ? 4 : SidePanel.SLOTS;
        const buttons = 16 + n * SidePanel.BUTTON + (n - 1) * 8;
        const w = Math.max(110, Math.min(this.maxWidth, Math.floor(screen - buttons - 16 - 8)));
        if (w === this.width) return;
        this.width = w;
        this.hpRT.setSizeAndPosition(w, 18, 16, 16);
        this.manaBar.rt.setSizeAndPosition(w, 14, 16, 38);
        this.energyBar.rt.setSizeAndPosition(w, 14, 16, 54);
        this.levelRT.setSizeAndPosition(Math.max(70, Math.min(130, w - 82)), 18, 16 + 76 + 6, 70 + this.sy);
        this.statusRT.setSizeAndPosition(w, 20, 16, 70);
    }

    update() {
        const s = this.player.stats;
        const block = this.player.block;
        const p0 = this.player;
        const marks = [block ? `방어 ${block}` : ""].filter(Boolean); // 상태이상은 아래 아이콘 줄에
        this.hpText.setText(marks.length ? `체력 ${s.hp}/${s.maxHp} · ${marks.join(" · ")}` : `체력 ${s.hp} / ${s.maxHp}`);
        this.hpBack.borderColor = block ? "#8cc8f0" : "#5a4a3a";
        this.hpBack.borderWidth = block ? 2 : 1;
        const frt = this.fill.getComponent(RectTransform);
        frt.setAnchor(0, 0, s.hp / s.maxHp, 1);
        frt.setOffsets(1, 1, 1, 1);

        this.updateStatus();
        this.fitWidth();

        // 메시지: 최근 logLines줄 (설정)
        const shown = Settings.get("logLines");
        const logWidth = this.logWidth;
        const key = MessageLog.version + ":" + shown + ":" + logWidth + ":" + this.sy;
        if (key !== this._logVersion) {
            this._logVersion = key;
            const messages = MessageLog.lines.slice(-shown);
            // 메시지마다 줄을 나눠서 차례로 (최근 것일수록 진하게)
            const rows = [];
            messages.forEach((m, i) => {
                const opacity = 0.55 + 0.45 * (i + 1) / messages.length;
                for (const text of PlayerHud.wrap(m.text, logWidth - 14, this.engine.uiRoot.scale)) rows.push({ text, color: m.color, opacity });
            });
            this.lines.forEach((text, i) => {
                const row = rows[i];
                text.setText(row ? row.text : "");
                if (row) {
                    text.color = row.color;
                    text.opacity = row.opacity;
                }
                text.getComponent(RectTransform).setSizeAndPosition(logWidth - 8, 15, 22, 96 + this.sy + i * 15);
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
            });
            const n = Math.min(rows.length, this.lines.length);
            const brt = this.logBack.getComponent(RectTransform);
            brt.setPivot(0, 0);
            brt.setSizeAndPosition(logWidth, n * 15 + 6, 16, 92 + this.sy);
            this.logBack.setActive(n > 0);
        }

        this.moneyText.setText(`${this.player.money} G`);
        if (this.run) {
            const node = this.run.node;
            this.levelText.setText(this.run.state === "room" && node ? `${node.row + 1}층 · ${RunMap.TYPES[node.type].name}` : `${this.run.floor}층 · 지도`);
        }
        const p = this.player;
        PlayerHud.setBar(this.manaBar, p.mana, p.maxMana, `마나 ${p.mana}/${p.maxMana}`);
        const lock = p.drawLock > 0 ? ` · 쉼 ${p.drawLock}턴 (못 뽑음)` : "";
        PlayerHud.setBar(this.energyBar, Math.min(p.energy, p.maxEnergy), p.maxEnergy, `기력 ${p.energy}/${p.maxEnergy}${lock}`, p.energy > 0 ? "#c8a02c" : "#6a5a3a");
    }
}

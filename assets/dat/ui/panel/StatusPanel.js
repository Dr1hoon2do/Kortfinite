// 플레이어 상태창. 체력바와 능력치 줄을 매 프레임 플레이어 값으로 갱신한다.
// 줄을 늘리려면 rows에 [이름, 값을 돌려주는 함수]를 추가하면 된다.
// 아래에 런 시드. 처음 화면으로 나가기는 설정 창(SettingsPanel).
class StatusPanel extends SidePanel {
    constructor(options) {
        super({ action: "status", keys: ["KeyC"], icon: 5, slot: 2, title: "상태", width: 236, ...options });
        this.player = options.player;
        this.turns = options.turns;
        this.run = options.run ?? null;
        this.rows = options.rows ?? [
            ["공격력", (p) => StatusPanel.withGear(p.stats.attack, Player.BASE_ATTACK)],
            ["방어력", (p) => StatusPanel.withGear(p.stats.defense, Player.BASE_DEFENSE)],
            ["이동속도", (p) => StatusPanel.withGear(p.speed, Player.BASE_SPEED)],
            ["기력", (p) => `${p.energy} / ${p.maxEnergy}${p.drawLock > 0 ? ` · 쉼 ${p.drawLock}턴` : ""}`],
            ["방어도", (p) => p.blocks.length ? p.blocks.map((b) => `${b.v}(${b.t}턴)`).join(" + ") : "0"],
            ["상태", (p) => Status.text(p) || "없음"],
            ["재료", (p) => Object.entries(p.mats ?? {}).filter(([, v]) => v).map(([k, v]) => `${GameContent.materials.get(k)?.name ?? k} ${v}`).join(", ") || "없음"],
            ["마나", (p) => `${p.mana} / ${p.maxMana}`],
            ["돈", (p) => `${p.money} G`],
            ["처치", (p) => p.kills],
            ["층", () => (this.run ? `${this.run.floor}층 · 지나온 방 ${this.run.visited.length}` : "")],
            ["행동 패", (p) => `${p.cards.counts().a} / ${p.cards.actionLimit}`],
            ["소지품 패", (p) => `${p.cards.counts().i} / ${p.cards.invLimit}${p.cards.overflow ? ` (행동 패 ${p.cards.overflow}칸 차지)` : ""}`],
            ["장착", (p) => p.cards.equippedCards.map((c) => `${CardDef.slotName(c.def.slot)}: ${c.name}`).join(", ") || "없음"],
            ["덱 / 묘지", (p) => `${p.cards.deck.length} / ${p.cards.graveyard.length} (전체 ${p.cards.allActions.length})`],
            ["턴", () => this.turns.turn],
            ["카드 빼기 값", () => (this.run ? `${this.run.removeCost} G` : "")]
        ];
    }

    // "8 (+3)" — 장비로 오른 만큼
    static withGear(value, base) {
        return value === base ? String(value) : `${value} (${value > base ? "+" : ""}${value - base})`;
    }

    build(body) {
        const pad = 12;
        const name = body.createChild("name");
        StatusPanel.place(name, pad, 6, null, 18);
        name.addComponent(new UIText(this.player.displayName, { fontSize: 14, fontWeight: "bold", color: "#e8d9b8", align: "left", verticalAlign: "top" }));

        const hpLabel = body.createChild("hpLabel");
        StatusPanel.place(hpLabel, pad, 32, null, 14);
        hpLabel.addComponent(new UIText("체력", { fontSize: 12, color: "#c8b890", align: "left", verticalAlign: "top" }));
        const hpValue = body.createChild("hpValue");
        StatusPanel.place(hpValue, pad, 32, null, 14);
        this.hpText = hpValue.addComponent(new UIText("", { fontSize: 12, color: "#e8d9b8", align: "right", verticalAlign: "top" }));

        const hpBack = body.createChild("hpBar");
        StatusPanel.place(hpBack, pad, 50, null, 10);
        hpBack.addComponent(new UIRect({ color: "#2a1e16", borderColor: "#5a4a3a", borderWidth: 1 }));
        this.hpFill = hpBack.getComponent(RectTransform).createChild("fill");
        this.hpFill.addComponent(new UIRect({ color: "#c43434" }));

        // 줄: 왼쪽 이름(고정 폭), 오른쪽 값(길면 줄바꿈). 값이 바뀌면 줄 높이를 다시 잰다 (layoutRows)
        this.values = [];
        this.labels = [];
        for (const [label] of this.rows) {
            const l = body.createChild("label");
            this.labels.push(l.addComponent(new UIText(label, { fontSize: 12, color: "#c8b890", align: "left", verticalAlign: "top" })));
            const v = body.createChild("value");
            this.values.push(v.addComponent(new UIText("", { fontSize: 12, color: "#e8d9b8", align: "right", verticalAlign: "top", wrap: true, lineHeight: 1.3 })));
        }
        this.seedText = this.run ? UIKit.label(body, "seed", `런 시드: ${this.run.seed}`, pad, 0, null, 14, { fontSize: 11, color: "#c8b890" }) : null;
        this.hint = UIKit.label(body, "hint", "설정·처음 화면: 오른쪽 위 메뉴 버튼 (O)", pad, 0, null, 28, { fontSize: 10, color: UIKit.COLORS.dim, wrap: true });
        this._ctx = document.createElement("canvas").getContext("2d");
        this._layoutKey = null;
    }

    static LABEL_W = 78;

    layoutRows() {
        const pad = 12;
        const W = this.panelWidth;
        const vw = W - pad * 2 - StatusPanel.LABEL_W;
        const key = this.values.map((v) => v.text).join("|");
        if (key === this._layoutKey) return;
        this._layoutKey = key;
        let y = 74;
        this.values.forEach((v, i) => {
            const lines = Math.max(1, v.measureLines(this._ctx, vw));
            const h = Math.ceil(lines * 12 * 1.3);
            StatusPanel.place(this.labels[i].gameObject, pad, y, StatusPanel.LABEL_W, 16);
            StatusPanel.place(v.gameObject, pad + StatusPanel.LABEL_W, y, vw, h);
            y += Math.max(22, h + 6);
        });
        if (this.seedText) StatusPanel.place(this.seedText.gameObject, pad, y + 8, null, 14);
        StatusPanel.place(this.hint.gameObject, pad, y + 28, null, 28);
    }

    refresh() {
        const p = this.player;
        const s = p.stats;
        this.hpText.setText(`${s.hp} / ${s.maxHp}`);
        const frt = this.hpFill.getComponent(RectTransform);
        frt.setAnchor(0, 0, s.hp / s.maxHp, 1);
        frt.setOffsets(1, 1, 1, 1);
        this.rows.forEach(([, get], i) => this.values[i].setText(String(get(p))));
        this.layoutRows();
    }

    // 가로로 꽉 차게(좌우 x 여백) 또는 너비 w로, 위에서 y만큼 내려서 높이 h
    static place(go, x, y, w, h) {
        const rt = go.getComponent(RectTransform);
        rt.setAnchor(0, 0, w === null ? 1 : 0, 0);
        rt.setOffsets(x, y, w === null ? x : -(x + w), -(y + h));
    }
}

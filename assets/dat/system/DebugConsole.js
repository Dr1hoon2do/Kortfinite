// 디버그 명령 창 (마인크래프트 명령어처럼). 새 런을 시작할 때 "디버그 명령"을 켠 런에서만 쓸 수 있다.
// 여는 법: 키보드 "/" 또는 화면 아래 가운데 "/" 버튼. Enter로 실행, Esc로 닫기, ↑↓로 이전 명령.
// 명령은 DebugConsole.register(이름, { args, help, aliases, run(ctx, args) })로 더한다. run이 돌려준 글은 창에 찍힌다.
// ctx = { console, player, cards, world(지금 방), run, turns }
class DebugConsole extends Component {
    static commands = new Map();
    static aliases = new Map();
    static LINES = 13;

    static register(name, def) {
        DebugConsole.commands.set(name, { name, args: "", aliases: [], ...def });
        for (const a of def.aliases ?? []) DebugConsole.aliases.set(a, name);
    }

    static find(name) {
        return DebugConsole.commands.get(name) ?? DebugConsole.commands.get(DebugConsole.aliases.get(name));
    }

    // options: { engine, player, world, run, turns }
    constructor(options) {
        super();
        this.o = options;
        this.lines = [];
        this.history = [];
        this.at = 0;
    }

    get ctx() {
        const o = this.o;
        return { console: this, player: o.player, cards: o.player.cards, world: o.world, run: o.run, turns: o.turns };
    }

    start() {
        const engine = this.o.engine;
        const { root, box } = Modal.create(engine, "debugConsole", 460, 330, () => this.close());
        this.root = root;
        this.box = box;
        UIKit.label(box, "title", "디버그 명령 (help: 명령 목록, Esc: 닫기)", 12, 8, null, 16, { fontSize: 12, fontWeight: "bold", color: UIKit.COLORS.gold });
        this.out = UIKit.label(box, "out", "", 12, 30, null, 250, { fontSize: 11, color: "#c8e8b0", wrap: true, lineHeight: 1.4 });
        const input = box.createChild("input");
        const irt = input.getComponent(RectTransform);
        irt.setAnchor(0, 1, 1, 1);
        irt.setOffsets(12, -42, 12, 10);
        this.field = input.addComponent(new TextField({ engine, placeholder: "/give heavy", maxLength: 80 }));

        // 화면 오른쪽, 아래 패 위 "/" 버튼 (모바일)
        this.button = engine.createUI("debugButton");
        const brt = this.button.getComponent(RectTransform);
        brt.setAnchor(1, 1, 1, 1);
        brt.setSizeAndPosition(32, 32, -28, -(HandBar.HEIGHT + 24));
        this.button.addComponent(new UIRect({ color: "rgba(40, 30, 60, 0.85)", borderColor: "#9a5ad8", borderWidth: 1 }));
        this.button.addComponent(new UIButton({ onTap: () => this.open() }));
        const t = brt.createChild("label");
        t.getComponent(RectTransform).setAnchor(0, 0, 1, 1);
        t.addComponent(new UIText("/", { fontSize: 18, color: "#e0c8ff" }));

        this._onKey = (e) => {
            const typing = document.activeElement && document.activeElement.tagName === "INPUT";
            if (this.isOpen) {
                if (e.target !== this.field.el) return;
                if (e.key === "Enter") { e.preventDefault(); this.submit(); }
                else if (e.key === "Escape") { e.preventDefault(); this.close(); }
                else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                    e.preventDefault();
                    if (!this.history.length) return;
                    this.at = Math.max(0, Math.min(this.history.length, this.at + (e.key === "ArrowUp" ? -1 : 1)));
                    this.field.value = this.history[this.at] ?? "";
                }
                e.stopPropagation();
                return;
            }
            if (!typing && e.key === "/" && !Modal.isOpen) {
                e.preventDefault();
                this.open();
            }
        };
        document.addEventListener("keydown", this._onKey, true);
        this.print("디버그 명령을 쓸 수 있는 런이다. help를 쳐 보자");
    }

    onDestroy() {
        document.removeEventListener("keydown", this._onKey, true);
    }

    get isOpen() {
        return !!this.root && this.root.isActive;
    }

    open() {
        if (this.isOpen) return;
        Modal.fit(this.o.engine, this.box, 460, 330);
        Modal.show(this.root, true);
        this.field.value = "";
        this.at = this.history.length;
        setTimeout(() => this.field.el && this.field.el.focus(), 0);
    }

    close() {
        if (!this.isOpen) return;
        Modal.show(this.root, false);
    }

    print(text, color) {
        for (const line of String(text).split("\n")) this.lines.push(line);
        this.lines = this.lines.slice(-DebugConsole.LINES);
        if (this.out) this.out.setText(this.lines.join("\n"));
    }

    submit() {
        const text = this.field.value.trim();
        this.field.value = "";
        if (!text) return;
        this.history.push(text);
        this.at = this.history.length;
        this.print("> " + text);
        const result = this.run(text);
        if (result) this.print(result);
    }

    // 명령 한 줄 실행. 결과 글을 돌려준다
    run(text) {
        const [head, ...args] = text.replace(/^\//, "").trim().split(/\s+/);
        const cmd = DebugConsole.find(head.toLowerCase());
        if (!cmd) return `모르는 명령: ${head} (help)`;
        try {
            const r = cmd.run(this.ctx, args);
            return r === undefined ? "완료" : r;
        } catch (err) {
            console.error(err);
            return `오류: ${err.message}`;
        }
    }

    // ---------- 도우미 ----------
    // 이름이나 id로 카드 정의 찾기 ("wood", "나무", "돌도끼")
    static resolveCard(q) {
        if (!q) return null;
        if (CardDef.defs.has(q)) return q;
        const all = [...CardDef.defs.entries()];
        const exact = all.find(([id, d]) => d.name === q);
        if (exact) return exact[0];
        const part = all.find(([id, d]) => id.includes(q) || (d.name ?? "").includes(q));
        return part ? part[0] : null;
    }

    // 카드를 패에 (가득하면 행동 카드는 덱, 아이템은 못 준다)
    static giveCard(ctx, card) {
        if (ctx.cards.addToHand(card)) return "패";
        if (card.isSkill) {
            ctx.cards.addToDeck(card);
            return "덱";
        }
        return "못 받음";
    }

    static int(v, def) {
        const n = parseInt(v, 10);
        return Number.isFinite(n) ? n : def;
    }
}

// ================= 명령들 =================
DebugConsole.register("help", {
    args: "[명령]", help: "명령 목록 / 명령 설명",
    run(ctx, [name]) {
        if (name) {
            const c = DebugConsole.find(name.replace(/^\//, ""));
            return c ? `/${c.name} ${c.args} — ${c.help}${c.aliases.length ? ` (= ${c.aliases.join(", ")})` : ""}` : `모르는 명령: ${name}`;
        }
        const all = [...DebugConsole.commands.values()].map((c) => `/${c.name}`);
        const rows = [];
        for (let i = 0; i < all.length; i += 6) rows.push(all.slice(i, i + 6).join("  "));
        return rows.join("\n") + "\nhelp <명령>으로 자세히";
    }
});

DebugConsole.register("give", {
    args: "<카드> [수]", aliases: ["card", "i"],
    help: "카드 지급. 이름·id 모두 된다. 행동 카드는 패가 차면 덱으로",
    run(ctx, [q, n]) {
        const id = DebugConsole.resolveCard(q);
        if (!id) return `그런 카드가 없다: ${q ?? ""} (/cards로 찾기)`;
        const cards = [];
        {
            const count = Math.max(1, Math.min(99, DebugConsole.int(n, 1)));
            for (let i = 0; i < count; i++) cards.push(Card.create(id));
        }
        const where = cards.map((c) => DebugConsole.giveCard(ctx, c));
        const name = cards[0].name;
        const at = where.includes("못 받음") ? "패가 가득해 일부 못 받음" : where.includes("덱") ? "패가 가득해 일부 덱" : "패";
        return `${name} ×${cards.reduce((s, c) => s + (c.count ?? 1), 0)} 지급 (${at})`;
    }
});

DebugConsole.register("cards", {
    args: "[검색어]", help: "카드 id 목록 (검색어로 거르기)",
    run(ctx, [q]) {
        const list = [...CardDef.defs.entries()].filter(([id, d]) => !q || id.includes(q) || (d.name ?? "").includes(q));
        const shown = list.map(([id, d]) => `${id}(${d.name})`).slice(0, 40);
        return shown.join(" ") + (list.length > 40 ? ` … (${list.length}개)` : "");
    }
});

DebugConsole.register("summon", {
    args: "<종류> [수] [레벨] [elite|boss]", aliases: ["spawn"],
    help: "몬스터 소환 (rat, wolf, goblin, ogre, skeleton, slime, spider, stone_golem …). elite·boss를 붙이면 정예·우두머리",
    run(ctx, [type, n, lv, rank]) {
        if (!type || !Monster.KINDS[type]) return `종류: ${Object.keys(Monster.KINDS).join(", ")}`;
        const count = Math.max(1, Math.min(20, DebugConsole.int(n, 1)));
        const p = ctx.player;
        let made = 0;
        for (let i = 0; i < count; i++) {
            const spot = ctx.world.findFreeTile(p.x + 2, p.y, 8);
            if (!ctx.world.isWalkable(spot.x, spot.y)) continue;
            ctx.world.spawn(EntityTypes.create(type, spot.x, spot.y, { lv: Math.max(1, DebugConsole.int(lv, 1)), rank: rank === "boss" || rank === "elite" ? rank : "normal" }));
            made++;
        }
        EnemyMoves.planAll(ctx.world, p, ctx.turns.turn);
        if (made && ctx.run) {
            ctx.run.cleared = false;
            if (ctx.run.exit) ctx.run.exit.setOpen(false);
        }
        return `${type} ${made}마리 소환`;
    }
});

DebugConsole.register("killall", {
    args: "", aliases: ["kill", "win"], help: "방의 적을 모두 없앤다 (방을 정리한 것으로 친다)",
    run(ctx) {
        let n = 0;
        for (let pass = 0; pass < 5; pass++) { // 슬라임이 갈라지면 한 번 더
            const list = ctx.world.hostiles(ctx.player);
            if (!list.length) break;
            for (const e of list) {
                e.stats.hp = 0;
                Combat.kill(e, ctx.player, ctx.world);
                if (e.gameObject) e.gameObject.destroy();
                n++;
            }
        }
        return `${n}마리 치움`;
    }
});

DebugConsole.register("room", {
    args: "<start|battle|elite|shop|rest|treasure|boss>", aliases: ["go"],
    help: "이 층의 그 종류의 방으로 바로 간다 (지도에서 고른 것처럼)",
    run(ctx, [type]) {
        const run = ctx.run;
        if (!RunMap.TYPES[type]) return `종류: ${Object.keys(RunMap.TYPES).join(", ")}`;
        const node = [...run.map.nodes.values()].find((n) => n.type === type);
        if (!node) return `그런 방이 이 층에 없다`;
        ctx.console.close();
        run.state = "map";
        run.enter(node.id, true);
        return `${run.floorNo}층 ${RunMap.TYPES[type].name}`;
    }
});

DebugConsole.register("floor", {
    args: "<n>", help: "n층(1~3)의 시작 방으로 간다 (그 층은 처음부터)",
    run(ctx, [n]) {
        const run = ctx.run;
        ctx.console.close();
        run.gotoFloor(DebugConsole.int(n, 1));
        return `${run.floorNo}층 시작 방`;
    }
});

DebugConsole.register("heal", {
    args: "", help: "체력·마나·기력 가득",
    run(ctx) {
        const p = ctx.player;
        p.stats.hp = p.stats.maxHp;
        p.mana = p.maxMana;
        p.energy = p.maxEnergy;
        return "가득 채웠다";
    }
});

DebugConsole.register("god", {
    args: "", help: "무적 켜기/끄기",
    run(ctx) {
        const p = ctx.player;
        p.invulnerable = !p.invulnerable;
        return p.invulnerable ? "무적 켬" : "무적 끔";
    }
});

DebugConsole.register("money", {
    args: "<n>", aliases: ["gold"], help: "돈 더하기 (음수면 빼기)",
    run(ctx, [n]) {
        ctx.player.money = Math.max(0, ctx.player.money + DebugConsole.int(n, 100));
        return `돈 ${ctx.player.money} G`;
    }
});

DebugConsole.register("energy", {
    args: "[n]", help: "기력 채우기 (n이면 그 값, 최대를 넘겨도 된다)",
    run(ctx, [n]) {
        const p = ctx.player;
        p.energy = n === undefined ? p.maxEnergy : Math.max(0, DebugConsole.int(n, p.maxEnergy));
        p.drawLock = 0;
        return `기력 ${p.energy}/${p.maxEnergy}`;
    }
});

DebugConsole.register("draw", {
    args: "[n]", help: "턴을 쓰지 않고 n장 뽑기",
    run(ctx, [n]) {
        const got = ctx.player.cards.draw(Math.max(1, DebugConsole.int(n, 1)));
        return `${got.length}장 뽑음`;
    }
});

DebugConsole.register("clear", {
    args: "", help: "패 비우기 (행동 카드는 묘지로, 아이템은 없어진다)",
    run(ctx) {
        const n = ctx.cards.hand.length;
        for (const c of [...ctx.cards.hand]) {
            ctx.cards.removeFromHand(c, true);
            if (c.isSkill) ctx.cards.toGraveyard(c);
        }
        return `패 ${n}장 비움`;
    }
});

DebugConsole.register("pos", {
    args: "", aliases: ["where"], help: "지금 위치·방·타일",
    run(ctx) {
        const p = ctx.player;
        const tile = TileDef.get(ctx.world.getTile(p.x, p.y));
        const node = ctx.run.node;
        return `(${p.x}, ${p.y}) · ${node ? `${ctx.run.floorNo}층 ${RunMap.TYPES[node.type].name}` : "지도"} · ${tile ? tile.name : "?"}`;
    }
});

DebugConsole.register("mat", {
    args: "<재료> [수]", aliases: ["material"],
    help: "재료 지급 (id나 이름). 인자가 없으면 가진 재료와 종류를 보여 준다",
    run(ctx, [q, n]) {
        const all = [...GameContent.materials.values()];
        if (!q) return `가진 재료: ${Object.entries(ctx.player.mats).map(([id, c]) => `${GameContent.materials.get(id)?.name ?? id} ${c}`).join(", ") || "없음"}\n종류: ${all.map((m) => `${m.id}(${m.name})`).join(" ")}`;
        const m = all.find((x) => x.id === q || x.name === q);
        if (!m) return `그런 재료가 없다: ${q}`;
        const count = Math.max(1, Math.min(99, DebugConsole.int(n, 1)));
        ctx.player.addMat(m.id, count);
        return `${m.name} ×${count} 지급`;
    }
});

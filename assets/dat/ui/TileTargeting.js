// 칸 지정 모드: 칸을 골라야 하는 행동(칸을 고르는 카드, 상호작용 버튼)이 여기로 들어온다.
// 요청(request)마다 사거리, 효과 범위, 확정 방식, 확정했을 때 할 일을 정한다:
//   { name, range, radius, includeSelf, taps(1이면 바로, 2면 한 번 더 눌러 확정), color, onConfirm({ x, y }), valid(),
//     tiles(고를 수 있는 칸 키 Set — 이동 카드는 걸어서 갈 수 있는 칸만) }
// - 바닥에 사거리(옅게)와 조준한 칸의 효과 범위(진하게)를 그린다. 데스크톱은 마우스를 올린 칸 범위를 미리 보여준다.
// - [취소], Esc는 취소. 사거리 밖을 탭하면 알려주고 조준은 그대로 둔다.
// - 패의 카드를 고르면 바로 이 모드가 된다: 안내줄에 카드 설명과 [쓰기] [묘지로/버리기] [취소].
//   칸이 필요 없는 카드(나에게 쓰는 카드·물약 등)는 내 칸만 고를 수 있다 (나를 누르거나 [사용]).
// 월드 탭은 WorldInput이 이쪽으로 넘겨준다 (active일 때).
// 안내줄은 끌어서 옮길 수 있다 (뒤에 숨은 적을 고를 때). 옮긴 자리는 다음 카드에도 그대로 쓴다.
class TileTargeting extends Component {
    // options: { engine, world, player }
    constructor(options) {
        super();
        this.engine = options.engine;
        this.world = options.world;
        this.player = options.player;
        this.request = null;
        this.aim = null;   // 조준한 칸 { x, y }
        this.hover = null; // 마우스를 올린 칸
        this.drag = { x: 0, y: 0 }; // 안내줄을 끌어 옮긴 양 (UI 단위)
        this._ctx = document.createElement("canvas").getContext("2d");
    }

    get active() {
        return this.request !== null;
    }

    // 지금 지정 중인 카드 (카드 요청일 때)
    get card() {
        return this.request ? this.request.card ?? null : null;
    }

    start() {
        this.addComponent(new TargetOverlay(this));

        // 아래 안내줄: 이름과 안내, 카드 설명, [시전] [묘지로] [취소]. 아래 패(HandBar) 위에 뜬다.
        this.banner = this.engine.createUI("targeting");
        const brt = this.banner.getComponent(RectTransform);
        brt.sortOrder = UILayer.TARGET;
        brt.setAnchor(0.5, 1, 0.5, 1);
        this.bannerRT = brt;
        this.layoutBanner(260, 0);
        this.banner.addComponent(new UIRect({ color: "rgba(18, 13, 10, 0.9)", borderColor: UIKit.COLORS.gold, borderWidth: 1 }));
        this.banner.addComponent(new UIDrag({ onMove: (dx, dy) => this.moveBanner(dx, dy) }));
        // 손잡이 표시 (오른쪽 위)
        const grip = brt.createChild("grip");
        const grt = grip.getComponent(RectTransform);
        grt.setAnchor(1, 0, 1, 0);
        grt.setSizeAndPosition(54, 16, -32, 12);
        grip.addComponent(new UIText("≡ 옮기기", { fontSize: 9, color: UIKit.COLORS.faint }));

        const label = brt.createChild("label");
        const lrt = label.getComponent(RectTransform);
        lrt.setAnchor(0, 0, 1, 0);
        lrt.setOffsets(10, 6, 10, -30);
        this.label = label.addComponent(new UIText("", { fontSize: 12, color: UIKit.COLORS.text, align: "left" }));
        const desc = brt.createChild("desc");
        this.descRT = desc.getComponent(RectTransform);
        this.descRT.setAnchor(0, 0, 1, 1);
        this.desc = desc.addComponent(new UIText("", { fontSize: 12, color: "#d8c8a0", align: "left", verticalAlign: "top", wrap: true, lineHeight: 1.35, rich: true }));
        const terms = brt.createChild("terms");
        this.termsRT = terms.getComponent(RectTransform);
        this.termsRT.setAnchor(0, 0, 1, 0);
        this.terms = terms.addComponent(new UIText("", { fontSize: 10, color: "#a89878", align: "left", verticalAlign: "top", wrap: true, lineHeight: 1.35, rich: true }));

        this.castButton = UIKit.button(brt, "cast", "시전", () => this.confirm());
        this.discardButton = UIKit.button(brt, "discard", "묘지로", () => this.discardCard());
        this.cancelButton = UIKit.button(brt, "cancel", "취소", () => this.cancel());

        this.banner.setActive(false);
    }

    // 안내줄 크기와 버튼 자리. descLines: 카드 설명 줄 수 (0이면 설명 없음), termLines: 용어 풀이 줄 수
    layoutBanner(w, descLines, termLines = 0) {
        const descH = descLines ? Math.ceil(descLines * 12 * 1.35) + 4 : 0;
        const termH = termLines ? Math.ceil(termLines * 10 * 1.35) + 6 : 0;
        const h = 30 + descH + termH + 38;
        this._bw = w;
        this._bh = h;
        this.placeBanner();
        if (this.descRT) this.descRT.setOffsets(10, 26, 10, 38 + termH);
        if (this.termsRT) this.termsRT.setOffsets(10, 26 + descH + 2, 10, -(26 + descH + termH));
        if (!this.castButton) return;
        const buttons = [this.castButton, ...(this.discardButton.go.isActive ? [this.discardButton] : []), this.cancelButton];
        buttons.forEach((b, i) => {
            b.rt.setAnchor(i / buttons.length, 1, (i + 1) / buttons.length, 1);
            b.rt.setOffsets(i === 0 ? 8 : 3, -34, i === buttons.length - 1 ? 8 : 3, 6);
        });
    }

    // 기본 자리 (아래 패 위 가운데) + 끌어 옮긴 양. 화면 밖으로는 못 나가게
    placeBanner() {
        const scale = this.engine.uiRoot.scale;
        const W = this.engine.width / scale;
        const H = this.engine.height / scale;
        const w = this._bw, h = this._bh;
        const baseY = -(HandBar.HEIGHT + 4 + h / 2);
        const maxX = Math.max(0, (W - w) / 2);
        this.drag.x = Math.max(-maxX, Math.min(maxX, this.drag.x));
        const top = H + baseY - h / 2; // 기본 자리의 위쪽 끝 (화면 위에서)
        this.drag.y = Math.max(-top + 4, Math.min(H - h - 4 - top, this.drag.y));
        this.bannerRT.setSizeAndPosition(w, h, this.drag.x, baseY + this.drag.y);
    }

    moveBanner(dx, dy) {
        this.drag.x += dx;
        this.drag.y += dy;
        this.placeBanner();
    }

    begin(request) {
        if (this.active) this.cancel(true);
        this.request = { radius: 0, includeSelf: false, taps: 2, color: "#ff8a30", verb: "시전", ...request };
        this.aim = this.request.self ? { x: this.player.x, y: this.player.y } : null; // 나에게 쓰는 카드는 처음부터 내 칸
        this.hover = null;
        this.player.clearGoal();
        this.banner.setActive(true);
        this.castButton.text.setText(this.request.verb);
        // 카드면 설명과 [묘지로] 버튼
        const card = this.request.card;
        this.discardButton.go.setActive(!!card);
        const width = this.engine.width / this.engine.uiRoot.scale;
        const w = card ? Math.min(320, width - 24) : 260;
        let lines = 0;
        let termLines = 0;
        if (card) {
            const cost = CardDef.costText(card.cost);
            const body = card.text(false); // 전투 중: 수치만 ("5 피해")
            const text = `${cost ? `(${cost}) ` : ""}${body}`;
            this.desc.setText(text);
            lines = this.desc.measureLines(this._ctx, w - 20);
            const terms = CardInspector.enabled() ? CardText.glossary(body) : "";
            this.terms.setText(terms);
            termLines = terms ? this.terms.measureLines(this._ctx, w - 20) : 0;
            this.discardButton.text.setText(card.isSkill ? "묘지로" : "버리기");
        } else {
            this.desc.setText("");
            this.terms.setText("");
        }
        this.layoutBanner(w, lines, termLines);
        // 좁은 화면에선 패널이 방을 가리므로 닫는다
        if (this.engine.width < 600 && SidePanel.current) SidePanel.current.setOpen(false);
        if (this.request.message) MessageLog.add(this.request.message, "#e8b840");
    }

    // 고른 카드를 버린다 (행동 카드는 묘지로, 아이템은 없어진다. 턴 안 씀)
    discardCard() {
        const card = this.card;
        if (!card) return;
        this.cancel(true);
        if (!this.player.cards.discard(card)) return;
        if (!card.isSkill) MessageLog.add(`${josa(card.name, "을를")} 버렸다`, "#e8c860");
    }

    // 칸이 필요 없는 카드: 내 칸만 고를 수 있다 (나를 누르거나 [사용])
    beginSelf(card) {
        const p = this.player;
        this.begin({
            name: card.name, card, range: 0, radius: 0, includeSelf: true, self: true,
            taps: 1, verb: "사용", color: "#7cd47c",
            tiles: new Set([`${p.x},${p.y}`]),
            valid: () => this.player.cards.hand.includes(card),
            onConfirm: () => { this.player.requestCard(card); }
        });
    }

    // 칸을 고르는 카드 (card.target { range, radius, walk?, line?, color? }). 칸이 필요 없는 카드면 beginSelf
    //   walk: 걸어서 갈 수 있는 칸만 (이동 카드) / line: 상하좌우 일직선 칸만 (찌르기)
    beginCard(card) {
        const t = card.target;
        if (!t) return this.beginSelf(card);
        if (t.walk && this.player.root > 0) {
            MessageLog.add(`속박되어 이동 카드를 쓸 수 없다 (${this.player.root}턴 남음)`, "#c8b890");
            return;
        }
        let tiles = t.walk ? new Set(ActionCards.reachable(this.world, this.player, t.range).keys()) : null;
        if (t.line) {
            tiles = new Set();
            const p = this.player;
            for (const [dx, dy] of Entity.DIRS) for (let i = 1; i <= t.range; i++) tiles.add(`${p.x + dx * i},${p.y + dy * i}`);
        }
        if (t.tiles) tiles = new Set(t.tiles(this.world)); // 정해진 칸만 (CardKit: 빈칸 등)
        if (tiles && !tiles.size) {
            MessageLog.add(`${card.name}: 고를 수 있는 칸이 없다`, "#c8b890");
            return;
        }
        this.begin({
            name: card.name, card, range: t.range, radius: t.radius ?? 0,
            taps: t.taps ?? 2, verb: t.verb ?? "시전", color: t.color ?? "#ff8a30",
            tiles,
            message: `${josa(card.name, "을를")} 쓸 칸을 고른다`,
            valid: () => this.player.cards.hand.includes(card),
            onConfirm: (target) => { this.player.requestCard(card, target); }
        });
    }

    cancel(silent = false) {
        if (!this.active) return;
        this.request = null;
        this.aim = null;
        this.banner.setActive(false);
        if (!silent) MessageLog.add("취소했다", "#c8b890");
    }

    inRange(x, y) {
        const r = this.request;
        const d = Math.abs(x - this.player.x) + Math.abs(y - this.player.y);
        if (d === 0) return r.includeSelf;
        if (r.tiles) return r.tiles.has(`${x},${y}`);
        return d <= r.range;
    }

    // 효과가 닿는 칸들 (정사각형 반경)
    area(x, y) {
        const r = this.request.radius;
        const tiles = [];
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) tiles.push([x + dx, y + dy]);
        }
        return tiles;
    }

    // 월드 칸을 탭했을 때
    tap(x, y) {
        if (!this.inRange(x, y)) {
            MessageLog.add("사거리 밖이다", "#c8b890");
            return;
        }
        const again = this.aim && this.aim.x === x && this.aim.y === y;
        this.aim = { x, y };
        if (again || this.request.taps === 1) this.confirm();
    }

    confirm() {
        if (!this.active || !this.aim) return;
        const { onConfirm } = this.request;
        const target = this.aim;
        this.request = null;
        this.aim = null;
        this.banner.setActive(false);
        onConfirm(target);
    }

    update() {
        if (!this.active) return;
        const r = this.request;
        if (!this.player.alive || (r.valid && !r.valid()) || Modal.isOpen) return this.cancel();
        if (Input.getButtonDown("cancel")) return this.cancel();
        if (Input.getKeyDown("Enter")) return this.confirm();

        // 마우스를 올린 칸 (UI 위가 아닐 때)
        const p = Input.pointer;
        this.hover = null;
        if (p && p.type === "mouse" && !UIEventSystem.raycast(p.position.x, p.position.y)) {
            const w = Camera.main.screenToWorld(p.position.x, p.position.y);
            const t = this.world.tileSize;
            this.hover = { x: Math.round(w.x / t), y: Math.round(w.y / t) };
        }

        const where = r.self ? "나를 누르거나 [사용]" : r.card && r.card.target && r.card.target.line ? `일직선 ${r.range}칸 안의 칸` : r.tiles ? (r.card && r.card.target && r.card.target.walk ? `걸어서 ${r.range}칸 안의 칸` : `${r.range}칸 안의 빈칸`) : r.range <= 1 ? (r.includeSelf ? "내 칸이나 바로 옆 칸" : "바로 옆 칸") : `${r.range}칸 안의 칸`;
        this.label.setText(r.self ? `${r.name}: ${where}` : this.aim && r.taps > 1 ? `${r.name}: 한 번 더 누르면 ${r.verb}` : `${r.name}: ${where}을 고르기`);
        this.castButton.text.color = this.aim ? UIKit.COLORS.text : UIKit.COLORS.faint;
    }
}

// 대상 지정 표시: 사거리 칸(옅게), 마우스를 올린 칸의 범위(중간), 조준한 칸의 범위(진하게 + 중심 테두리)
class TargetOverlay extends Renderer {
    constructor(targeting) {
        super();
        this.targeting = targeting;
        this.sortingLayer = "Default";
        this.orderInLayer = 1; // 청크(0) 위, 엔티티(2) 아래
    }

    getBounds(out) {
        return null;
    }

    render(ctx, camera) {
        const tg = this.targeting;
        if (!tg.active) return;
        const req = tg.request;
        const p = tg.player;
        const t = tg.world.tileSize;
        const m = camera.viewMatrix;
        ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);

        const fill = (tiles, color, alpha) => {
            ctx.globalAlpha = alpha;
            ctx.fillStyle = color;
            for (const [x, y] of tiles) ctx.fillRect(x * t - t / 2, y * t - t / 2, t, t);
        };

        const r = req.range;
        const range = [];
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                if (Math.abs(dx) + Math.abs(dy) <= r && tg.inRange(p.x + dx, p.y + dy)) range.push([p.x + dx, p.y + dy]);
            }
        }
        fill(range, "#e8d9b8", 0.22);

        const h = tg.hover;
        if (h && !(tg.aim && tg.aim.x === h.x && tg.aim.y === h.y)) {
            const ok = tg.inRange(h.x, h.y);
            fill(ok ? tg.area(h.x, h.y) : [[h.x, h.y]], ok ? "#e8b840" : "#d8443c", 0.25);
        }

        if (tg.aim) {
            fill(tg.area(tg.aim.x, tg.aim.y), req.color, 0.45);
            ctx.globalAlpha = 1;
            ctx.strokeStyle = "#fff0c0";
            ctx.lineWidth = 1 / camera.effectiveZoom * 2;
            ctx.strokeRect(tg.aim.x * t - t / 2, tg.aim.y * t - t / 2, t, t);
        }
        ctx.globalAlpha = 1;
    }
}

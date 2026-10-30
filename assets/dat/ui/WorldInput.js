// 화면(방) 터치/클릭 처리, 줌.
// - 짧게 탭: 칸 지정 중이면 그 칸을 고른다. 아니면 Player.setGoal (적이 없는 방에서만 걸어간다, 바로 옆 상호작용 대상은 쓴다)
// - 한 손가락 드래그: 화면만 끈다.
// - 두 손가락 / 마우스 휠 / + - 키: 줌 (손가락 가운데·커서 아래 지점을 기준으로). UI 위에서 굴린 휠은 무시한다.
// - F 키: 방 전체가 보이게 다시 맞춘다 (Run.fitCamera).
// 줌은 소수 배율(월드 1픽셀 = 화면 n픽셀)이고, 휠/키는 한 번에 일정 비율씩, 두 손가락은 거리 비율 그대로 바뀐다.
// UI가 먼저 잡은 포인터(consumed)는 건드리지 않는다.
class WorldInput extends Component {
    static ICON_ON = 6;
    static ICON_OFF = 7;

    // options: { engine, world, player, camera(CameraFollow), targeting, run, minZoom, maxZoom }
    constructor(options) {
        super();
        this.engine = options.engine;
        this.world = options.world;
        this.player = options.player;
        this.camera = options.camera;
        this.targeting = options.targeting; // 대상 지정 중이면 탭을 그쪽으로 넘긴다
        this.run = options.run ?? null;
        this.minZoom = options.minZoom ?? 1;
        this.maxZoom = options.maxZoom ?? 12;
        this.wheelSpeed = options.wheelSpeed ?? 0.0015; // 휠 deltaY 100(마우스 한 칸)이면 약 1.16배
        this.keyStep = options.keyStep ?? 1.25;          // + - 키 한 번에 곱하는 배율
        this._gestures = new Map(); // pointerId -> { drag, pinch }
        this._pinch = null;
    }

    start() {
        Input.defineButton("follow", ["KeyF"]);
        Input.defineButton("zoomIn", ["Equal", "NumpadAdd"]);
        Input.defineButton("zoomOut", ["Minus", "NumpadSubtract"]);

        this.addComponent(new GoalMarker(this.player, this.world.tileSize));
    }

    static region(col, row) {
        return { x: col * 16, y: row * 16, width: 16, height: 16 };
    }

    setFollow(value) {
        this.camera.follow = value;
    }

    update() {
        if (Input.getButtonDown("follow") && this.run) this.run.fitCamera(true);
        if (Input.getButtonDown("zoomIn")) this.smoothZoomBy(this.keyStep, this.screenCenter());
        if (Input.getButtonDown("zoomOut")) this.smoothZoomBy(1 / this.keyStep, this.screenCenter());
        this.updateWheel();

        for (const p of Input.pointers) {
            if (p.pressed && !p.consumed && p.button === 0) this._gestures.set(p.id, { drag: false, pinch: false });
        }
        for (const id of [...this._gestures.keys()]) {
            if (!Input.getPointer(id)) this._gestures.delete(id);
        }

        const held = Input.pointers.filter((p) => p.held && this._gestures.has(p.id));
        if (held.length >= 2) this.updatePinch(held[0], held[1]);
        else this._pinch = null;

        for (const p of Input.pointers) {
            const g = this._gestures.get(p.id);
            if (!g) continue;

            // 두 손가락에 한 번이라도 쓰인 포인터는 탭/드래그로 치지 않는다
            if (!g.pinch && !this._pinch) {
                if (!g.drag && p.dragDistance > Input.dragThreshold) {
                    g.drag = true;
                    if (this.camera.follow) this.setFollow(false);
                }
                if (g.drag && (p.delta.x !== 0 || p.delta.y !== 0)) this.pan(p.delta);
            }
            if (p.released) {
                this._gestures.delete(p.id);
                if (!g.drag && !g.pinch) this.tap(p.position);
            }
        }
    }

    updatePinch(a, b) {
        this._gestures.get(a.id).pinch = true;
        this._gestures.get(b.id).pinch = true;
        const dist = a.position.distance(b.position);
        const mid = new Vector((a.position.x + b.position.x) / 2, (a.position.y + b.position.y) / 2);

        const pinch = this._pinch;
        if (!pinch || pinch.a !== a.id || pinch.b !== b.id) {
            this._pinch = { a: a.id, b: b.id, dist: Math.max(dist, 1), zoom: Camera.main.effectiveZoom };
            return;
        }
        this.zoomTo(pinch.zoom * dist / pinch.dist, mid);
        if (!this.camera.follow) this.pan(new Vector((a.delta.x + b.delta.x) / 2, (a.delta.y + b.delta.y) / 2));
    }

    // 휠은 UI 위가 아닐 때만. 굴린 양에 비례해서 연속으로 바뀌어 트랙패드도 부드럽다
    updateWheel() {
        if (Input.wheel === 0) return;
        const p = Input.pointerPosition;
        if (UIEventSystem.raycast(p.x, p.y)) return;
        this.zoomBy(Math.exp(-Input.wheel * this.wheelSpeed), p); // 휠을 아래로 굴리면(+) 축소
    }

    screenCenter() {
        return new Vector(this.engine.width / 2, this.engine.height / 2);
    }

    zoomBy(factor, screenPoint) {
        this._zoomTween?.stop();
        this._zoomTween = null;
        this.zoomTo(Camera.main.effectiveZoom * factor, screenPoint);
    }

    // 키로 한 단계씩 줌: 0.15초 동안 부드럽게. 연달아 누르면 목표에서 이어서 곱한다
    smoothZoomBy(factor, screenPoint, duration = 0.15) {
        const from = Camera.main.effectiveZoom;
        const base = this._zoomTween && !this._zoomTween.finished ? this._zoomGoal : from;
        const goal = Math.min(Math.max(base * factor, this.minZoom), this.maxZoom);
        this._zoomTween?.stop();
        this._zoomGoal = goal;
        // 배율은 곱셈이라 로그 공간에서 보간해야 속도가 고르다
        this._zoomTween = Tween.value(Math.log(from), Math.log(goal), duration, (v) => this.zoomTo(Math.exp(v), screenPoint), {
            ease: "outQuad",
            unscaled: true,
            owner: this
        });
    }

    // 배율을 바꾼다. 추적이 꺼져 있으면 screenPoint 아래 월드 지점이 그 자리에 남도록 카메라를 옮긴다.
    zoomTo(level, screenPoint) {
        const cam = Camera.main;
        const next = Math.min(Math.max(level, this.minZoom), this.maxZoom);
        if (next === cam.effectiveZoom) return;

        const anchor = cam.screenToWorld(screenPoint.x, screenPoint.y);
        cam.setPixelZoom(next);
        if (this.camera.follow) return;

        const r = this.engine.pixelRatio;
        const x = anchor.x - (screenPoint.x - this.engine.width / 2) * r / next;
        const y = anchor.y + (screenPoint.y - this.engine.height / 2) * r / next;
        const p = this.camera.transform.position;
        this.camera.pan(x - p.x, y - p.y);
    }

    // 화면 픽셀만큼 끈 걸 월드 단위로 바꿔 카메라를 반대로 민다 (손가락 아래 지점이 따라오게)
    pan(delta) {
        const k = this.engine.pixelRatio / Camera.main.effectiveZoom;
        this.camera.pan(-delta.x * k, delta.y * k);
    }

    tap(position) {
        const p = this.player;
        if (!p.alive) return;
        const w = Camera.main.screenToWorld(position.x, position.y);
        const t = this.world.tileSize;
        const x = Math.round(w.x / t);
        const y = Math.round(w.y / t);
        if (this.targeting && this.targeting.active) this.targeting.tap(x, y);
        else if (!(x === p.x && y === p.y)) p.setGoal(x, y);
    }
}

// 탭한 목표 칸에 모서리 표시. 엔티티를 노리면 빨간색.
class GoalMarker extends Renderer {
    constructor(player, tileSize) {
        super();
        this.player = player;
        this.tileSize = tileSize;
        this.sortingLayer = "Foreground";
    }

    getBounds(out) {
        return null;
    }

    render(ctx, camera) {
        const g = this.player.goal;
        if (!g) return;
        const m = camera.viewMatrix;
        ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);

        const t = this.tileSize;
        const x0 = g.x * t - t / 2;
        const y0 = g.y * t - t / 2;
        const x1 = x0 + t;
        const y1 = y0 + t;
        const len = 4;
        ctx.fillStyle = g.entity ? "#e0483e" : "#f0e6cc";
        ctx.globalAlpha = 0.9;
        for (const [cx, cy, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
            ctx.fillRect(sx > 0 ? cx : cx - len, sy > 0 ? cy : cy - 1, len, 1);
            ctx.fillRect(sx > 0 ? cx : cx - 1, sy > 0 ? cy : cy - len, 1, len);
        }
        ctx.globalAlpha = 1;
    }
}

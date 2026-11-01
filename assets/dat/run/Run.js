// 런 하나 (던전 3층, 층마다 우두머리). 아이작식: 한 층은 격자로 이어진 방들이고, 시작 방에서 출발해 지도에서 갈 방을 고르며 탐색한다.
//   지도(MapScreen) → 방 입장(enter) → 전투·거래·휴식 → 적을 다 쓰러뜨리면 출구가 열리고 보상(RewardDialog) → 출구(leaveRoom) → 지도 …
// 지도에는 가 본 방과 그 옆 방만 보이고 (RunMap.choices), 보인 방은 어디든 다시 갈 수 있다. 정리한 방은 적이 없고, 쓴 휴식·상자·산 물건은 그대로다 (rooms).
// 우두머리를 쓰러뜨리면 지도에서 [다음 층으로] 내려갈 수 있다 (descend). 남은 방을 더 둘러봐도 된다. 마지막 층 우두머리를 쓰러뜨리고 나가면 이긴다.
// 방은 들어갈 때마다 새로 만들고(RoomPlan + ChunkManager), 나가면 버린다. 저장은 방 사이에서만 한다 (방 안에서 끄면 그 방에 다시 들어간다).
// 모든 무작위는 런 시드에서 나온다: 지도, 방 모양·적·상점 물건, 보상, 덱 섞기(room 마다), 전투 중 무작위(room.rng).
// 그래서 방 안에서 새로고침하면 그 방에 처음 들어온 때와 똑같이 다시 시작한다.
// 쓰러지면 런이 끝나고 저장본이 지워진다. 우두머리를 쓰러뜨리면 이긴다.
class Run extends Component {
    static OPENING_HAND = 3; // 전투방에 들어가면 뽑는 처음 패
    static ROOM_MANA = 5;    // 전투방에 들어갈 때 차는 마나
    static REMOVE_BASE = 50; // 상점 카드 빼기 값: 한 상점에서 뺄 때마다 +25 (50 → 75 → 100 …), 다른 상점에 가면 다시 50

    // options: { engine, player, queue, follow(CameraFollow), meta: { seed, debug }, save }
    constructor(options) {
        super();
        this.engine = options.engine;
        this.player = options.player;
        this.queue = options.queue;
        this.follow = options.follow;
        this.seed = options.meta.seed;
        this.debug = !!options.meta.debug;
        this.floorNo = 1;      // 지금 층 (1~RunMap.FLOORS)
        this.map = new RunMap(this.seed, 1);
        this.rooms = {};       // 이 층에서 다녀간 방의 기록 id → { cleared, used, sold:[…] }
        this.current = null;   // 마지막으로 들어간(끝낸) 칸 id
        this.visited = [];     // 이 층에서 가 본 칸 id들
        this.pending = null;   // 고르고 아직 못 끝낸 칸 (방 안에서 저장하고 껐을 때 다시 들어간다)
        this.removeCount = 0;  // 이 상점에서 카드 빼기를 한 횟수 (값이 오른다, 방에 들어갈 때 0)
        this.room = null;      // 지금 방 (ChunkManager)
        this.plan = null;      // 지금 방 설계도
        this.node = null;      // 지금 방의 칸
        this.cleared = false;
        this.state = "map";    // map | room | over | won
        this.ui = {};          // { map, reward, shop, rest, end } — main.js가 채운다
        this.view = Run.worldView(this);
        if (options.save) this.load(options.save);
    }

    // TurnManager·UI가 들고 있는 world: 지금 방(ChunkManager)으로 이어진다. 방이 바뀌어도 그대로 쓴다
    static worldView(run) {
        return new Proxy({}, {
            get(t, key) {
                const room = run.room;
                if (key === "run") return run;
                if (!room) return key === "tileSize" ? 16 : key === "hostiles" ? () => [] : undefined;
                const value = room[key];
                return typeof value === "function" ? value.bind(room) : value;
            },
            set(t, key, value) {
                if (run.room) run.room[key] = value;
                return true;
            }
        });
    }

    get floor() {
        return this.floorNo;
    }

    // 방마다 다른 숫자 (시드 섞기용). 층과 방 번호
    salt(node) {
        return this.floorNo * 1000 + node.col + 1;
    }

    // 이 층의 우두머리를 쓰러뜨렸는가
    get bossCleared() {
        const b = this.map.boss;
        return !!(b && this.rooms[b.id] && this.rooms[b.id].cleared);
    }

    // 지도에서 다음 층으로 내려갈 수 있는가 (우두머리를 쓰러뜨렸고 마지막 층이 아니다)
    get canDescend() {
        return this.state === "map" && this.bossCleared && this.floorNo < RunMap.FLOORS;
    }

    // 카드 빼기 값
    get removeCost() {
        return Run.REMOVE_BASE + 25 * this.removeCount;
    }

    // 지금 고를 수 있는 칸들
    choices() {
        return this.state === "map" ? this.map.choices(this.current, this.visited) : [];
    }

    // 게임 시작: 저장본에 못 끝낸 방이 있으면 그 방으로, 아니면 지도
    begin() {
        if (this.pending) this.enter(this.pending, true);
        else if (!this.visited.length) this.enter(this.map.start.id, true); // 새 층: 시작 방에서
        else this.showMap();
    }

    showMap() {
        this.state = "map";
        if (this.ui.map) this.ui.map.open(true);
    }

    // 방 들어가기
    enter(id, resumed = false) {
        const node = this.map.get(id);
        if (!node) return false;
        if (!resumed && !this.choices().some((n) => n.id === id)) return false;
        if (this.ui.map) this.ui.map.close();
        this.pending = id;
        this.node = node;
        this.cleared = false;
        this.state = "room";
        this.save();

        this.removeCount = 0; // 카드 빼기 값은 상점마다 처음부터
        // 이전 방을 버리고 새 방
        const player = this.player;
        if (this.room) {
            if (player.world === this.room) this.room.removeEntity(player);
            this.room.gameObject.destroy();
        }
        const salt = this.salt(node);
        const known = this.rooms[id] ?? null;
        const plan = new RoomPlan(node, Rng.mix(this.seed, salt), known);
        this.plan = plan;
        const room = new ChunkManager({ chunkSize: 16, tileSize: 16, renderDistance: 48, generator: plan });
        room.plan = plan;
        room.rng = Rng.make(Rng.mix(this.seed, 11000 + salt));          // 전투 중 무작위 (무작위 대상, 바위 던지기 …)
        player.cards.rng = Rng.make(Rng.mix(this.seed, 9000 + salt));   // 덱 섞기
        const go = new GameObject("room " + id);
        go.addComponent(room);
        this.engine.add(go);
        room.loadAround(plan.start.x, plan.start.y);
        this.room = room;

        player.x = plan.start.x;
        player.y = plan.start.y;
        player.flipX = false;
        room.addEntity(player);
        room.focus = player;
        player.sync();
        player.applyFlip();
        player.enterRoom();
        this.exit = room.entitiesAt(plan.exit.x, plan.exit.y).find((e) => e instanceof Exit) ?? null;

        const info = RunMap.TYPES[node.type];
        MessageLog.add(`${this.floorNo}층 · ${info.name}`, info.color);
        if (plan.combat && known && known.cleared) {
            // 이미 정리한 방: 적 없이 출구가 열려 있다
            this.cleared = true;
            if (this.exit) this.exit.setOpen(true);
            MessageLog.add("이미 정리한 방이다", "#a0d0a0");
        } else if (plan.combat) {
            player.mana = Math.min(player.maxMana, player.mana + Run.ROOM_MANA);
            player.cards.resetForRoom(Run.OPENING_HAND);
            Equip.roomStart(player, room); // 장착한 장비 (철모, 마력석 마법서 …)
            MessageLog.add(node.type === "boss" ? "우두머리다! 쓰러뜨리면 다음 층으로 내려갈 수 있다" : "적을 모두 쓰러뜨리면 출구가 열린다", "#e8b860");
        } else {
            this.cleared = true;
            if (this.exit) this.exit.setOpen(true);
            MessageLog.add({ shop: "상인이 있다. 말을 걸어 보자 (탭하면 걸어간다)", rest: "모닥불이 있다. 한 번 쉴 수 있다", treasure: "보물 상자가 있다!", start: "던전의 시작이다. 출구로 나가 지도에서 갈 방을 고르자" }[node.type] ?? "", "#a0d0f0");
        }
        EnemyMoves.planAll(room, player, 0); // 적의 첫 의도
        this.fitCamera(true);
        Events.emit(GameEvent.ROOM_ENTERED, { node, room });
        return true;
    }

    // 출구로 나가기 (열린 출구를 쓰면 Exit.interact가 부른다)
    leaveRoom() {
        if (!this.cleared || this.state !== "room") return false;
        const node = this.node;
        this.rooms[node.id] = this.captureRoom();
        this.current = node.id;
        if (!this.visited.includes(node.id)) this.visited.push(node.id);
        this.pending = null;
        if (node.type === "boss" && this.floorNo >= RunMap.FLOORS) return this.end(true); // 마지막 층 우두머리: 이겼다
        this.save();
        this.showMap();
        return true;
    }

    // 지금 방의 기록 (나갈 때 남긴다): 정리했는가, 휴식·상자를 썼는가, 산 물건
    captureRoom() {
        const st = { ...(this.rooms[this.node.id] ?? {}) };
        if (this.plan.combat && this.cleared) st.cleared = true;
        for (const e of this.room.actors) {
            if (e instanceof Merchant) st.sold = e.stock.map((o, i) => (o.sold ? i : -1)).filter((i) => i >= 0);
        }
        for (const s of this.plan.spawns) {
            if (s.type !== "campfire" && s.type !== "treasure") continue;
            for (const e of this.room.entitiesAt(s.x, s.y)) if ((e instanceof Campfire && e.used) || (e instanceof TreasureChest && e.opened)) st.used = true;
        }
        return st;
    }

    // 그 층의 시작 방으로 (디버그: 우두머리를 안 잡아도, 층을 건너뛰어도 된다)
    gotoFloor(n) {
        this.floorNo = Math.max(1, Math.min(RunMap.FLOORS, n));
        this.map = new RunMap(this.seed, this.floorNo);
        this.rooms = {};
        this.visited = [];
        this.current = null;
        this.pending = null;
        this.state = "map";
        this.enter(this.map.start.id, true);
    }

    // 다음 층으로 (지도에서 [다음 층으로])
    descend() {
        if (!this.canDescend) return false;
        this.floorNo++;
        this.map = new RunMap(this.seed, this.floorNo);
        this.rooms = {};
        this.visited = [];
        this.current = null;
        this.pending = null;
        MessageLog.add(`${this.floorNo}층으로 내려왔다`, "#f0d878");
        this.enter(this.map.start.id, true);
        return true;
    }

    // 이미 가진 장비 id들 (보상에 같은 장비가 또 나오지 않게)
    ownedGear() {
        return this.player.cards.hand.filter((c) => c.def.gear).map((c) => c.defId);
    }

    // 보물 상자를 열었다
    openTreasure(chest) {
        const r = Rewards.treasure(Rng.make(Rng.mix(this.seed, 7000 + this.salt(this.node))), this.node.row, this.ownedGear());
        this.ui.reward.open({ title: "보물 상자", ...r });
    }

    // 런 끝 (won: 우두머리를 쓰러뜨렸다)
    end(won) {
        if (this.state === "over" || this.state === "won") return;
        this.state = won ? "won" : "over";
        RunStore.clear();
        Events.emit(GameEvent.RUN_ENDED, { won, floor: this.floor });
        if (this.ui.end) this.ui.end.open(won, this);
        return true;
    }

    update() {
        if (!this.started) {
            if (!this.ui.map || !this.ui.map.root) return; // UI가 아직 안 만들어졌다
            this.started = true;
            this.begin();
        }
        if (this.state !== "room" || !this.room) return;
        const p = this.player;
        if (!p.alive) {
            if (!this.queue.busy) this.end(false);
            return;
        }
        this.fitCamera();
        // 적을 모두 쓰러뜨렸다: 출구가 열리고 보상
        if (!this.cleared && this.plan.combat && !this.queue.busy && this.room.hostiles(p).length === 0) {
            this.cleared = true;
            if (this.exit) this.exit.setOpen(true);
            Events.emit(GameEvent.ROOM_CLEARED, { node: this.node, room: this.room });
            if (this.node.type === "boss") {
                const last = this.floorNo >= RunMap.FLOORS;
                MessageLog.add(last ? "우두머리를 쓰러뜨렸다! 출구로 나가면 던전을 클리어한다" : "우두머리를 쓰러뜨렸다! 남은 방을 둘러봐도 되고, 지도에서 다음 층으로 내려갈 수 있다", "#f0d878");
                this.rooms[this.node.id] = this.captureRoom(); // 우두머리 처치를 바로 기록 (지도에서 내려갈 수 있게)
                this.ui.reward.open({ title: "우두머리 처치 보상", ...Rewards.boss(Rng.make(Rng.mix(this.seed, 5000 + this.salt(this.node))), this.node.row, this.ownedGear()) });
                return;
            }
            MessageLog.add("방을 정리했다. 출구가 열렸다", "#a0d0a0");
            const r = Rewards.battle(Rng.make(Rng.mix(this.seed, 5000 + this.salt(this.node))), this.node.type, this.node.row, this.ownedGear());
            this.ui.reward.open({ title: this.node.type === "elite" ? "정예 처치 보상" : "전투 보상", ...r });
        }
    }

    // ---------- 카메라 ----------
    // 방 전체가 화면(위 HUD와 아래 패 사이)에 들어오게 배율과 위치를 맞춘다. 크기가 바뀔 때만 (force면 늘)
    fitCamera(force = false) {
        if (!this.plan) return;
        const e = this.engine;
        const key = e.canvas.width + "x" + e.canvas.height;
        if (!force && key === this._fitKey) return;
        this._fitKey = key;
        const s = e.uiRoot.scale;
        const W = e.canvas.width;
        const H = e.canvas.height;
        const top = Run.TOP_RESERVE * s;
        const bottom = (typeof HandBar !== "undefined" ? HandBar.HEIGHT : 150) * s;
        const t = 16;
        const roomW = (this.plan.w + 2) * t;
        const roomH = (this.plan.h + 2) * t;
        const avail = Math.max(H * 0.35, H - top - bottom);
        const z = Math.max(0.5, Math.min(W / roomW, avail / roomH) * 0.96);
        Camera.main.setPixelZoom(z);
        const cx = (this.plan.w + 1) * t / 2;
        const cy = (this.plan.h + 1) * t / 2;
        const availCenter = top + avail / 2; // 화면 위에서부터 (기기 픽셀)
        const shift = (H / 2 - availCenter) / z;
        this.follow.follow = false;
        this.follow.bounds = null;
        this.follow.transform.setPosition(cx, cy - shift);
    }

    static TOP_RESERVE = 64; // 위 HUD가 차지하는 높이 (UI 단위)

    // ---------- 저장 ----------
    snapshot() {
        return {
            version: RunStore.VERSION, seed: this.seed, debug: this.debug,
            floorNo: this.floorNo, rooms: this.rooms,
            current: this.current, visited: this.visited, pending: this.pending, removeCount: this.removeCount,
            player: this.player.save()
        };
    }

    save() {
        if (this.state === "over" || this.state === "won") return false;
        return RunStore.save(this.snapshot());
    }

    load(data) {
        this.floorNo = data.floorNo ?? 1;
        this.map = new RunMap(this.seed, this.floorNo);
        this.rooms = data.rooms ?? {};
        this.current = data.current ?? null;
        this.visited = data.visited ?? [];
        this.pending = data.pending ?? null;
        this.removeCount = data.removeCount ?? 0;
        this.player.load(data.player);
    }
}

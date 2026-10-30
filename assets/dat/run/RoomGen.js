// 방 설계도. 지도에서 고른 칸(노드)마다 방 하나를 만든다: 입구 → 공간 → 출구.
// 방은 무적 벽 타일로 둘러싸인 직사각형이다. 안쪽 칸은 x 1..w, y 1..h (0과 w+1, h+1이 벽).
// 입구는 왼쪽 벽 가운데 안쪽, 출구는 오른쪽 벽 가운데 안쪽. 플레이어는 입구 바로 오른쪽에서 시작한다.
// 전투방에는 기둥(벽 타일)이 몇 개 서고, 입구에서 출구·모든 칸까지 길이 이어지는지 확인한다.
// ChunkManager의 generator로 쓴다: fillTiles(chunk), populate(chunk)
class RoomPlan {
    // 방 종류별 크기·바닥
    static STYLE = {
        battle: { w: 11, h: 7, floor: TileDef.FLOOR, wall: TileDef.WALL, pillars: [0, 3] },
        elite: { w: 13, h: 8, floor: TileDef.CAVE_FLOOR, wall: TileDef.CAVE_WALL, pillars: [1, 4] },
        boss: { w: 13, h: 9, floor: TileDef.CAVE_FLOOR, wall: TileDef.CAVE_WALL, pillars: [2, 4] },
        shop: { w: 9, h: 6, floor: TileDef.PLANKS, wall: TileDef.WALL, pillars: [0, 0] },
        rest: { w: 9, h: 6, floor: TileDef.GRASS, wall: TileDef.CAVE_WALL, pillars: [0, 0] },
        treasure: { w: 9, h: 6, floor: TileDef.FLOOR, wall: TileDef.WALL, pillars: [0, 0] }
    };

    // 방에 나오는 적은 공방 데이터(EnemyData)에서 고른다: 층에 맞는 적들 중, 위험도(threat) 예산 안에서 무작위로.
    // 설명(note)의 "(2~3마리)" 같은 말은 무리 크기가 된다.
    static BUDGET = { battle: [40, 4], elite: [22, 2] }; // [기본, 층(row)마다 +]
    static MAX_ENEMIES = 5;

    // 예산 안에서 적 id 목록 (한 번에 무리 단위로 더한다)
    static pickEnemies(rng, floor, budget, maxCount = RoomPlan.MAX_ENEMIES) {
        const pool = EnemyData.at(floor);
        const out = [];
        let spent = 0;
        for (let tries = 0; tries < 16 && out.length < maxCount && pool.length; tries++) {
            const r = Rng.pick(rng, pool);
            const n = Math.min(maxCount - out.length, Rng.int(rng, r.group[0], r.group[1]));
            const cost = r.threat * n;
            if (spent + cost > budget) continue;
            for (let i = 0; i < n; i++) out.push(r.id);
            spent += cost;
            if (spent >= budget * 0.8) break;
        }
        if (out.length) return out;
        const weakest = pool.slice().sort((a, b) => a.threat - b.threat)[0];
        return [weakest ? weakest.id : "rat"];
    }

    // node: RunMap 칸, seed: 방 시드
    constructor(node, seed) {
        this.node = node;
        this.type = node.type;
        this.rng = Rng.make(seed);
        const st = RoomPlan.STYLE[this.type];
        this.w = st.w;
        this.h = st.h;
        this.style = st;
        const mid = Math.ceil(this.h / 2);
        this.entrance = { x: 1, y: mid };
        this.start = { x: 2, y: mid };
        this.exit = { x: this.w, y: mid };
        this.lv = 1 + Math.floor(node.row / 6) + (this.type === "boss" ? 1 : 0);
        this.walls = new Set(); // 기둥 "x,y"
        this.spawns = [];       // [{ type, x, y, data }]
        this.layout();
    }

    // 몬스터·주민 유무
    get combat() {
        return this.type === "battle" || this.type === "elite" || this.type === "boss";
    }

    // 방 전체 경계 (카메라용, 월드 단위). 타일 중심이 x*t라서 반 칸씩 넓힌다
    bounds(t) {
        return { minX: -t / 2, minY: -t / 2, maxX: (this.w + 1) * t + t / 2, maxY: (this.h + 1) * t + t / 2 };
    }

    inside(x, y) {
        return x >= 1 && x <= this.w && y >= 1 && y <= this.h;
    }

    isWall(x, y) {
        return !this.inside(x, y) || this.walls.has(x + "," + y);
    }

    layout() {
        const rng = this.rng;
        const reserved = new Set([this.entrance, this.start, this.exit, { x: this.exit.x - 1, y: this.exit.y }].map((p) => p.x + "," + p.y));
        // 기둥: 입구·출구 근처는 비우고, 놓아도 모든 바닥이 이어질 때만
        const [pmin, pmax] = this.style.pillars;
        const want = Rng.int(rng, pmin, pmax);
        for (let tries = 0; this.walls.size < want && tries < 60; tries++) {
            const x = Rng.int(rng, 3, this.w - 2);
            const y = Rng.int(rng, 1, this.h);
            const k = x + "," + y;
            if (reserved.has(k) || this.walls.has(k)) continue;
            this.walls.add(k);
            if (!this.connected()) this.walls.delete(k);
        }
        const free = [];
        for (let y = 1; y <= this.h; y++) for (let x = 1; x <= this.w; x++) {
            const k = x + "," + y;
            if (!this.walls.has(k) && !reserved.has(k)) free.push({ x, y });
        }
        const right = Rng.shuffle(rng, free.filter((p) => p.x >= Math.ceil(this.w / 2) + 1));
        const center = { x: Math.ceil(this.w / 2) + 1, y: Math.ceil(this.h / 2) };

        this.spawns.push({ type: "entrance", ...this.entrance }, { type: "exit", ...this.exit });
        const lv = this.lv;
        const floor = this.node.row + 1;
        if (this.type === "battle") {
            const [base, per] = RoomPlan.BUDGET.battle;
            for (const kind of RoomPlan.pickEnemies(rng, floor, base + per * this.node.row)) this.spawns.push({ type: kind, ...right.pop(), data: { lv } });
        } else if (this.type === "elite") {
            const pool = EnemyData.at(floor).slice().sort((a, b) => b.threat - a.threat);
            const lead = Rng.pick(rng, pool.slice(0, Math.max(1, Math.ceil(pool.length / 2))));
            this.spawns.push({ type: lead.id, ...right.pop(), data: { lv, rank: "elite" } });
            const [base, per] = RoomPlan.BUDGET.elite;
            for (const m of RoomPlan.pickEnemies(rng, floor, base + per * this.node.row, 2)) this.spawns.push({ type: m, ...right.pop(), data: { lv } });
        } else if (this.type === "boss") {
            const pool = EnemyData.at(floor).slice().sort((a, b) => b.threat - a.threat);
            const lead = Rng.pick(rng, pool.slice(0, Math.min(2, pool.length)));
            this.spawns.push({ type: lead.id, x: this.w - 2, y: center.y, data: { lv, rank: "boss" } });
            for (const m of RoomPlan.pickEnemies(rng, floor, 40, 2)) this.spawns.push({ type: m, ...right.filter((p) => !(p.x === this.w - 2 && p.y === center.y)).pop(), data: { lv } });
        } else if (this.type === "shop") {
            this.spawns.push({ type: "merchant", x: center.x, y: this.h, data: { name: Rng.pick(rng, Merchant.NAMES), stock: RoomPlan.rollStock(rng, this.node.row), money: Rng.int(rng, 40, 90) } });
        } else if (this.type === "rest") {
            this.spawns.push({ type: "campfire", x: center.x, y: center.y });
        } else if (this.type === "treasure") {
            this.spawns.push({ type: "treasure", x: center.x, y: center.y });
        }
    }

    // 입구 옆 시작 칸에서 모든 바닥 칸에 갈 수 있는가
    connected() {
        const seen = new Set([this.start.x + "," + this.start.y]);
        const queue = [this.start];
        while (queue.length) {
            const p = queue.shift();
            for (const [dx, dy] of Entity.DIRS) {
                const x = p.x + dx;
                const y = p.y + dy;
                const k = x + "," + y;
                if (seen.has(k) || this.isWall(x, y)) continue;
                seen.add(k);
                queue.push({ x, y });
            }
        }
        return seen.size === this.w * this.h - this.walls.size;
    }

    // ---------- ChunkManager 생성기 ----------
    fillTiles(chunk) {
        const n = chunk.manager.chunkSize;
        for (let ly = 0; ly < n; ly++) {
            for (let lx = 0; lx < n; lx++) {
                const x = chunk.cx * n + lx;
                const y = chunk.cy * n + ly;
                let tile = TileDef.VOID;
                if (x >= 0 && x <= this.w + 1 && y >= 0 && y <= this.h + 1) tile = this.isWall(x, y) ? this.style.wall : this.style.floor;
                chunk.tiles[ly * n + lx] = tile;
            }
        }
    }

    populate(chunk) {
        const n = chunk.manager.chunkSize;
        const list = [];
        for (const s of this.spawns) {
            if (Math.floor(s.x / n) !== chunk.cx || Math.floor(s.y / n) !== chunk.cy) continue;
            list.push(EntityTypes.create(s.type, s.x, s.y, s.data ?? {}));
        }
        return list;
    }

    // ---------- 상점 물건 ----------
    // 행동 카드 6장 (보상 풀에서). 값은 카드마다 정해진 값 ±10%
    static rollStock(rng, row) {
        const stock = [];
        for (const card of Rewards.cards(rng, 6)) stock.push({ card, price: Math.max(1, Math.round(Rewards.cardPrice(card) * (0.9 + rng() * 0.2))) });
        return stock;
    }
}

// 보상 굴리기 (전투 보상, 상점, 보물). 카드는 공방 데이터의 보상(reward) 카드들 중에서 (기본 카드와 강화 카드는 안 나온다)
class Rewards {
    // 보상에 나오는 행동 카드 id들
    static pool() {
        return [...CardDef.defs.values()].filter((d) => d.kind === "reward" && d.type === "skill" && !d.upgradeKey).map((d) => d.id);
    }

    // 서로 다른 카드 n장
    static cards(rng, n) {
        const ids = Rng.shuffle(rng, Rewards.pool()).slice(0, n);
        return ids.map((id) => Card.create(id, rng));
    }

    static cardPrice(card) {
        return card.def.price ?? 50;
    }

    // 전투 보상: 돈 + 카드 3장 중 하나
    static battle(rng, type, row) {
        const elite = type === "elite";
        const gold = elite ? Rng.int(rng, 28, 40) : Rng.int(rng, 12, 20);
        return { gold, cards: Rewards.cards(rng, 3), items: [] };
    }

    // 보물 상자: 돈 + 카드 3장 중 하나
    static treasure(rng, row) {
        const gold = Rng.int(rng, 30, 50);
        return { gold, cards: Rewards.cards(rng, 3), items: [] };
    }
}

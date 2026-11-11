// 방 설계도. 지도에서 고른 칸(노드)마다 방 하나를 만든다: 입구 → 공간 → 출구.
// 방은 무적 벽 타일로 둘러싸인 직사각형이다. 안쪽 칸은 x 1..w, y 1..h (0과 w+1, h+1이 벽).
// 입구는 왼쪽 벽 가운데 안쪽, 출구는 오른쪽 벽 가운데 안쪽. 플레이어는 입구 바로 오른쪽에서 시작한다.
// 전투방에는 기둥(벽 타일)이 몇 개 서고, 입구에서 출구·모든 칸까지 길이 이어지는지 확인한다.
// ChunkManager의 generator로 쓴다: fillTiles(chunk), populate(chunk)
class RoomPlan {
    // 방 종류별 크기·바닥
    static STYLE = {
        start: { w: 9, h: 6, floor: TileDef.FLOOR, wall: TileDef.WALL, pillars: [0, 0] },
        battle: { w: 11, h: 7, floor: TileDef.FLOOR, wall: TileDef.WALL, pillars: [0, 3] },
        elite: { w: 13, h: 8, floor: TileDef.CAVE_FLOOR, wall: TileDef.CAVE_WALL, pillars: [1, 4] },
        boss: { w: 13, h: 9, floor: TileDef.CAVE_FLOOR, wall: TileDef.CAVE_WALL, pillars: [2, 4] },
        shop: { w: 9, h: 6, floor: TileDef.PLANKS, wall: TileDef.WALL, pillars: [0, 0] },
        rest: { w: 9, h: 6, floor: TileDef.GRASS, wall: TileDef.CAVE_WALL, pillars: [0, 0] },
        treasure: { w: 9, h: 6, floor: TileDef.FLOOR, wall: TileDef.WALL, pillars: [0, 0] },
        altar: { w: 9, h: 6, floor: TileDef.CAVE_FLOOR, wall: TileDef.CAVE_WALL, pillars: [0, 0] },
        quest: { w: 9, h: 6, floor: TileDef.PLANKS, wall: TileDef.WALL, pillars: [0, 0] }
    };

    // 방에 나오는 적은 공방 데이터(EnemyData)에서 고른다: 층에 맞는 적들 중, 위험도(threat) 예산 안에서 무작위로.
    // 설명(note)의 "(2~3마리)" 같은 말은 무리 크기가 된다.
    // 몬스터 등급(공방 '등급'): 소형·중형은 일반 방의 주력, 대형은 방마다 한 마리까지 (정예 방의 대장), 보스는 우두머리 방에만 나온다.
    //   일반 방: 소형·중형 + 대형 최대 1  / 정예 방: 대장은 대형(없으면 중형), 곁에 소형·중형 최대 2
    //   우두머리 방: 대장은 보스(없으면 대형), 곁에 소형 최대 2 (없으면 중형)
    static BUDGET = { battle: [40, 4], elite: [22, 2] }; // [기본, 층(row)마다 +]
    static MAX_ENEMIES = 5;

    // 예산 안에서 적 id 목록 (한 번에 무리 단위로 더한다)
    // grades: 나올 수 있는 등급들, maxLarge: 대형은 이 수까지만
    static pickEnemies(rng, floor, budget, maxCount = RoomPlan.MAX_ENEMIES, grades = ["small", "medium", "large"], maxLarge = 1) {
        const pool = RoomPlan.poolOf(floor, grades);
        const out = [];
        let spent = 0;
        let large = 0;
        for (let tries = 0; tries < 16 && out.length < maxCount && pool.length; tries++) {
            const r = Rng.pick(rng, pool);
            const n = Math.min(maxCount - out.length, Rng.int(rng, r.group[0], r.group[1]));
            if (r.grade === "large" && large + n > maxLarge) continue;
            const cost = r.threat * n;
            if (spent + cost > budget) continue;
            for (let i = 0; i < n; i++) out.push(r.id);
            if (r.grade === "large") large += n;
            spent += cost;
            if (spent >= budget * 0.8) break;
        }
        if (out.length) return out;
        const weakest = pool.slice().sort((a, b) => a.threat - b.threat)[0];
        return [weakest ? weakest.id : "rat"];
    }

    // 이 층에 나오는 적 중 등급이 grades 안인 것 (없으면 보스가 아닌 아무 적)
    static poolOf(floor, grades) {
        const all = EnemyData.at(floor);
        const pool = all.filter((r) => grades.includes(r.grade));
        return pool.length ? pool : all.filter((r) => r.grade !== "boss");
    }

    // 대장 후보: 등급 우선순위대로 처음으로 비지 않은 등급의 적들 (위험도 큰 순)
    static leadPool(floor, order) {
        const all = EnemyData.at(floor);
        for (const g of order) {
            const list = all.filter((r) => r.grade === g);
            if (list.length) return list.slice().sort((a, b) => b.threat - a.threat);
        }
        return all.slice().sort((a, b) => b.threat - a.threat);
    }

    // node: RunMap 칸, seed: 방 시드, state: 이미 다녀간 방의 기록 { cleared, used, sold:[…], extra } (없으면 처음 들어가는 방), floorNo: 층 번호
    constructor(node, seed, state = null, floorNo = 1) {
        this.node = node;
        this.seed = seed;
        this.floorNo = floorNo;
        this.state = state ?? {};
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
        this.lv = 1 + Math.floor(node.row / 5) + (this.type === "boss" ? 1 : 0);
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
        // 적 놓을 자리. 큰 적(2x2)은 비어 있는 size×size 칸을 통째로 쓴다
        const place = (kind) => {
            const size = (Monster.KINDS[kind] && Monster.KINDS[kind].size) || 1;
            if (size === 1) return right.pop();
            const open = new Set(right.map((p) => p.x + "," + p.y));
            for (let i = right.length - 1; i >= 0; i--) {
                const q = right[i];
                const cells = [];
                for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) cells.push((q.x + dx) + "," + (q.y + dy));
                if (!cells.every((c) => open.has(c))) continue;
                for (const c of cells) { const k = right.findIndex((p) => p.x + "," + p.y === c); if (k >= 0) right.splice(k, 1); }
                return { x: q.x, y: q.y };
            }
            return right.pop();
        };

        this.spawns.push({ type: "entrance", ...this.entrance }, { type: "exit", ...this.exit });
        const lv = this.lv;
        const floor = this.node.row + 1;
        // 소품(제단·게시판·상인)에 넘기는 공통 데이터: 저장된 상태, 방 난수 씨, 층 번호
        const common = { extra: this.state.extra, seed: Rng.mix(this.seed, 4242), floor: this.floorNo };
        const done = !!this.state.cleared; // 이미 정리한 방은 적이 없다
        if (done && this.combat) {
            // 적 없음
        } else if (this.type === "battle") {
            const [base, per] = RoomPlan.BUDGET.battle;
            for (const kind of RoomPlan.pickEnemies(rng, floor, base + per * this.node.row)) this.spawns.push({ type: kind, ...place(kind), data: { lv } });
        } else if (this.type === "elite") {
            const lead = Rng.pick(rng, RoomPlan.leadPool(floor, ["large", "medium", "small"]));
            this.spawns.push({ type: lead.id, ...place(lead.id), data: { lv, rank: "elite" } });
            const [base, per] = RoomPlan.BUDGET.elite;
            for (const m of RoomPlan.pickEnemies(rng, floor, base + per * this.node.row, 2, ["small", "medium"], 0)) this.spawns.push({ type: m, ...place(m), data: { lv } });
        } else if (this.type === "boss") {
            const lead = Rng.pick(rng, RoomPlan.leadPool(floor, ["boss", "large", "medium", "small"]));
            const bigBoss = ((Monster.KINDS[lead.id] && Monster.KINDS[lead.id].size) || 1) > 1;
            const fixed = { x: this.w - 2, y: center.y };
            // 우두머리는 오른쪽 가운데. 기둥이 있거나 큰 몸이면 비어 있는 자리를 찾는다
            const bossAt = bigBoss || this.isWall(fixed.x, fixed.y) ? place(lead.id) : fixed;
            this.spawns.push({ type: lead.id, ...bossAt, data: { lv, rank: "boss" } });
            for (const m of RoomPlan.pickEnemies(rng, floor, 40, 2, ["small"], 0)) {
                // 곁의 적은 서로·우두머리와 겹치지 않는 자리에 (뽑은 자리는 목록에서 뺀다)
                const i = right.findLastIndex((q) => !(q.x === bossAt.x && q.y === bossAt.y));
                if (i >= 0) this.spawns.push({ type: m, ...right.splice(i, 1)[0], data: { lv } });
            }
        } else if (this.type === "shop") {
            const stock = RoomPlan.rollStock(rng, this.node.row);
            stock.forEach((offer, i) => { offer.sold = !!(this.state.sold && this.state.sold.includes(i)); }); // 이미 산 물건
            this.spawns.push({ type: "merchant", x: center.x, y: this.h, data: { name: Rng.pick(rng, Merchant.NAMES), stock, money: Rng.int(rng, 40, 90), ...common } });
        } else if (this.type === "rest") {
            this.spawns.push({ type: "campfire", x: center.x, y: center.y, data: { used: !!this.state.used } });
        } else if (this.type === "altar") {
            this.spawns.push({ type: "altar", x: center.x, y: center.y, data: { ...common } });
        } else if (this.type === "quest") {
            this.spawns.push({ type: "questboard", x: center.x, y: center.y, data: { ...common } });
        }
        // (보물 방의 물건은 방을 만든 뒤 Run이 바닥에 놓는다: Run.spawnPickups)
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
        for (const card of Rewards.cards(rng, 6, "shop")) stock.push({ card, price: Math.max(1, Math.floor(Rewards.cardPrice(card) * (0.9 + rng() * 0.2))) });
        for (const card of Rewards.gear(rng, 2, "shop")) stock.push({ card, price: Math.max(1, Math.floor(Rewards.cardPrice(card) * (0.9 + rng() * 0.2))) });
        return stock;
    }
}

// 보상 굴리기 (전투 보상, 상점, 보물). 카드는 공방 데이터의 보상(reward) 카드들 중에서 (기본 카드와 강화 카드는 안 나온다)
class Rewards {
    // 보상에 나오는 행동 카드 id들
    static pool() {
        return [...CardDef.defs.values()].filter((d) => d.kind === "reward" && d.type === "skill" && !d.upgradeKey).map((d) => d.id);
    }

    // 카드 희귀도 무게 (카드가 나오는 곳마다 다르다): 전투 보상은 흔한 카드가 많고, 정예·보물은 귀한 카드 비중이 높다
    static CARD_WEIGHTS = {
        battle: { common: 60, uncommon: 30, rare: 10 },
        elite: { common: 40, uncommon: 40, rare: 20 },
        shop: { common: 55, uncommon: 33, rare: 12 },
        treasure: { common: 30, uncommon: 45, rare: 25 }
    };

    // 서로 다른 카드 n장 (희귀도 무게대로 뽑는다)
    static cards(rng, n, where = "battle") {
        const w = Rewards.CARD_WEIGHTS[where] ?? Rewards.CARD_WEIGHTS.battle;
        const pool = Rewards.pool().map((id) => ({ id, w: w[CardDef.get(id).rarity] ?? w.common }));
        const out = [];
        for (let k = 0; k < n && pool.length; k++) {
            let roll = rng() * pool.reduce((s, c) => s + c.w, 0);
            let i = 0;
            for (; i < pool.length - 1; i++) {
                roll -= pool[i].w;
                if (roll < 0) break;
            }
            out.push(pool.splice(i, 1)[0].id);
        }
        return out.map((id) => Card.create(id, rng));
    }

    // 장비 희귀도 무게 (장비가 나오는 곳마다 다르다)
    static GEAR_WEIGHTS = {
        shop: { common: 5, uncommon: 3, rare: 1 },
        elite: { common: 2, uncommon: 3, rare: 2 },
        treasure: { common: 2, uncommon: 3, rare: 2 },
        boss: { rare: 3, boss: 3 }
    };

    // 장비 카드 n장 (서로 다른 것, 이미 가진 것(owned: 장비 id들)은 뺀다). 무게는 희귀도별
    static gear(rng, n, where = "shop", owned = []) {
        const weights = Rewards.GEAR_WEIGHTS[where];
        const pool = [...CardDef.defs.values()].filter((d) => d.gear && weights[d.rarity] && !owned.includes(d.id));
        const out = [];
        for (let k = 0; k < n && pool.length; k++) {
            let roll = rng() * pool.reduce((s, d) => s + weights[d.rarity], 0);
            let i = 0;
            for (; i < pool.length - 1; i++) {
                roll -= weights[pool[i].rarity];
                if (roll < 0) break;
            }
            out.push(new Card(pool.splice(i, 1)[0].id));
        }
        return out;
    }

    static cardPrice(card) {
        return card.def.price ?? 50;
    }

    // 전투 보상: 돈 + 카드 3장 중 하나
    // 정예는 장비도 하나 준다 (owned: 이미 가진 장비 id들)
    static battle(rng, type, row, owned = []) {
        const elite = type === "elite";
        const gold = elite ? Rng.int(rng, 28, 40) : Rng.int(rng, 12, 20);
        return { gold, cards: Rewards.cards(rng, 3, elite ? "elite" : "battle"), items: elite ? Rewards.gear(rng, 1, "elite", owned) : [] };
    }

    // 보물 상자: 돈 + 카드 3장 중 하나 + 장비 하나
    static treasure(rng, row, owned = []) {
        const gold = Rng.int(rng, 30, 50);
        return { gold, cards: Rewards.cards(rng, 3, "treasure"), items: Rewards.gear(rng, 1, "treasure", owned) };
    }

    // 우두머리: 돈 + 장비 하나
    static boss(rng, row, owned = []) {
        return { gold: Rng.int(rng, 60, 90), cards: [], items: Rewards.gear(rng, 1, "boss", owned) };
    }
}

// 방 설계도. 지도에서 고른 칸(노드)마다 방 하나를 만든다: 입구 → 공간 → 출구.
// 방은 무적 벽 타일로 둘러싸인 직사각형이다. 안쪽 칸은 x 1..w, y 1..h (0과 w+1, h+1이 벽). 크기(w,h)는 방 종류의 범위 안에서 방 시드로 정한다.
// 입구는 왼쪽 벽 가운데 안쪽, 출구는 오른쪽 벽 가운데 안쪽. 플레이어는 입구 바로 오른쪽에서 시작한다.
// 전투·정예·우두머리 방은 구조 템플릿(SHAPES: 열린 아레나, 기둥, 섬, 칸막이, 기역자, 십자, 두 칸, 감실, 링)을 시드로 골라 벽 타일을 세우고,
// 입구에서 모든 칸까지 길이 이어지는지·적과 보상이 놓일 자리가 있는지 확인한다 (안 되면 다른 템플릿으로 다시).
// ChunkManager의 generator로 쓴다: fillTiles(chunk), populate(chunk)
class RoomPlan {
    // 방 종류별 크기 범위(w, h: [최소, 최대])·바닥·구조 템플릿 무게 (SHAPES 이름: 무게)
    static STYLE = {
        start: { w: [9, 11], h: [6, 7], floor: TileDef.FLOOR, wall: TileDef.WALL, shapes: { arena: 1 } },
        battle: {
            w: [9, 15], h: [6, 10], floor: TileDef.FLOOR, wall: TileDef.WALL, ref: 77,
            shapes: { arena: 3, scatter: 3, island: 3, divider: 3, lshape: 3, cross: 2, chambers: 2, alcoves: 2, ring: 2 }
        },
        elite: {
            w: [11, 15], h: [7, 10], floor: TileDef.CAVE_FLOOR, wall: TileDef.CAVE_WALL, ref: 104,
            shapes: { arena: 2, scatter: 3, island: 3, divider: 2, lshape: 3, cross: 2, chambers: 2, alcoves: 2, ring: 3 }
        },
        boss: {
            w: [13, 17], h: [9, 11], floor: TileDef.CAVE_FLOOR, wall: TileDef.CAVE_WALL, ref: 117,
            shapes: { arena: 3, scatter: 2, island: 3, lshape: 1, cross: 2, chambers: 1, alcoves: 3, ring: 3 }
        },
        shop: { w: [9, 11], h: [6, 7], floor: TileDef.PLANKS, wall: TileDef.WALL, shapes: { arena: 1 } },
        rest: { w: [9, 11], h: [6, 7], floor: TileDef.GRASS, wall: TileDef.CAVE_WALL, shapes: { arena: 1 } },
        treasure: { w: [9, 11], h: [6, 7], floor: TileDef.FLOOR, wall: TileDef.WALL, shapes: { arena: 1 } }
    };

    // 구조 템플릿: 안쪽 칸에 벽 타일을 세운다 (this.walls). 이 방에 안 맞는 크기면 false.
    // 입구·출구 쪽 길(가운데 줄 양 끝)은 layout이 따로 검사한다 (길이 막히면 다른 템플릿으로 다시 굴린다).
    static SHAPES = {
        // 열린 아레나: 기둥 0~3개
        arena(p, rng) {
            if (!p.combat) return true; // 상점·휴식·보물·시작 방은 기둥 없이 비어 있다
            p.pillars(Rng.int(rng, 0, 3));
            return true;
        },
        // 흩어진 기둥: 방 크기에 비례해 여러 개
        scatter(p, rng) {
            p.pillars(Rng.int(rng, 4, 4 + Math.floor(p.w * p.h / 30)));
            return true;
        },
        // 가운데 벽 섬: 작은 덩어리 하나 (+ 기둥 몇 개)
        island(p, rng) {
            if (p.w < 9 || p.h < 6) return false;
            const bw = Rng.int(rng, 2, p.w >= 13 ? 4 : 3);
            const bh = Rng.int(rng, 1, p.h >= 8 ? 3 : 2);
            const x0 = Rng.int(rng, 4, p.w - 3 - bw + 1);
            const y0 = Rng.int(rng, 2, p.h - bh);
            p.block(x0, y0, x0 + bw - 1, y0 + bh - 1);
            p.pillars(Rng.int(rng, 0, 2));
            return true;
        },
        // 칸막이: 세로 벽(통로 1~2칸) 한두 개, 또는 가로 벽(한쪽 끝이 열린 S자 길)
        divider(p, rng) {
            if (p.w < 9 || p.h < 6) return false;
            if (rng() < 0.5) {
                const xs = [Rng.int(rng, 4, p.w - 3)];
                if (p.w >= 14 && rng() < 0.6) { const x2 = xs[0] <= 8 ? Rng.int(rng, xs[0] + 4, p.w - 3) : Rng.int(rng, 4, xs[0] - 4); xs.push(x2); }
                let prevGap = -9;
                for (const x of xs) {
                    const g = Rng.int(rng, 1, 2);
                    let gy = Rng.int(rng, 1, p.h - g + 1);
                    if (Math.abs(gy - prevGap) < 3) gy = gy <= p.h / 2 ? p.h - g + 1 : 1; // 두 칸막이의 통로는 서로 멀리
                    prevGap = gy;
                    p.block(x, 1, x, p.h);
                    for (let k = 0; k < g; k++) p.walls.delete(x + "," + (gy + k));
                }
            } else {
                const mid = Math.ceil(p.h / 2);
                const rows = [];
                for (let y = 2; y <= p.h - 1; y++) if (y !== mid) rows.push(y);
                const y = Rng.pick(rng, rows);
                const len = Rng.int(rng, Math.floor(p.w / 2), p.w - 5);
                const left = rng() < 0.5;
                p.block(left ? 3 : p.w - 2 - len + 1, y, left ? 3 + len - 1 : p.w - 2, y);
                if (p.h >= 8) { // 가운데 줄 건너편에 반대쪽에서 오는 벽을 하나 더 (S자)
                    const y2 = y < mid ? Rng.int(rng, mid + 1, p.h - 1) : Rng.int(rng, 2, mid - 1);
                    if (Math.abs(y2 - y) >= 3 && y2 !== mid) p.block(left ? p.w - 2 - len + 1 : 3, y2, left ? p.w - 2 : 3 + len - 1, y2);
                }
            }
            return true;
        },
        // 기역자: 한쪽 모서리(드물게 마주 보는 두 모서리)를 막는다
        lshape(p, rng) {
            const mid = Math.ceil(p.h / 2);
            const maxTop = p.h - mid - 1; // 가운데 줄 위쪽으로 여유를 한 줄 남긴다
            const maxBot = mid - 2;
            if (p.w < 9 || maxTop < 1 || maxBot < 1) return false;
            const corner = (right, top) => {
                const bw = Rng.int(rng, Math.max(2, Math.floor(p.w / 4)), Math.max(2, Math.floor(p.w / 2) - 1));
                const bh = Rng.int(rng, Math.min(2, top ? maxTop : maxBot), top ? maxTop : maxBot);
                const x0 = right ? p.w - bw + 1 : 1;
                p.block(x0, top ? p.h - bh + 1 : 1, x0 + bw - 1, top ? p.h : bh);
            };
            const right = rng() < 0.5;
            const top = rng() < 0.5;
            corner(right, top);
            if (p.w >= 13 && p.h >= 8 && rng() < 0.25) corner(!right, !top);
            return true;
        },
        // 십자: 네 모서리를 막아 가운데 줄과 가운데 세로 줄만 남긴다
        cross(p, rng) {
            const mid = Math.ceil(p.h / 2);
            const bhMax = Math.min(p.h - mid - 1, mid - 2);
            if (p.w < 11 || bhMax < 1) return false;
            const bw = Rng.int(rng, 2, Math.floor(p.w / 2) - 2);
            const bh = Rng.int(rng, 1, bhMax);
            for (const right of [false, true]) for (const top of [false, true]) {
                const x0 = right ? p.w - bw + 1 : 1;
                p.block(x0, top ? p.h - bh + 1 : 1, x0 + bw - 1, top ? p.h : bh);
            }
            return true;
        },
        // 방 두 칸: 가운데쯤 세로 벽에 문(1~2칸)이 가운데 줄에 뚫려 있다 (+ 가끔 위나 아래에 작은 쪽문)
        chambers(p, rng) {
            if (p.w < 10 || p.h < 6) return false;
            const mid = Math.ceil(p.h / 2);
            const x = Math.ceil(p.w / 2) + Rng.int(rng, -1, 1);
            const g = Rng.int(rng, 1, 2);
            p.block(x, 1, x, p.h);
            for (let k = 0; k < g; k++) p.walls.delete(x + "," + (mid + k));
            if (p.h >= 8 && rng() < 0.4) p.walls.delete(x + "," + (rng() < 0.5 ? 1 : p.h));
            p.pillars(Rng.int(rng, 0, 2));
            return true;
        },
        // 옆 감실: 위·아래 벽에서 벽 조각이 튀어나와 움푹 들어간 자리(감실)가 줄지어 생긴다
        alcoves(p, rng) {
            if (p.w < 9 || p.h < 6) return false;
            const depthMax = Math.max(1, Math.floor((p.h - 4) / 2));
            for (const top of [false, true]) {
                if (rng() < 0.15) continue; // 한쪽만 감실인 방도 있다
                const t = Rng.int(rng, 1, depthMax);
                const bw = Rng.int(rng, 1, 2);
                const gap = Rng.int(rng, 2, 3);
                for (let x = 3 + Rng.int(rng, 0, 2); x <= p.w - 2; x += bw + gap) {
                    p.block(x, top ? p.h - t + 1 : 1, Math.min(x + bw - 1, p.w - 2), top ? p.h : t);
                }
            }
            return true;
        },
        // 링: 가운데 벽 덩어리와 그 둘레를 도는 길
        ring(p, rng) {
            if (p.w < 11 || p.h < 6) return false;
            const bw = Rng.int(rng, 3, Math.min(p.w - 8, 6));
            const m = Math.max(Rng.int(rng, 1, p.h >= 9 ? 2 : 1), Math.ceil((p.h - 5) / 2)); // 둘레 길 너비. 덩어리 높이는 5 이하
            const cx = Math.ceil(p.w / 2) + Rng.int(rng, -1, 1);
            const x0 = Math.max(4, Math.min(cx - Math.floor(bw / 2), p.w - 3 - bw + 1));
            p.block(x0, 1 + m, x0 + bw - 1, p.h - m);
            return true;
        }
    };

    // 방에 나오는 적은 공방 데이터(EnemyData)에서 고른다: 층에 맞는 적들 중, 위험도(threat) 예산 안에서 무작위로.
    // 설명(note)의 "(2~3마리)" 같은 말은 무리 크기가 된다.
    // 몬스터 등급(공방 '등급'): 소형·중형은 일반 방의 주력, 대형은 방마다 한 마리까지 (정예 방의 대장), 보스는 우두머리 방에만 나온다.
    //   일반 방: 소형·중형 + 대형 최대 1  / 정예 방: 대장은 대형(없으면 중형), 곁에 소형·중형 최대 2
    //   우두머리 방: 대장은 보스(없으면 대형), 곁에 소형 최대 2 (없으면 중형)
    static BUDGET = { battle: [40, 4], elite: [22, 2] }; // [기본, 층(row)마다 +]
    static MAX_ENEMIES = 5; // 기준 방(RoomPlan.STYLE의 ref 면적)에서의 수. 방 면적에 따라 완만히 늘고 준다 (scale)

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
        this.w = Rng.int(this.rng, st.w[0], st.w[1]);
        this.h = Rng.int(this.rng, st.h[0], st.h[1]);
        this.style = st;
        this.shape = "arena"; // 고른 구조 템플릿 이름
        const mid = Math.ceil(this.h / 2);
        this.entrance = { x: 1, y: mid };
        this.start = { x: 2, y: mid };
        this.exit = { x: this.w, y: mid };
        this.lv = 1 + Math.floor(node.row / 5) + (this.type === "boss" ? 1 : 0);
        this.walls = new Set(); // 안쪽 벽 타일(기둥·칸막이 …) "x,y"
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

    // 면적에 따른 적 수·예산 배율 (기준 방 1.0, 완만히 0.8 ~ 1.35)
    get scale() {
        const ref = this.style.ref ?? this.w * this.h;
        return Math.max(0.8, Math.min(1.35, Math.sqrt(this.w * this.h / ref)));
    }

    // (x0,y0)~(x1,y1) 직사각형을 벽으로 (방 안쪽만)
    block(x0, y0, x1, y1) {
        for (let y = Math.max(1, y0); y <= Math.min(this.h, y1); y++) for (let x = Math.max(1, x0); x <= Math.min(this.w, x1); x++) this.walls.add(x + "," + y);
    }

    // 기둥 n개: 입구·출구 근처는 비우고, 놓아도 모든 바닥이 이어질 때만
    pillars(n) {
        const rng = this.rng;
        const reserved = this.reservedKeys();
        for (let tries = 0, added = 0; added < n && tries < 80; tries++) {
            const x = Rng.int(rng, 3, this.w - 2);
            const y = Rng.int(rng, 1, this.h);
            const k = x + "," + y;
            if (reserved.has(k) || this.walls.has(k)) continue;
            this.walls.add(k);
            if (this.connected()) added++;
            else this.walls.delete(k);
        }
    }

    // 늘 비워 둘 칸: 입구, 시작, 출구, 출구 옆
    reservedKeys() {
        return new Set([this.entrance, this.start, this.exit, { x: this.exit.x - 1, y: this.exit.y }].map((p) => p.x + "," + p.y));
    }

    // 벽이 아닌 칸 중 size x size 칸이 통째로 비어 있는 왼쪽 아래 칸들 (filter: 그 칸에서 시작하는 사각형을 거를 때)
    openSquares(size, filter = null) {
        const out = [];
        const reserved = this.reservedKeys();
        for (let y = 1; y + size - 1 <= this.h; y++) for (let x = 1; x + size - 1 <= this.w; x++) {
            let ok = true;
            for (let dy = 0; dy < size && ok; dy++) for (let dx = 0; dx < size && ok; dx++) {
                const k = (x + dx) + "," + (y + dy);
                if (this.walls.has(k) || reserved.has(k)) ok = false;
            }
            if (ok && (!filter || filter(x, y))) out.push({ x, y });
        }
        return out;
    }

    // 이 구조가 쓸 만한가: 길이 이어지고, 벽이 너무 많지 않고, 적(2x2 포함)·보상이 놓일 자리가 있다
    usable() {
        const reserved = this.reservedKeys();
        for (const k of reserved) if (this.walls.has(k)) return false;
        if (!this.connected()) return false;
        if (this.walls.size === 0) return true;
        if (this.walls.size > this.w * this.h * 0.3) return false;
        const half = Math.ceil(this.w / 2) + 1;
        const right = this.openSquares(1, (x) => x >= half).length;
        if (right < 8) return false; // 오른쪽 절반의 빈 칸 (적 자리)
        if (this.openSquares(2, (x) => x >= half - 1).length < 3) return false; // 큰 몬스터·우두머리 자리
        if (this.openSquares(1).length < 12) return false; // 보상 물건 자리
        return true;
    }

    layout() {
        const rng = this.rng;
        const reserved = this.reservedKeys();
        // 구조 템플릿: 시드로 하나 고르고, 쓸 만하지 않으면 다시 (끝내 안 되면 빈 아레나)
        const names = Object.keys(this.style.shapes);
        const bag = [];
        for (const n of names) for (let i = 0; i < this.style.shapes[n]; i++) bag.push(n);
        let ok = false;
        for (let tries = 0; tries < 12 && !ok; tries++) {
            this.walls.clear();
            this.shape = Rng.pick(rng, bag);
            ok = RoomPlan.SHAPES[this.shape](this, rng) !== false && this.usable();
        }
        if (!ok) { this.walls.clear(); this.shape = "arena"; }
        const free = [];
        for (let y = 1; y <= this.h; y++) for (let x = 1; x <= this.w; x++) {
            const k = x + "," + y;
            if (!this.walls.has(k) && !reserved.has(k)) free.push({ x, y });
        }
        const half = Math.ceil(this.w / 2) + 1;
        const right = Rng.shuffle(rng, free.filter((p) => p.x >= half));
        // 오른쪽 절반이 모자랄 때 쓸 자리: 나머지 칸 중 시작 칸에서 4칸 넘게 떨어진 곳
        const rest = Rng.shuffle(rng, free.filter((p) => p.x < half && Math.abs(p.x - this.start.x) + Math.abs(p.y - this.start.y) > 3));
        const center = { x: half, y: Math.ceil(this.h / 2) };
        // 적 놓을 자리. 오른쪽 절반(right)에서 먼저, 모자라면 나머지(rest)에서. 큰 적(2x2)은 비어 있는 size×size 칸을 통째로 쓴다
        const take = (list, size) => {
            if (size === 1) return list.pop();
            const open = new Set(list.map((p) => p.x + "," + p.y));
            for (let i = list.length - 1; i >= 0; i--) {
                const q = list[i];
                const cells = [];
                for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) cells.push((q.x + dx) + "," + (q.y + dy));
                if (!cells.every((c) => open.has(c))) continue;
                for (const c of cells) { const k = list.findIndex((p) => p.x + "," + p.y === c); if (k >= 0) list.splice(k, 1); }
                return { x: q.x, y: q.y };
            }
            return null;
        };
        const place = (kind) => {
            const size = (Monster.KINDS[kind] && Monster.KINDS[kind].size) || 1;
            const at = take(right, size) ?? take(rest, size) ?? take(right, 1) ?? take(rest, 1);
            return at; // (자리가 정말 없으면 null → 그 적은 안 놓는다)
        };
        const put = (kind, data) => { const at = place(kind); if (at) this.spawns.push({ type: kind, x: at.x, y: at.y, data }); };
        const sc = this.scale;

        this.spawns.push({ type: "entrance", ...this.entrance }, { type: "exit", ...this.exit });
        const lv = this.lv;
        const floor = this.node.row + 1;
        // 소품(상인 등)에 넘기는 공통 데이터: 저장된 상태, 방 난수 씨, 층 번호
        const common = { extra: this.state.extra, seed: Rng.mix(this.seed, 4242), floor: this.floorNo };
        const done = !!this.state.cleared; // 이미 정리한 방은 적이 없다
        if (done && this.combat) {
            // 적 없음
        } else if (this.type === "battle") {
            const [base, per] = RoomPlan.BUDGET.battle;
            for (const kind of RoomPlan.pickEnemies(rng, floor, Math.floor((base + per * this.node.row) * sc), Math.round(RoomPlan.MAX_ENEMIES * sc))) put(kind, { lv });
        } else if (this.type === "elite") {
            const lead = Rng.pick(rng, RoomPlan.leadPool(floor, ["large", "medium", "small"]));
            put(lead.id, { lv, rank: "elite" });
            const [base, per] = RoomPlan.BUDGET.elite;
            for (const m of RoomPlan.pickEnemies(rng, floor, Math.floor((base + per * this.node.row) * sc), Math.round(2 * sc), ["small", "medium"], 0)) put(m, { lv });
        } else if (this.type === "boss") {
            const lead = Rng.pick(rng, RoomPlan.leadPool(floor, ["boss", "large", "medium", "small"]));
            const bigBoss = ((Monster.KINDS[lead.id] && Monster.KINDS[lead.id].size) || 1) > 1;
            const fixed = { x: this.w - 2, y: center.y };
            // 우두머리는 오른쪽 가운데. 기둥이 있거나 큰 몸이면 비어 있는 자리를 찾는다
            const fixedOk = !bigBoss && !this.isWall(fixed.x, fixed.y) && !reserved.has(fixed.x + "," + fixed.y);
            const bossAt = fixedOk ? fixed : place(lead.id) ?? fixed;
            if (fixedOk) { // 고정 자리는 곁의 적 후보에서 뺀다
                for (const list of [right, rest]) { const i = list.findIndex((q) => q.x === fixed.x && q.y === fixed.y); if (i >= 0) list.splice(i, 1); }
            }
            this.spawns.push({ type: lead.id, x: bossAt.x, y: bossAt.y, data: { lv, rank: "boss" } });
            for (const m of RoomPlan.pickEnemies(rng, floor, 40, Math.round(2 * sc), ["small"], 0)) {
                // 곁의 적은 서로·우두머리와 겹치지 않는 자리에 (뽑은 자리는 목록에서 뺀다)
                const at = take(right, 1) ?? take(rest, 1);
                if (at) this.spawns.push({ type: m, x: at.x, y: at.y, data: { lv } });
            }
        } else if (this.type === "shop") {
            const stock = RoomPlan.rollStock(rng, this.node.row);
            stock.forEach((offer, i) => { offer.sold = !!(this.state.sold && this.state.sold.includes(i)); }); // 이미 산 물건
            this.spawns.push({ type: "merchant", x: center.x, y: this.h, data: { name: Rng.pick(rng, Merchant.NAMES), stock, money: Rng.int(rng, 40, 90), ...common } });
        } else if (this.type === "rest") {
            this.spawns.push({ type: "campfire", x: center.x, y: center.y, data: { used: !!this.state.used } });
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

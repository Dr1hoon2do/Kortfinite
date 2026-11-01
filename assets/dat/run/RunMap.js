// 시드로 굴리는 난수 (mulberry32). 같은 시드면 같은 지도·같은 방이 나온다
class Rng {
    static make(seed) {
        let a = seed >>> 0;
        return () => {
            a = (a + 0x6d2b79f5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // 두 수를 섞어 새 시드 (런 시드 + 층·칸 → 방 시드)
    static mix(a, b) {
        let h = (a ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b)) >>> 0;
        h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
        return (h ^ (h >>> 16)) >>> 0;
    }

    static int(rng, min, max) {
        return min + Math.floor(rng() * (max - min + 1));
    }

    static pick(rng, list) {
        return list[Math.floor(rng() * list.length)];
    }

    // [[값, 무게], ...]에서 하나
    static weighted(rng, table) {
        const total = table.reduce((s, [, w]) => s + w, 0);
        let x = rng() * total;
        for (const [v, w] of table) {
            if (x < w) return v;
            x -= w;
        }
        return table[table.length - 1][0];
    }

    static shuffle(rng, list) {
        for (let i = list.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [list[i], list[j]] = [list[j], list[i]];
        }
        return list;
    }
}

// 층 지도 (아이작식): 한 층은 격자 위에 이어 붙인 방들이다. 시작 방에서 출발해 옆 방으로 탐색해 나가고, 막다른 방들 중
// 가장 먼 곳이 우두머리 방이다. 우두머리를 쓰러뜨리면 다음 층으로 내려갈 수 있고, 남은 방을 더 둘러봐도 된다.
//   start 시작(비어 있다) · battle 전투 · elite 정예 · shop 상점 · rest 휴식 · treasure 보물 · boss 우두머리
// 격자에서 붙어 있는 방끼리는 문으로 이어진다. 지도에는 가 본 방과 그 옆 방(종류가 보인다)만 나타난다.
// 특수 방(상점·보물·휴식·정예)은 막다른 방에 놓이고, 우두머리는 시작에서 가장 먼 막다른 방이다.
// 난이도(row)는 층과 시작에서의 거리로 정해진다: 층마다 5단계 (시작에서 멀수록 세다).
class RunMap {
    static FLOORS = 3;
    static ROOMS = [9, 11, 13];   // 층마다 방 수 (시작·우두머리·특수 방 포함)
    static STEPS = 5;             // 층마다 난이도 단계
    static DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    static TYPES = {
        battle: { name: "전투", icon: 0, color: "#c8b890" },
        elite: { name: "정예", icon: 1, color: "#e06050" },
        shop: { name: "상점", icon: 2, color: "#e8c860" },
        rest: { name: "휴식", icon: 3, color: "#f0a050" },
        treasure: { name: "보물", icon: 4, color: "#e8b840" },
        boss: { name: "우두머리", icon: 5, color: "#ff6040" },
        start: { name: "시작", icon: 6, color: "#a0d0f0" }
    };

    // seed: 런 시드, floor: 1부터
    constructor(seed, floor = 1) {
        this.seed = seed;
        this.floor = floor;
        this.nodes = new Map(); // id "x,y" → { id, x, y(격자), row(난이도), col(번호), dist, type, next: [이웃 id] }
        this.generate();
    }

    static id(x, y) {
        return x + "," + y;
    }

    static get lastFloor() {
        return RunMap.FLOORS;
    }

    get(id) {
        return this.nodes.get(id);
    }

    get start() {
        return this.nodes.get(RunMap.id(0, 0));
    }

    get boss() {
        return [...this.nodes.values()].find((n) => n.type === "boss");
    }

    generate() {
        for (let tries = 0; tries < 400; tries++) {
            if (this.build(Rng.make(Rng.mix(this.seed, this.floor * 1000 + tries)))) return;
        }
        throw new Error("층 지도를 만들지 못했다");
    }

    // 방들을 이어 붙인다 (붙는 칸은 이웃이 하나뿐인 빈 칸만 → 고리 없이 가지 뻗기). 조건이 안 맞으면 false
    build(rng) {
        const count = RunMap.ROOMS[this.floor - 1] ?? RunMap.ROOMS[RunMap.ROOMS.length - 1];
        const cells = new Map();
        const add = (x, y) => cells.set(RunMap.id(x, y), { id: RunMap.id(x, y), x, y, type: "battle", next: [] });
        const degree = (x, y) => RunMap.DIRS.filter(([dx, dy]) => cells.has(RunMap.id(x + dx, y + dy))).length;
        add(0, 0);
        let queue = [[0, 0]];
        for (let guard = 0; cells.size < count && guard < 400; guard++) {
            if (!queue.length) queue = [...cells.values()].map((c) => [c.x, c.y]);
            const [cx, cy] = queue.shift();
            for (const [dx, dy] of Rng.shuffle(rng, RunMap.DIRS.slice())) {
                const nx = cx + dx;
                const ny = cy + dy;
                if (cells.size >= count) break;
                if (cells.has(RunMap.id(nx, ny)) || Math.abs(nx) > 4 || Math.abs(ny) > 4) continue;
                if (degree(nx, ny) !== 1 || rng() < 0.5) continue;
                add(nx, ny);
                queue.push([nx, ny]);
            }
        }
        if (cells.size < count) return false;
        for (const c of cells.values()) for (const [dx, dy] of RunMap.DIRS) {
            const id = RunMap.id(c.x + dx, c.y + dy);
            if (cells.has(id)) c.next.push(id);
        }
        // 막다른 방 (시작 제외) 중 우두머리·상점·보물·휴식이 들어갈 자리가 모자라면 다시
        const leaves = [...cells.values()].filter((c) => c.next.length === 1 && c.id !== "0,0");
        if (leaves.length < 5) return false;
        // 시작에서의 거리
        cells.get("0,0").dist = 0;
        const queue2 = [cells.get("0,0")];
        while (queue2.length) {
            const c = queue2.shift();
            for (const id of c.next) {
                const n = cells.get(id);
                if (n.dist === undefined) {
                    n.dist = c.dist + 1;
                    queue2.push(n);
                }
            }
        }
        const far = Math.max(...leaves.map((c) => c.dist));
        if (far < 3) return false; // 우두머리는 시작에서 3칸 이상
        const boss = Rng.pick(rng, leaves.filter((c) => c.dist === far));
        const rest = Rng.shuffle(rng, leaves.filter((c) => c !== boss));
        cells.get("0,0").type = "start";
        boss.type = "boss";
        rest[0].type = "shop";
        rest[1].type = "treasure";
        rest[2].type = "rest";
        // 정예: 남은 막다른 방 먼저, 모자라면 시작에서 3칸 이상 떨어진 방. 층이 깊을수록 하나 더
        const eliteWant = this.floor >= 3 ? 2 : 1;
        const spots = [...rest.slice(3), ...Rng.shuffle(rng, [...cells.values()].filter((c) => c.type === "battle" && c.dist >= 3 && !rest.slice(3).includes(c)))];
        for (const c of spots.slice(0, eliteWant)) c.type = "elite";
        // 난이도·번호
        const base = (this.floor - 1) * RunMap.STEPS;
        let i = 0;
        for (const c of [...cells.values()].sort((a, b) => a.dist - b.dist || a.id.localeCompare(b.id))) {
            c.row = c.type === "boss" ? base + RunMap.STEPS - 1 : base + Math.max(0, Math.min(RunMap.STEPS - 1, c.dist - 1));
            c.col = i++;
        }
        this.nodes = cells;
        return true;
    }

    // 지도에 보이는 방 id들: 가 본 방과 그 옆 방
    revealed(visited) {
        const out = new Set();
        for (const id of visited) {
            const n = this.get(id);
            if (!n) continue;
            out.add(id);
            for (const c of n.next) out.add(c);
        }
        return out;
    }

    // 지금 고를 수 있는 방: 지도에 보이는 방 전부 (방금 나온 방도 다시 들어갈 수 있다). 아직 한 곳도 안 갔으면 시작 방
    choices(currentId, visited) {
        if (!currentId && !visited.length) return [this.start];
        return [...this.revealed(visited)].map((id) => this.get(id));
    }

    // 지도 전체가 차지하는 격자 범위 { minX, maxX, minY, maxY }
    bounds() {
        const xs = [...this.nodes.values()].map((n) => n.x);
        const ys = [...this.nodes.values()].map((n) => n.y);
        return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
    }
}

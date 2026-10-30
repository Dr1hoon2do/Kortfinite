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

// 1막 지도: 아래(1층)에서 위(15층)로 올라가는 그물망. 맨 위에 보스 방 하나.
// 칸(노드)마다 방 종류가 있고, 이어진 다음 칸(next) 중 하나를 골라 올라간다.
//   battle 전투 · elite 정예 · shop 상점 · rest 휴식 · treasure 보물 · boss 우두머리
// 층마다 칸이 WIDTH(4~5)개. 갈래길 수는 칸마다 따로 굴리지 않고 지도 전체에서 정확히 1개 20% · 2개 40% · 3개 40%로 나눠 준다.
// 갈래는 늘 다음 층에서 가로 위치가 가장 가까운 칸부터 잇는다. 아무도 안 오는 칸은 가장 가까운 칸의 먼 갈래를 그쪽으로 옮긴다.
// 갈래는 늘 다음 층의 가까운 칸부터, 선이 거의 엇갈리지 않게 잇는다 (link). 엇갈림을 줄이느라 갈래 수가 ±1 될 수 있어서
// 실제 비율은 대략 1개 25% · 2개 60% · 3개 15%가 된다.
// 방 종류를 굴린 뒤 지도 전체를 보고 운이 너무 나쁜 길이 없게 고친다 (FAIR): 상점·휴식·정예가 하나도 없는 길에는 전투 칸 하나를 바꿔 넣고,
// 너무 많은 길에서는 하나를 전투로 바꾼다.
class RunMap {
    static ROWS = 15;
    static WIDTH = [4, 5];                       // 한 층의 칸 수 (최소, 최대)
    static BRANCH = [[1, 20], [2, 40], [3, 40]]; // 갈래길 수와 비율 (지도 전체 기준)
    static TYPES = {
        battle: { name: "전투", icon: 0, color: "#c8b890" },
        elite: { name: "정예", icon: 1, color: "#e06050" },
        shop: { name: "상점", icon: 2, color: "#e8c860" },
        rest: { name: "휴식", icon: 3, color: "#f0a050" },
        treasure: { name: "보물", icon: 4, color: "#e8b840" },
        boss: { name: "우두머리", icon: 5, color: "#ff6040" }
    };

    // 정해진 층: 1층은 늘 전투, 9층은 보물, 15층(보스 바로 앞)은 휴식
    static FIXED = { 0: "battle", 8: "treasure", 14: "rest" };

    // 어느 길로 가도 (1~14층에서) 상점 1번 이상, 휴식 1번 이상, 정예 1~4번, 같은 종류 특수 방이 연달아 3번은 없게
    static FAIR = { shop: [1, 4], rest: [1, 4], elite: [1, 4] };

    constructor(seed) {
        this.seed = seed;
        this.nodes = new Map(); // id "row,col" → { id, row, col, x(0~1 가로 위치), type, next: [id] }
        this.generate();
    }

    static id(row, col) {
        return row + "," + col;
    }

    get(id) {
        return this.nodes.get(id);
    }

    // 층(row)의 칸들 (왼쪽부터)
    row(r) {
        return [...this.nodes.values()].filter((n) => n.row === r).sort((a, b) => a.col - b.col);
    }

    get boss() {
        return this.nodes.get(RunMap.id(RunMap.ROWS, 0));
    }

    generate() {
        const rng = Rng.make(this.seed);
        for (let tries = 0; tries < 20; tries++) {
            const rows = this.build(rng);
            this.assignTypes(rng, rows);
            if (this.repair(rng)) return;
        }
    }

    // 칸과 갈래길
    build(rng) {
        this.nodes.clear();
        const R = RunMap.ROWS;
        const rows = [];
        for (let r = 0; r < R; r++) {
            const n = Rng.int(rng, RunMap.WIDTH[0], RunMap.WIDTH[1]);
            const list = [];
            for (let c = 0; c < n; c++) {
                const node = { id: RunMap.id(r, c), row: r, col: c, x: (c + 0.5) / n, type: null, next: [] };
                this.nodes.set(node.id, node);
                list.push(node);
            }
            rows.push(list);
        }
        // 갈래 수: 맨 위 층을 뺀 모든 칸에 비율대로 정확히 나눠 주고 섞는다
        const src = rows.slice(0, R - 1).flat();
        const total = RunMap.BRANCH.reduce((s, [, w]) => s + w, 0);
        const bag = [];
        for (const [k, w] of RunMap.BRANCH) for (let i = 0; i < Math.round(src.length * w / total); i++) bag.push(k);
        while (bag.length < src.length) bag.push(2);
        bag.length = src.length;
        Rng.shuffle(rng, bag);
        src.forEach((n, i) => (n.want = bag[i]));

        for (let r = 0; r < R - 1; r++) this.link(rows[r], rows[r + 1]);
        for (const n of src) delete n.want;
        // 보스: 맨 위 줄 모든 칸에서 이어진다
        const boss = { id: RunMap.id(R, 0), row: R, col: 0, x: 0.5, type: "boss", next: [] };
        this.nodes.set(boss.id, boss);
        for (const n of rows[R - 1]) n.next = [boss.id];
        for (const n of this.nodes.values()) n.next.sort((a, b) => this.get(a).col - this.get(b).col);
        return rows;
    }

    // 두 층 잇기. 아래 칸마다 위 층의 붙어 있는 칸 묶음(창)을 잇는다: 왼쪽 칸의 창이 오른쪽 칸의 창보다 왼쪽에 있게 해서
    // 선이 거의 엇갈리지 않는다 (옆 칸끼리 창이 두 칸 이상 겹칠 때만 X자 하나). 위 층의 모든 칸에 누군가 온다.
    // 갈래 수(want)는 되도록 지키되, 모든 칸을 잇거나 엇갈림을 줄이려면 ±1 할 수 있다 (가장 싼 것을 동적 계획법으로 고른다)
    link(down, up) {
        const m = up.length;
        const ux = up.map((u) => u.x);
        const states = []; // states[i] = Map key "s,k" → { cost, prev }
        const opts = (n) => {
            const out = [];
            for (const k of [n.want, n.want - 1, n.want + 1]) if (k >= 1 && k <= Math.min(3, m) && !out.includes(k)) out.push(k);
            return out;
        };
        const winCost = (n, s, k) => {
            let c = 0;
            for (let j = s; j < s + k; j++) c += Math.abs(ux[j] - n.x);
            return c * 4 + (k !== n.want ? 5 : 0);
        };
        down.forEach((n, i) => {
            const map = new Map();
            for (const k of opts(n)) for (let s = 0; s + k <= m; s++) {
                const own = winCost(n, s, k);
                if (i === 0) {
                    if (s === 0) map.set(s + "," + k, { cost: own, prev: null, s, k });
                    continue;
                }
                let best = null;
                for (const [key, st] of states[i - 1]) {
                    const e0 = st.s + st.k - 1;
                    if (s < st.s || s + k - 1 < e0 || s > e0 + 1) continue; // 왼쪽→오른쪽, 빈칸 없이
                    const o = Math.max(0, e0 - s + 1);
                    const c = st.cost + own + (o * (o - 1) / 2) * 4;
                    if (!best || c < best.cost) best = { cost: c, prev: key, s, k };
                }
                if (best) map.set(s + "," + k, best);
            }
            states.push(map);
        });
        let end = null;
        for (const [key, st] of states[down.length - 1]) if (st.s + st.k - 1 === m - 1 && (!end || st.cost < end[1].cost)) end = [key, st];
        // 이론상 늘 답이 있지만, 혹시 없으면 가까운 칸 하나씩
        if (!end) {
            for (const n of down) n.next = [[...up].sort((a, b) => Math.abs(a.x - n.x) - Math.abs(b.x - n.x))[0].id];
            for (const u of up) if (!down.some((n) => n.next.includes(u.id))) [...down].sort((a, b) => Math.abs(a.x - u.x) - Math.abs(b.x - u.x))[0].next.push(u.id);
            return;
        }
        let key = end[0];
        for (let i = down.length - 1; i >= 0; i--) {
            const st = states[i].get(key);
            down[i].next = up.slice(st.s, st.s + st.k).map((u) => u.id);
            key = st.prev;
        }
    }

    assignTypes(rng, rows) {
        const parents = new Map();
        for (const n of this.nodes.values()) for (const id of n.next) {
            if (!parents.has(id)) parents.set(id, []);
            parents.get(id).push(n);
        }
        for (const list of rows) for (const n of list) n.type = null;
        for (let r = 0; r < rows.length; r++) {
            for (const n of rows[r]) n.type = RunMap.FIXED[r] ?? this.rollType(rng, r, parents.get(n.id) ?? []);
        }
    }

    // 그 종류를 놓을 수 있는 층 (rollType 표와 같다)
    static allowed(type, row) {
        if (RunMap.FIXED[row]) return false;
        if (type === "shop") return row >= 2;
        if (type === "rest") return row >= 5 && row !== 13;
        if (type === "elite") return row >= 5;
        return true;
    }

    // 1층 아무 칸에서 14층까지 가는 길 중 key 방이 가장 적은(most면 가장 많은) 길. { count, path: [노드] }
    extreme(key, most) {
        const R = RunMap.ROWS;
        const memo = new Map();
        const walk = (id) => {
            if (memo.has(id)) return memo.get(id);
            const n = this.get(id);
            const own = n.type === key && n.row < R - 1 ? 1 : 0;
            const kids = n.next.filter((c) => this.get(c).row < R);
            let best = null;
            for (const c of kids) {
                const sub = walk(c);
                if (!best || (most ? sub.count > best.count : sub.count < best.count)) best = sub;
            }
            const res = { count: own + (best ? best.count : 0), path: [n, ...(best ? best.path : [])] };
            memo.set(id, res);
            return res;
        };
        let best = null;
        for (const s of this.row(0)) {
            const r = walk(s.id);
            if (!best || (most ? r.count > best.count : r.count < best.count)) best = r;
        }
        return best;
    }

    // 이웃 칸(앞뒤)에 같은 종류가 있으면 안 놓는다
    lonely(n, type) {
        if (this.row(n.row - 1).some((p) => p.next.includes(n.id) && p.type === type)) return false;
        return !n.next.some((id) => this.get(id).type === type);
    }

    // FAIR 맞추기. 다 맞으면 true
    repair(rng) {
        for (let step = 0; step < 60; step++) {
            let changed = false;
            for (const [key, [lo, hi]] of Object.entries(RunMap.FAIR)) {
                const low = this.extreme(key, false);
                if (low.count < lo) {
                    const cands = low.path.filter((n) => n.type === "battle" && RunMap.allowed(key, n.row) && this.lonely(n, key));
                    if (!cands.length) return false;
                    Rng.pick(rng, cands).type = key;
                    changed = true;
                    continue;
                }
                const high = this.extreme(key, true);
                if (high.count > hi) {
                    const cands = high.path.filter((n) => n.type === key && !RunMap.FIXED[n.row]);
                    if (!cands.length) return false;
                    Rng.pick(rng, cands).type = "battle";
                    changed = true;
                }
            }
            if (!changed) return true;
        }
        return false;
    }

    fair() {
        return Object.entries(RunMap.FAIR).every(([k, [lo, hi]]) => this.extreme(k, false).count >= lo && this.extreme(k, true).count <= hi);
    }

    // 층에 맞는 방 종류. 정예·휴식·상점은 바로 앞 칸과 같은 종류가 이어지지 않는다
    rollType(rng, row, parents) {
        const table = [["battle", 50], ["shop", row >= 2 ? 11 : 0], ["rest", row >= 5 && row !== 13 ? 12 : 0], ["elite", row >= 5 ? 14 : 0], ["treasure", row >= 3 && row !== 7 && row !== 9 ? 4 : 0]];
        for (let i = 0; i < 6; i++) {
            const t = Rng.weighted(rng, table);
            if (t === "battle" || !parents.some((p) => p.type === t)) return t;
        }
        return "battle";
    }

    // 지금 고를 수 있는 칸: 아직 시작 전이면 1층 전부, 아니면 지금 칸의 next
    choices(currentId) {
        if (!currentId) return this.row(0);
        const cur = this.get(currentId);
        return cur ? cur.next.map((id) => this.get(id)) : [];
    }
}

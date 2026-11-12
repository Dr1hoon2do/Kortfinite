// 타일 격자 A* (상하좌우). 시작에서 목표까지 첫 걸음 방향을 구한다.
// 목표 칸은 엔티티가 있어도 들어갈 수 있다고 본다 (마지막 걸음이 공격/자리바꾸기가 된다).
class Pathfinder {
    static DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    // 전체 경로 (방향 배열). 못 가면 null. ignoreEntities면 엔티티를 장애물로 보지 않는다.
    // mover를 주면 그것이 들어갈 수 있는 타일로 본다 (배를 가진 플레이어는 깊은 물도)
    // 열린 목록은 이진 힙(f가 같으면 먼저 넣은 것부터), 칸 키는 숫자라서 문자열·배열을 거의 만들지 않는다.
    static find(world, sx, sy, gx, gy, options = {}) {
        const maxNodes = options.maxNodes ?? 4000;
        const ignoreEntities = options.ignoreEntities ?? false;
        const mover = options.mover ?? null;
        const tileOk = (x, y) => ChunkManager.tileOk(world.getTile(x, y), mover);
        if (sx === gx && sy === gy) return [];
        if (!tileOk(gx, gy)) return null;

        const key = Pathfinder.key;
        const goalKey = key(gx, gy);
        const cost = new Map();   // 칸 키 -> 지금까지 가장 싼 g
        const came = new Map();   // 칸 키 -> 이전 칸 키 * 4 + 방향 번호
        const heap = new PathHeap();
        let seq = 0;

        cost.set(key(sx, sy), 0);
        heap.push(sx, sy, 0, Math.abs(gx - sx) + Math.abs(gy - sy), seq++);
        let expanded = 0;

        while (heap.size > 0 && expanded < maxNodes) {
            heap.pop();
            const cx = heap.x, cy = heap.y, cg = heap.g;
            const ck = key(cx, cy);
            if (cost.get(ck) < cg) continue; // 더 싼 길로 이미 다시 들어간 낡은 항목
            expanded++;

            if (ck === goalKey) {
                const path = [];
                let k = ck;
                while (came.has(k)) {
                    const v = came.get(k);
                    const d = Pathfinder.DIRS[v & 3];
                    path.push([d[0], d[1]]);
                    k = (v - (v & 3)) / 4;
                }
                return path.reverse();
            }

            for (let d = 0; d < 4; d++) {
                const dir = Pathfinder.DIRS[d];
                const nx = cx + dir[0];
                const ny = cy + dir[1];
                const nk = key(nx, ny);
                const g = cg + 1;
                const old = cost.get(nk);
                if (old !== undefined && old <= g) continue;
                let ok;
                if (nk === goalKey || ignoreEntities) ok = tileOk(nx, ny);
                else ok = tileOk(nx, ny) && !world.entityAt(nx, ny);
                if (!ok) continue;
                cost.set(nk, g);
                came.set(nk, ck * 4 + d);
                heap.push(nx, ny, g, g + Math.abs(gx - nx) + Math.abs(gy - ny), seq++);
            }
        }
        return null;
    }

    // 칸 좌표 -> 숫자 키 (좌표 ±2^20 안)
    static key(x, y) {
        return (x + 1048576) * 2097152 + (y + 1048576);
    }

    // 다음 한 걸음. 엔티티를 피해서 길이 없으면 엔티티를 무시한 길로 (길을 막은 쥐가 비키면 지나간다)
    static nextStep(world, from, gx, gy) {
        const path = Pathfinder.find(world, from.x, from.y, gx, gy, { mover: from })
            ?? Pathfinder.find(world, from.x, from.y, gx, gy, { ignoreEntities: true, mover: from });
        return path && path.length ? path[0] : null;
    }
}

// A*용 최소 힙. 항목을 평행 배열에 넣어 객체를 만들지 않는다. pop()한 값은 x, y, g에 남는다.
class PathHeap {
    constructor() {
        this.xs = []; this.ys = []; this.gs = []; this.fs = []; this.ss = [];
        this.size = 0;
        this.x = 0; this.y = 0; this.g = 0;
    }

    _less(i, j) {
        return this.fs[i] < this.fs[j] || (this.fs[i] === this.fs[j] && this.ss[i] < this.ss[j]);
    }

    _swap(i, j) {
        let t;
        t = this.xs[i]; this.xs[i] = this.xs[j]; this.xs[j] = t;
        t = this.ys[i]; this.ys[i] = this.ys[j]; this.ys[j] = t;
        t = this.gs[i]; this.gs[i] = this.gs[j]; this.gs[j] = t;
        t = this.fs[i]; this.fs[i] = this.fs[j]; this.fs[j] = t;
        t = this.ss[i]; this.ss[i] = this.ss[j]; this.ss[j] = t;
    }

    push(x, y, g, f, s) {
        let i = this.size++;
        this.xs[i] = x; this.ys[i] = y; this.gs[i] = g; this.fs[i] = f; this.ss[i] = s;
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (!this._less(i, p)) break;
            this._swap(i, p);
            i = p;
        }
    }

    pop() {
        this.x = this.xs[0]; this.y = this.ys[0]; this.g = this.gs[0];
        const last = --this.size;
        if (last > 0) {
            this.xs[0] = this.xs[last]; this.ys[0] = this.ys[last]; this.gs[0] = this.gs[last];
            this.fs[0] = this.fs[last]; this.ss[0] = this.ss[last];
            let i = 0;
            for (;;) {
                const l = i * 2 + 1, r = l + 1;
                let m = i;
                if (l < last && this._less(l, m)) m = l;
                if (r < last && this._less(r, m)) m = r;
                if (m === i) break;
                this._swap(i, m);
                i = m;
            }
        }
    }
}

// 행동 카드가 같이 쓰는 이동·줄 계산 도우미. (카드 자체는 data/CardImpl.js가 공방 데이터에서 만든다)
class ActionCards {
    // from에서 걸어서 steps칸 안에 갈 수 있는 빈칸들: Map(키 "x,y" → 그 칸까지의 경로 [[dx, dy], ...])
    // 막는 엔티티가 있는 칸은 못 지나간다. 벽 타일도 못 지나간다
    static reachable(world, mover, steps) {
        const out = new Map();
        const start = `${mover.x},${mover.y}`;
        const prev = new Map([[start, null]]);
        let frontier = [[mover.x, mover.y]];
        for (let d = 0; d < steps; d++) {
            const next = [];
            for (const [x, y] of frontier) {
                for (const [dx, dy] of Entity.DIRS) {
                    const nx = x + dx;
                    const ny = y + dy;
                    const k = `${nx},${ny}`;
                    if (prev.has(k) || !world.getChunkAt(nx, ny) || !world.canEnter(mover, nx, ny)) continue;
                    prev.set(k, [`${x},${y}`, dx, dy]);
                    next.push([nx, ny]);
                }
            }
            frontier = next;
        }
        for (const k of prev.keys()) {
            if (k === start) continue;
            const [kx, ky] = k.split(",").map(Number);
            if (Status.charmBlocks(mover, kx, ky)) continue; // 매료: 건 상대에게서 멀어지는 칸은 못 간다
            const path = [];
            let at = k;
            while (prev.get(at)) {
                const [from, dx, dy] = prev.get(at);
                path.push([dx, dy]);
                at = from;
            }
            out.set(k, path.reverse());
        }
        return out;
    }

    // 고른 칸까지 걸어간다 (이동속도 칸 안, 빈칸만). 한 칸씩 미끄러지는 연출 단계들
    static move(ctx, steps) {
        const u = ctx.user;
        const t = ctx.target;
        if (u.root > 0) {
            MessageLog.add(`속박되어 움직일 수 없다 (${u.root}턴 남음)`, "#c8b890");
            return null;
        }
        if (!t) {
            MessageLog.add("갈 칸을 골라야 한다", "#c8b890");
            return null;
        }
        const path = ActionCards.reachable(ctx.world, u, steps).get(`${t.x},${t.y}`);
        if (!path) {
            MessageLog.add(`걸어서 ${steps}칸 안의 빈칸만 갈 수 있다`, "#c8b890");
            return null;
        }
        const size = ctx.world.tileSize;
        const anims = [];
        for (const [dx, dy] of path) {
            const fx = u.x;
            const fy = u.y;
            if (!ctx.world.moveEntity(u, dx, dy)) break;
            anims.push([new MoveAnim(u, new Vector(fx * size, fy * size), new Vector(u.x * size, u.y * size))]);
        }
        if (!anims.length) return null;
        return anims;
    }

    // t가 u에서 상하좌우 일직선 reach칸 안인가
    static inLine(u, t, reach) {
        const dx = t.x - u.x;
        const dy = t.y - u.y;
        if (dx && dy) return false;
        const d = Math.abs(dx) + Math.abs(dy);
        return d >= 1 && d <= reach;
    }

    // u에서 t 쪽으로 가면서 처음 만나는 막는 엔티티 (벽 타일에 막히면 없음)
    static firstInLine(world, u, t, reach) {
        const dx = Math.sign(t.x - u.x);
        const dy = Math.sign(t.y - u.y);
        for (let i = 1; i <= reach; i++) {
            const x = u.x + dx * i;
            const y = u.y + dy * i;
            const e = world.entityAt(x, y);
            if (e && e !== u) return e;
            if (!ChunkManager.tileOk(world.getTile(x, y))) return null;
        }
        return null;
    }
}

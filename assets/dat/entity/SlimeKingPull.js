// 슬라임킹 F 점액 손 — 플레이어 위치로 1칸 범위 점액 손을 날린다. 맞으면 플레이어를 킹 옆칸으로 당겨온다.
// 공격력 60% 피해, 점액 카드 이동속도 100%. 실행은 area 의도 처리(EnemyAI)가 하고, 끌어올 칸 계산만 여기서 한다.
class SlimeKingPull {
    static intent(ctx, e, foe) {
        return {
            kind: "area", name: "점액 손", tiles: EnemyMoves.around(ctx.world, foe.x, foe.y, 1), dmg: EnemyMoves.val(e, "atk", 60),
            thrown: true, color: "#7cd47c", cards: { pct: 100 }, pull: true
        };
    }

    // 킹 발자국 바깥 상하좌우 변에 붙은 칸들 (모서리 제외)
    static edgeTiles(e) {
        const out = [];
        for (let dy = -1; dy <= e.size; dy++) for (let dx = -1; dx <= e.size; dx++) {
            const inside = dx >= 0 && dx < e.size && dy >= 0 && dy < e.size;
            const corner = (dx < 0 || dx >= e.size) && (dy < 0 || dy >= e.size);
            if (!inside && !corner) out.push([e.x + dx, e.y + dy]);
        }
        return out;
    }

    // v가 끌려갈 칸 [x, y]. 이미 킹 옆이면 현재 칸, 비어 있는 칸이 없으면 null
    static pullTarget(w, e, v) {
        const ring = SlimeKingPull.edgeTiles(e);
        if (ring.some(([x, y]) => x === v.x && y === v.y)) return [v.x, v.y];
        let best = null;
        let bd = Infinity;
        for (const [x, y] of ring) {
            if (!w.getChunkAt(x, y) || !w.isWalkable(x, y)) continue;
            const d = Math.abs(x - v.x) + Math.abs(y - v.y);
            if (d < bd) { bd = d; best = [x, y]; }
        }
        return best;
    }

    // 실제로 끌어온다. 움직였으면 연출 목록, 아니면 빈 배열
    static pull(w, e, v) {
        const to = SlimeKingPull.pullTarget(w, e, v);
        if (!to || (to[0] === v.x && to[1] === v.y)) return [];
        const t = w.tileSize;
        const fx = v.x;
        const fy = v.y;
        w.removeEntity(v);
        v.x = to[0];
        v.y = to[1];
        w.addEntity(v);
        MessageLog.add(`${v instanceof Player ? "당신이" : josa(v.displayName, "이가")} ${e.displayName}에게 끌려갔다!`, "#7cd47c");
        return [new MoveAnim(v, new Vector(fx * t, fy * t), new Vector(v.x * t, v.y * t), 0.18)];
    }
}

// 엔티티 행동. 매 턴 act(ctx)가 이동할 방향을 돌려준다 (null이면 쉼).
// 그 방향에 적대하는 엔티티가 있으면 이동 대신 공격이 된다 (부딪혀서 공격).
// 새 AI는 이 클래스를 상속해서 act / isHostileTo / onAttacked / attitude를 바꾸면 된다.
// ctx = { world, player, turn }
class AI {
    constructor(options = {}) {
        this.entity = null;
        this.sight = options.sight ?? 6; // 대상을 알아차리는 거리 (칸, 맨해튼)
    }

    // 플레이어 입장에서 본 태도. UI 색과 의도 표시에 쓴다.
    get attitude() { return "neutral"; }

    isHostileTo(other) { return false; }

    act(ctx) { return null; }

    onAttacked(attacker) {}

    distance(a, b) {
        return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    }

    // 대상 쪽으로 한 칸. 길찾기로 막힌 길을 돌아가고, 대상 칸 자체는 막혀 있어도 고른다(공격).
    stepToward(target) {
        const e = this.entity;
        if (this.distance(e, target) === 1) return [target.x - e.x, target.y - e.y];
        const path = Pathfinder.find(e.world, e.x, e.y, target.x, target.y, { maxNodes: 1500 });
        if (path && path.length) return path[0];
        // 길이 막혔으면(다른 몬스터가 막고 있다) 가까워지는 쪽 빈칸으로
        const dx = Math.sign(target.x - e.x);
        const dy = Math.sign(target.y - e.y);
        for (const [sx, sy] of [[dx, 0], [0, dy]]) {
            if ((sx || sy) && e.world.isWalkable(e.x + sx, e.y + sy)) return [sx, sy];
        }
        return null;
    }
}

// 적대: 시야 안의 플레이어를 쫓아가 공격한다.
class HostileAI extends AI {
    get attitude() { return "hostile"; }

    isHostileTo(other) {
        return other instanceof Player || (typeof Ally !== "undefined" && other instanceof Ally);
    }

    act(ctx) {
        const p = ctx.player;
        if (!p.alive || this.distance(this.entity, p) > this.sight) return null;
        return this.stepToward(p);
    }
}

// 중립: 제자리에 있다가, 공격받으면 공격한 상대를 쫓아가 반격한다 (끝까지 잊지 않는다)
class NeutralAI extends AI {
    constructor(options = {}) {
        super(options);
        this.enemy = null;
    }

    get attitude() {
        return this.enemy ? "hostile" : "neutral";
    }

    isHostileTo(other) {
        return other === this.enemy;
    }

    onAttacked(attacker) {
        this.enemy = attacker;
    }

    act(ctx) {
        if (this.enemy && !this.enemy.alive) this.enemy = null;
        return this.enemy ? this.stepToward(this.enemy) : null;
    }
}

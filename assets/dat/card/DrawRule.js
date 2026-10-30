// 드로우 조건. CardSystem.notify(event, data)로 사건이 오면 on()이 이번에 뽑을 장수를 돌려준다.
// 새 조건은 이 클래스를 상속해서 on()만 바꾸면 된다. 지금 오는 사건:
//   "turn" { turn }       — 플레이어가 한 턴을 마칠 때마다
//   "kill" { target }     — 플레이어가 무언가를 쓰러뜨렸을 때
class DrawRule {
    on(event, data, cards) {
        return 0;
    }
}

// n턴마다 count장
class EveryNTurnsDraw extends DrawRule {
    constructor(n = 5, count = 1) {
        super();
        this.n = n;
        this.count = count;
    }

    on(event, data) {
        return event === "turn" && data.turn % this.n === 0 ? this.count : 0;
    }
}

// 적을 쓰러뜨리면 count장
class KillDraw extends DrawRule {
    constructor(count = 1) {
        super();
        this.count = count;
    }

    on(event) {
        return event === "kill" ? this.count : 0;
    }
}

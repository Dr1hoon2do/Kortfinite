// 제단 (제단 방의 지형지물). 담당: 제단 에이전트가 채운다.
// 계약: type "altar", 생성 데이터 { extra: 저장된 상태(roomState가 돌려준 것), seed: 이 방의 난수 씨, floor: 층 번호 }.
//   roomState() → 방을 나갔다 다시 와도 이어질 JSON (예: { used: true }). interact(ctx) → ctx.run.ui.altar.open(this).
class Altar extends Prop {
    constructor(x, y, data = {}) {
        super(x, y, "altar", { type: "altar", name: "제단" });
        this.data = data;
        this.used = !!(data.extra && data.extra.used);
    }

    roomState() {
        return { used: this.used };
    }

    interact(ctx) {
        if (ctx.run.ui.altar) ctx.run.ui.altar.open(this);
        return true;
    }
}

EntityTypes.register("altar", (x, y, d) => new Altar(x, y, d));

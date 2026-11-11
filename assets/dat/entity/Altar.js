// 제단 (제단 방의 지형지물). 담당: 제단 에이전트가 채운다.
// 계약: type "altar", 생성 데이터 { extra: 저장된 상태(roomState가 돌려준 것), seed: 이 방의 난수 씨, floor: 층 번호 }.
//   roomState() → 방을 나갔다 다시 와도 이어질 JSON (예: { used: true }). interact(ctx) → ctx.run.ui.altar.open(this).
class Altar extends Prop {
    constructor(x, y, data = {}) {
        super(x, y, "altar", { type: "altar", name: "제단" });
        this.data = data;
        this.used = !!(data.extra && data.extra.used);
        // 요구·보상 종류는 방 시드로 고정 (방을 나갔다 와도 같다)
        const rng = Rng.make(Rng.mix(data.seed ?? 0, 4141));
        const r = rng();
        // 기본 "카드+돈" 50% · "피+돈" 25% · "카드+피" 25%
        this.demand = r < 0.5 ? "cardGold" : r < 0.75 ? "hpGold" : "cardHp";
        this.rewardKind = Rng.pick(rng, ["upgrade", "gear", "stat"]);
        this.floor = Math.max(1, data.floor ?? 1);
    }

    get gold() {
        return this.demand === "cardHp" ? 0 : this.floor * 20;
    }

    needsCard() {
        return this.demand !== "hpGold";
    }

    // 피 비용 (최대 체력의 %, 버림, 최소 1)
    hpCost(maxHp) {
        if (this.demand === "cardGold") return 0;
        return Math.max(1, Math.floor(maxHp * (this.demand === "hpGold" ? 25 : 15) / 100));
    }

    roomState() {
        return { used: this.used };
    }

    interact(ctx) {
        const dlg = ctx.run.ui.altar;
        if (this.used && !(dlg && dlg.pending === this)) {
            MessageLog.add("제단은 이미 힘을 잃었다 (이미 썼다)", "#c8b890");
            return true;
        }
        if (dlg) dlg.open(this);
        return true;
    }
}

EntityTypes.register("altar", (x, y, d) => new Altar(x, y, d));

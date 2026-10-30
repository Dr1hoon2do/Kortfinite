// 상인 (상점 방의 주민). 말을 걸면 거래 창(ShopDialog)이 뜬다.
// 때릴 수도 있다: 맞으면 화가 나서 덤비고(NeutralAI), 다시는 거래하지 않는다. 쓰러뜨리면 가진 돈을 떨어뜨린다.
// stock: [{ card, price, sold }] — 방을 만들 때 굴린다 (RoomGen). 카드 빼기는 여러 번 할 수 있고 뺄 때마다 값이 오른다 (Run.removeCost, 상점마다 처음부터)
class Merchant extends Entity {
    static NAMES = ["철수", "덕배", "만복", "봉식", "칠복", "용팔", "갑돌", "춘삼"];

    constructor(x, y, data = {}) {
        super(x, y, "villager_merchant", {
            type: "merchant",
            name: data.name ?? "상인",
            stats: { maxHp: 30, attack: 5, defense: 2 },
            tags: ["creature", "human", "npc", "merchant"],
            ai: new NeutralAI({ sight: 99 })
        });
        this.stock = data.stock ?? [];
        this.money = data.money ?? 60;
    }

    get angry() {
        return !!this.ai.enemy;
    }

    get interactable() {
        return true;
    }

    interact(ctx) {
        if (this.angry) {
            MessageLog.add(`${josa(this.displayName, "은는")} 화가 나서 거래하지 않는다`, "#f0a0a0");
            return true;
        }
        ctx.run.ui.shop.open(this);
        return true;
    }

    static LINES = [
        "어서 오세요. 이 깊은 곳까지 오시다니, 대단하시네요.",
        "물건은 좋아요. 값은… 깊이만큼 비싸죠.",
        "카드가 너무 많으면 손이 무거워요. 빼 드릴까요?",
        "여기선 저를 때리지 마세요. 저도 꽤 셉니다."
    ];

    line() {
        const rng = (this.world && this.world.rng) || Math.random;
        return Merchant.LINES[Math.floor(rng() * Merchant.LINES.length)];
    }
}

EntityTypes.register("merchant", (x, y, d) => new Merchant(x, y, d));

// 상인을 쓰러뜨리면 가진 돈을 얻는다
Events.on(GameEvent.KILLED, ({ killer, target }) => {
    if (!(target instanceof Merchant) || !(killer instanceof Player)) return;
    killer.money += target.money;
    MessageLog.add(`상인이 가진 ${target.money} G를 챙겼다`, "#f0d878");
});

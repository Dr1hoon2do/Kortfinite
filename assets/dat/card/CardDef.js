// 카드 종류 정의표. TileDef처럼 id로 성질을 찾는다. 실제로 들고 있는 한 장은 Card.
//
// type: "item"  — 아이템(소지품). 인벤토리 패에 있고 덱/묘지로 가지 않는다. 바닥에 떨어뜨리거나 주울 수 있다.
//                 consumable이면 쓰면 사라지고(소모품), 아니면 쓸 수 없는 재료다.
//       "skill" — 행동 카드. 덱 → 행동 패 → 묘지를 돈다. 덱에서 뽑아야 패에 들어오고, 쓰면 묘지로 간다.
//                 플레이어의 모든 행동(이동, 공격, 방어, 주문)은 행동 카드로 한다. 가방(인벤토리)에는 못 넣는다.
//
// use(ctx): 카드 효과. ctx = { user, world, cards, turns, card, target }. 연출 단계 배열(AnimQueue 스텝들)을 돌려주고,
//           쓸 수 없으면 null. use가 없는 카드는 쓸 수 없다. 카드를 쓰는 것은 턴을 쓰지 않는다 (턴은 뽑기·대기로만 지난다).
//
// slot: 장착 부위 ("hand" 손, "waist" 허리, "back" 등). 부위마다 한 장만. 장착해도 패(인벤토리 패)에 남아 한 자리를 차지한다.
// stats: 장착하면 오르는 능력치 { attack, defense, speed, actionHand, invHand } (Gear.js)
// grants: 장착하면 덱에 들어오는 행동 카드 [{ id, n }]. 해제하면 그 카드들이 빠지고, 다시 장착하면 있던 자리(패/덱/묘지)로 돌아온다.
// strike: 공격 카드 { pct(공격력의 %), vs: { tags, mult }(그 태그 대상에게 배수), push(밀어내는 칸) } (ActionCards.js)
// 모든 카드는 1장씩이다 (묶이지 않는다). stack은 1로 고정 (Card.count도 늘 1).
// cost: 카드 비용 { energy } | { mana } | { hp } | { rest }. 주문은 카드마다 다르다 (Spell.js, card.cost)
//       energy(기력)는 턴마다 가득 찬다. rest n은 n턴 동안 카드를 못 뽑는다.
// price: 상점에서 살 때 기준 값.
// rarity: 보상·상점에 나오는 행동 카드의 희귀도 ("common" | "uncommon" | "rare"). 없으면 보상에 안 나온다 (시작 카드, 장비 카드).
//
// target: 칸을 골라서 쓰는 카드면 { range, radius, walk?, entity? }. 쓸 때 대상 지정 모드로 들어가고, 고른 칸이 ctx.target { x, y }로 온다.
//         range  — 플레이어에서 고를 수 있는 칸까지의 거리 (맨해튼). walk면 걸어서 갈 수 있는 칸만 (이동 카드)
//         radius — 고른 칸을 중심으로 효과가 닿는 범위 (정사각형, 1이면 3x3)
class CardDef {
    static defs = new Map();

    static register(id, def) {
        const material = def.type === "item" && !def.consumable && !def.use && !def.slot;
        CardDef.defs.set(id, { id, consumable: false, use: null, target: null, cost: null, slot: null, stats: null, grants: null, material, price: 1, ...def, stack: 1 });
    }

    // 장착 부위 이름 (새 부위는 여기 한 줄)
    static SLOTS = { hand: "손", waist: "허리", back: "등" };

    static slotName(slot) {
        return CardDef.SLOTS[slot] ?? slot;
    }

    static resolve(id) {
        return id;
    }

    static RESOURCE_NAMES = { energy: "기력", mana: "마나", hp: "체력", gold: "돈" };

    // 비용 { mana: 5 } → "마나 5" / "기력 1" / "포만감 20" / "체력 3" / "쉼 2" / 0이면 "비용 없음". 비용이 없는 카드는 ""
    static costText(cost) {
        if (!cost) return "";
        const list = Object.entries(cost).filter(([, n]) => n);
        if (!list.length) return Object.keys(cost).length ? "비용 없음" : "";
        return list.map(([r, n]) => (r === "rest" ? `쉼 ${n}` : `${CardDef.RESOURCE_NAMES[r] ?? r} ${n}`)).join(" · ");
    }

    // 좁은 카드 딱지용: "기1 마1 체1"
    static costShort(cost) {
        if (!cost) return "";
        const short = { energy: "기", mana: "마", hp: "체", gold: "G", rest: "쉼" };
        const list = Object.entries(cost).filter(([, n]) => n);
        if (!list.length) return Object.keys(cost).length ? "무료" : "";
        return list.map(([r, n]) => `${short[r] ?? r}${n}`).join(" ");
    }

    static inRange(def, user, x, y) {
        return Math.abs(x - user.x) + Math.abs(y - user.y) <= def.target.range;
    }

    // 고른 칸 (x, y) 주변 radius 안의 칸들
    static area(def, x, y) {
        const r = def.target.radius;
        const tiles = [];
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) tiles.push([x + dx, y + dy]);
        }
        return tiles;
    }

    static get(id) {
        return CardDef.defs.get(id);
    }

    // 카드에 붙는 종류 이름
    static kindName(def) {
        if (def.spell) return "주문";
        if (def.type === "skill") return def.token ? "장비 카드" : "행동";
        if (def.gem) return "젬";
        if (def.slot === "hand") return "도구 · 손";
        if (def.slot) return `장비 · ${CardDef.slotName(def.slot)}`;
        return def.consumable ? "소모품" : "물건";
    }
}

// 장비 체계: 장착하면 능력치가 오르고, 장비의 행동 카드(grants)가 덱에 들어온다.
//
// 장비 카드 정의 (CardDef):
//   slot:   부위 ("hand" 손, "waist" 허리, "back" 등). 부위마다 한 장만 장착된다
//   stats:  { attack, defense, speed, actionHand, invHand } — 장착하는 동안 오르는 능력치·패 크기
//   grants: [{ id, n }] — 장착하면 덱에 섞여 들어오는 행동 카드 (장비 카드, def.token)
//
// 장비 카드 흐름 (CardSystem.equip / unequip):
//   - 처음 장착: 장비 카드 n장을 새로 만들어 덱에 섞는다. 카드마다 data.src = 장비의 uid
//   - 해제: 패·덱·묘지에서 그 장비의 카드를 모두 빼고, 어디에 몇 장 있었는지(data.stash)를 장비에 적어 둔다
//   - 다시 장착: 적어 둔 자리(패 2장, 묘지 1장 …)로 그대로 돌려놓는다. 패에 자리가 없으면 남는 건 덱으로
// 장비 카드는 상자에 넣거나 팔 수 없다 (장비에서 나온 카드라서).
// 무작위 옵션은 없다 (장비는 종류마다 고정). 내구도도 없다.
class Gear {
    static STATS = {
        attack: "공격력", defense: "방어력", speed: "이동속도", actionHand: "행동 패", invHand: "인벤토리 패", maxHp: "최대 체력"
    };

    // 장착한 장비들의 능력치 합 (key: attack, defense, speed, actionHand, invHand, maxHp)
    static sum(cards, key) {
        let n = 0;
        for (const card of cards.equippedCards) n += card.def.stats?.[key] ?? 0;
        return n;
    }

    // 장비 카드 설명 줄: "· 공격력 +3", "· 덱에 [채굴] 3장"
    static lines(card) {
        const def = card.def;
        const lines = [];
        if (def.noLines) return lines; // 공방 장비: 설명 글이 이미 능력치를 말한다
        for (const [key, v] of Object.entries(def.stats ?? {})) if (v) lines.push(`· ${Gear.STATS[key] ?? key} ${v > 0 ? "+" : ""}${v}`);
        for (const g of def.grants ?? []) lines.push(`· 덱에 [${CardDef.get(g.id)?.name ?? g.id}] ${g.n}장`);
        return lines;
    }

    // 장비 한 장의 고유 번호 (저장된다). 장비 카드가 어느 장비에서 나왔는지 이걸로 안다
    static uid(card) {
        const data = card.ensureData();
        if (!data.uid) data.uid = Gear.newUid();
        return data.uid;
    }

    static newUid() {
        return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
    }

    // 이 장비에서 나온 카드인가
    static isFrom(card, uid) {
        return !!card.data && card.data.src === uid;
    }

    // 고정 장비 전부 (우두머리 보상 등)
    static all() {
        return [...CardDef.defs.values()].filter((d) => d.slot && d.type === "item").map((d) => d.id);
    }

    // 무작위 장비 한 장
    static random(rng = Math.random, ids = Gear.all()) {
        return new Card(ids[Math.floor(rng() * ids.length)]);
    }
}

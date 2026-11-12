// 젬: 스킬 카드의 젬 칸(0~3칸, Spell.js)에 끼워 비용·위력·추가 효과를 바꾼다.
//
// 젬 카드 한 장 = 종류(CardDef: gem_power 등) + 카드 데이터 { q: 품질 }
//   품질은 E D C B A (A가 가장 좋다). 안에서는 숫자 1~5 (E=1 … A=5). 수치는 종류마다 values[품질 - 1].
//   카드 이름은 "젬(증폭) B"처럼.
// 끼우기: 플레이어가 어디서나 (턴 안 씀). 패에 있는 스킬 카드에, 그 카드에 효과가 있는 젬만.
// 빼기:   플레이어가 직접 빼면 젬이 깨진다.
// 값 = 15 × 2.3^품질 × 젬 가치(종류마다)
class Gem {
    static BASE_PRICE = 15;
    static GROWTH = 2.3;
    static REMOVE_RATE = 0.3;   // 연금술사 빼기 수수료 = 젬 값 × 이것
    static REMOVE_MIN = 100;    // 수수료 최소
    static GRADES = ["", "E", "D", "C", "B", "A"]; // 품질 숫자 → 글자

    // 종류: name, frame, values[품질 1~5] (0이면 그 품질은 안 나옴), worth(젬 가치), text(v), info, fits(card) 그 카드에 효과가 있는가
    static KINDS = {}; // (지금 게임에는 젬이 없다 — 체계만 남겨 둔다)

    // 그 종류가 나오는 가장 낮은 품질
    static minTier(id) {
        const k = Gem.kind(id);
        return k.values.findIndex((v) => v > 0) + 1;
    }

    static kind(id) {
        return Gem.KINDS[CardDef.resolve(id)];
    }

    // 품질 1~5. 그 종류가 안 나오는 낮은 품질(예전 저장본)은 나오는 가장 낮은 품질로 올린다
    static quality(card) {
        return Math.max(card.data?.q ?? 1, Gem.minTier(card.defId));
    }

    static grade(card) {
        return Gem.GRADES[Gem.quality(card)];
    }

    // 수치는 늘 품질에서 정한다 (예전 저장본의 v는 무시)
    static value(card) {
        return Gem.kind(card.defId).values[Gem.quality(card) - 1];
    }

    static name(card) {
        return `${card.def.name} ${Gem.grade(card)}`;
    }

    static price(card) {
        const k = Gem.kind(card.defId);
        return Math.max(1, Math.floor(Gem.BASE_PRICE * Gem.GROWTH ** Gem.quality(card) * k.worth));
    }

    static describe(card) {
        const k = Gem.kind(card.defId);
        return `${k.text(Gem.value(card))}\n${k.info}\n주문 카드의 빈 젬 칸에 끼운다. 직접 빼면 깨진다.`;
    }

    static summary(card) {
        return Gem.kind(card.defId).text(Gem.value(card));
    }

    // ---- 저장 형태 { d, x }로 (스킬 카드 안에 끼운 젬) ----
    static valueOf(saved) {
        return Gem.value(Card.load(saved));
    }

    static priceOf(saved) {
        return Gem.price(Card.load(saved));
    }

    static lineOf(saved) {
        const card = Card.load(saved);
        return `${card.name}: ${Gem.kind(card.defId).text(Gem.value(card))}`;
    }

    // ---- 굴리기 ----
    // 품질 tier의 젬 한 장
    static roll(id, tier, rng = Math.random) {
        tier = Math.max(tier, Gem.minTier(id));
        const card = new Card(id);
        card.data = { q: tier };
        return card;
    }

    static rollTier(min, max, rng = Math.random) {
        return min + Math.floor(rng() * (max - min + 1));
    }

    // 아무 종류나 (품질 min~max). 그 품질에 안 나오는 종류(환원은 C부터, 치유는 B부터)는 뺀다
    static rollAny(min, max, rng = Math.random) {
        const tier = Gem.rollTier(min, max, rng);
        const ids = Object.keys(Gem.KINDS).filter((id) => Gem.minTier(id) <= tier);
        return Gem.roll(ids[Math.floor(rng() * ids.length)], tier, rng);
    }

    // ---- 끼우기·빼기 ----
    // 이 젬을 이 카드에 끼울 수 있는가. 안 되면 이유 글자, 되면 ""
    static whyNot(card, gemCard) {
        if (!card.def.spell) return "스킬 카드에만 끼울 수 있다";
        const { sockets, gems } = Spell.data(card);
        if (!sockets) return "젬 칸이 없다";
        if (gems.length >= sockets) return "젬 칸이 꽉 찼다";
        if (!Gem.kind(gemCard.defId).fits(card)) return "이 카드에는 효과가 없다";
        return "";
    }

    // 패의 젬을 스킬 카드(패·덱·묘지 어디든)에 끼운다 (턴 안 씀)
    static socket(cards, card, gemCard) {
        const why = Gem.whyNot(card, gemCard);
        if (why) {
            MessageLog.add(why, "#c8b890");
            return false;
        }
        if (cards.removeFromHand(gemCard) < 0) return false;
        const d = Spell.data(card);
        card.data = { cost: d.cost, sockets: d.sockets, ...(card.data ?? {}), gems: [...d.gems, gemCard.save()] };
        cards._changed();
        MessageLog.add(`${card.name}에 ${josa(gemCard.name, "을를")} 끼웠다`, "#c8a0f8");
        return true;
    }

    // index번 젬을 뺀다. keep이면 젬 카드를 돌려주고, 아니면 깨진다 (null)
    static unsocket(cards, card, index, keep) {
        const gems = [...Spell.data(card).gems];
        const saved = gems.splice(index, 1)[0];
        if (!saved) return null;
        card.data = { ...card.data, gems };
        const gem = Card.load(saved);
        cards._changed();
        if (!keep) {
            MessageLog.add(`${josa(gem.name, "을를")} 억지로 빼다가 깨뜨렸다`, "#f0a060");
            return null;
        }
        return gem;
    }

    static removeFee(saved) {
        return Math.max(Gem.REMOVE_MIN, Math.floor(Gem.priceOf(saved) * Gem.REMOVE_RATE));
    }
}

for (const [id, k] of Object.entries(Gem.KINDS)) {
    CardDef.register(id, {
        type: "item", name: k.name, gem: true, material: false,
        description: k.info, price: Gem.BASE_PRICE, sprite: "cards", frame: k.frame
    });
}

// 카드 공방 데이터(GameData.characters)의 캐릭터를 게임 캐릭터로 만든다.
//   - 이름·특징·능력(글)·스탯·시작 덱·시작 장비는 데이터에서 읽는다 (공방 '캐릭터' 탭).
//   - 능력의 실제 동작은 이 파일의 CHARS[캐릭터 id]에 짜 둔다 (없으면 글만 있는 능력).
//     형식은 장비(EquipImpl.js의 EQUIP)와 같은 훅이다: dealt · turnStart · roomStart · hit · kill · moved
//     (캐릭터 능력은 장비처럼 늘 켜져 있다: Equip.active가 같이 부른다)
// 캐릭터가 하나도 없으면 [모험가] 기본 캐릭터로 시작한다.
const CHARS = {
    // 모험가: 능력 없음 (기본 캐릭터)
    adventurer: {},

    // 방패병: 전투방에 들어가면 방어력만큼 방어도 (2턴)
    shield_knight: {
        roomStart(user) {
            const v = user.stats.defense;
            user.addBlock(v, 2);
            MessageLog.add(`방패병: 방어도 +${v} (2턴)`, "#8cc8f0");
        }
    },

    // 마도사: 새 턴이 시작될 때마다 마나 +1
    arcanist: {
        turnStart(user) {
            const got = CardOps.mana(user, 1);
            return got ? [new PopupAnim(user, `마나 +${got}`, "#7cb0f0")] : [];
        }
    }
};

class Chars {
    static list = [];   // 쓸 수 있는 캐릭터들 (공방 데이터 순서)

    static DEFAULT = {
        id: "adventurer", name: "모험가", trait: "균형 잡힌 평범한 모험가.", ability: "", hp: 40, atk: 5, def: 5, speed: 3, mana: 20, energy: 3,
        actionHand: 4, invHand: 4, gold: 50, deck: [], equipment: []
    };

    static load() {
        const raw = (typeof GAME_DATA !== "undefined" && GAME_DATA.characters) || [];
        Chars.list = raw.length ? raw.map((c) => Chars.normalize(c)) : [{ ...Chars.DEFAULT }];
        for (const c of Chars.list) if (!CHARS[c.id] && (c.ability ?? "").trim()) console.warn("캐릭터 능력 동작이 아직 없다 (data/CharImpl.js에 추가):", c.id);
    }

    // 빠진 값은 기본 캐릭터 값으로 채운다
    static normalize(c) {
        const d = Chars.DEFAULT;
        const n = (v, def) => (Number.isFinite(+v) && v !== "" && v !== null && v !== undefined ? +v : def);
        return {
            id: c.id, name: c.name ?? c.id, trait: c.trait ?? "", ability: c.ability ?? "", tags: c.tags ?? [],
            hp: Math.max(1, n(c.hp, d.hp)), atk: n(c.atk, d.atk), def: n(c.def, d.def), speed: n(c.speed, d.speed),
            mana: n(c.mana, d.mana), energy: n(c.energy, d.energy), actionHand: Math.max(1, n(c.actionHand, d.actionHand)), invHand: n(c.invHand, d.invHand),
            gold: n(c.gold, d.gold),
            deck: (c.deck ?? []).filter((m) => m && CardDef.get(m.id)).map((m) => ({ id: m.id, count: Math.max(1, n(m.count, 1)) })),
            equipment: (c.equipment ?? []).filter((m) => m && CardDef.get(m.id)).map((m) => ({ id: m.id }))
        };
    }

    // id의 캐릭터. 없으면 첫 캐릭터
    static get(id) {
        if (!Chars.list.length) Chars.load();
        return Chars.list.find((c) => c.id === id) ?? Chars.list[0];
    }

    // 시작 덱 [[id, n]] (비어 있으면 기본 카드)
    static deckOf(c) {
        return c.deck.length ? c.deck.map((m) => [m.id, m.count]) : CardSystem.STARTER;
    }
}

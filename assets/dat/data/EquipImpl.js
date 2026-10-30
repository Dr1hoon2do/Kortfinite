// 카드 공방 데이터(GameData.equipment)의 장비를 게임 장비로 만든다.
//   - 이름·부위·희귀도·값·설명(효과 글)·태그는 데이터에서 읽는다.
//   - 실제 동작은 이 파일의 EQUIP[장비 id]에 짜 둔다. 새 장비가 데이터에 생기면 EQUIP에 한 덩어리를 추가한다
//     (tools/import_data.py가 빠진 id를 알려 준다).
//
// 장비는 소지품(인벤토리) 패의 카드다. 장착해도 소모되거나 사라지지 않고 패에 그대로 남아 있으면서(착용 중 표시) 효과를 준다.
// 해제하면 그 순간부터 효과가 없다. 장착·해제는 턴을 쓰지 않는다 (전투 중에는 아래 패, 지도 화면에서는 [장비] 창).
// 효과는 "장착한 동안 읽는" 방식이라 장착·해제할 때 따로 되돌릴 것이 없다:
//   stats      — 능력치 (공격력·방어력·이동속도·행동 패·인벤토리 패·최대 체력). Gear.sum이 장착한 장비만 더한다
//   dealt      — dealt(피해, 공격자, 대상) → 바뀐 피해. 플레이어가 주는 피해가 정해질 때 (Status.modify)
//   turnStart  — turnStart(플레이어, 월드) → 연출 배열. 새 턴이 시작될 때
//   roomStart  — roomStart(플레이어, 월드). 전투방에 들어갈 때 (방어도·마나가 채워진 다음)
//   kill       — kill(플레이어, 쓰러뜨린 대상). 플레이어가 적을 쓰러뜨렸을 때
//   (icon: card_glyphs 칸 이름, color)
const EQUIP = {
    // 구부러진 단검: 바로 옆 칸 대상에게 주는 피해 +25%
    bent_dagger: {
        icon: "dagger", color: "#c8c0a8",
        dealt(dmg, user, target) {
            return Equip.adjacent(user, target) ? Math.floor(dmg * 125 / 100) : dmg;
        }
    },

    // 마력석 꽂힌 마법서: 턴이 시작될 때마다 마나 +2 (전투방에 들어갈 때도)
    mana_book: {
        icon: "book", color: "#78a8f0",
        turnStart(user) {
            const got = CardOps.mana(user, 2);
            return got ? [new PopupAnim(user, `마나 +${got}`, "#7cb0f0")] : [];
        },
        roomStart(user) {
            CardOps.mana(user, 2);
        }
    },

    // 붉은 부적: 적을 쓰러뜨리면 체력 2 회복
    red_charm: {
        icon: "heart", color: "#e0605a",
        kill(user) {
            CardOps.heal(user, 2);
        }
    },

    // 철모: 전투방에 들어가면 방어도 6 (2턴)
    iron_helm: {
        icon: "crown", color: "#a8b0c0",
        roomStart(user) {
            user.addBlock(6, 2);
            MessageLog.add("철모: 방어도 +6 (2턴)", "#8cc8f0");
        }
    },

    // 가죽 갑옷: 방어력 +2
    leather_armor: { icon: "shield", color: "#b08860", stats: { defense: 2 } },

    // 낡은 장화: 이동속도 +1
    worn_boots: { icon: "boot", color: "#a89070", stats: { speed: 1 } },

    // 작업용 벨트: 행동 패 +1
    work_belt: { icon: "chain", color: "#c0a060", stats: { actionHand: 1 } }
};

// 장착한 장비의 효과를 부르는 곳 (규칙 코드가 부른다)
class Equip {
    // 지금 장착 중인 장비들의 동작 [EQUIP 항목]
    static active(player) {
        const p = player ?? Player.current;
        if (!p || !p.cards) return [];
        return p.cards.equippedCards.map((c) => EQUIP[c.defId]).filter(Boolean);
    }

    static adjacent(a, b) {
        return !!a && !!b && Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
    }

    // 플레이어가 주는 피해 보정 (Status.modify가 부른다)
    static dealt(dmg, source, target) {
        if (!(source instanceof Player) || dmg <= 0) return dmg;
        for (const e of Equip.active(source)) if (e.dealt) dmg = e.dealt(dmg, source, target);
        return dmg;
    }

    // 새 턴 시작 (TurnManager). 연출 배열
    static turnStart(player, world) {
        const out = [];
        for (const e of Equip.active(player)) if (e.turnStart) out.push(...(e.turnStart(player, world) ?? []));
        return out;
    }

    // 전투방에 들어갈 때 (Run.enter)
    static roomStart(player, world) {
        for (const e of Equip.active(player)) if (e.roomStart) e.roomStart(player, world);
    }
}

Events.on(GameEvent.KILLED, ({ target, killer, world }) => {
    if (!(killer instanceof Player) || target === killer) return;
    for (const e of Equip.active(killer)) if (e.kill) e.kill(killer, target, world);
});

// ---------- 데이터 → 카드 정의 ----------
class EquipContent {
    static ids = [];

    static load() {
        EquipContent.ids = [];
        for (const e of GAME_DATA.equipment ?? []) {
            const impl = EQUIP[e.id];
            if (!impl) {
                console.warn("장비 동작이 아직 없다 (data/EquipImpl.js에 추가):", e.id);
                continue;
            }
            const frame = CardKit.list.length;
            CardDef.register(e.id, {
                type: "item", sprite: "kicons", frame, kit: true, icon: impl.icon ?? "star", color: impl.color ?? "#e8d9b8",
                name: e.name, slot: e.slot, rarity: e.rarity, price: e.price ?? 50, tags: e.tags ?? [],
                stats: impl.stats ?? null, gear: true, noLines: true, // 설명은 공방 글 그대로 (능력치 줄을 따로 안 붙인다)
                effect: e.effect ?? "",
                text: () => GameContent.render(e.effect),
                short: () => GameContent.render(e.effect).split("\n")[0]
            });
            CardKit.list.push(CardDef.get(e.id));
            EquipContent.ids.push(e.id);
        }
    }

    // 장비 카드 한 장
    static create(id) {
        return new Card(id);
    }
}

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
//   hit        — hit(플레이어, 맞은 대상, 월드). 플레이어가 적에게 피해를 입혔을 때 (체력이 깎인 경우)
//   kill       — kill(플레이어, 쓰러뜨린 대상). 플레이어가 적을 쓰러뜨렸을 때
//   (icon: card_glyphs 칸 이름, color)
const EQUIP = {
    // 배낭: 소지품 패 +3
    bag: { icon: "chain", color: "#b08860", stats: { invHand: 3 } },

    // 구부러진 동전: 적에게 피해를 입힐 때마다 내 주변 3x3 칸에 동전이 1개 떨어진다. 그 칸으로 가면 5G, 턴이 끝나면 사라진다
    bent_coin: {
        icon: "coin", color: "#e8c040",
        hit(user, target, world) {
            Equip.dropCoin(user, world);
        }
    },

    // 조잡한 방패: 방어력 +20%
    crude_shield: { icon: "shield", color: "#a8a090", stats: { defensePct: 20 } },

    // 녹슨 단검: 옆칸 대상에게 입히는 피해 +35%
    rusty_dagger: {
        icon: "dagger", color: "#b08a6a",
        dealt(dmg, user, target) {
            return Equip.adjacent(user, target) ? Math.floor(dmg * 135 / 100 + 1e-9) : dmg;
        }
    },

    // 공구허리띠: 행동 패 +1
    tool_belt: { icon: "chain", color: "#c0a060", stats: { actionHand: 1 } }
};

// 장착한 장비의 효과를 부르는 곳 (규칙 코드가 부른다)
class Equip {
    // 지금 장착 중인 장비들의 동작 [EQUIP 항목]
    static active(player) {
        const p = player ?? Player.current;
        if (!p || !p.cards) return [];
        return p.cards.equippedCards.map((c) => EQUIP[c.defId]).filter(Boolean);
    }

    // 내 주변 3x3 칸 중 빈 칸 하나에 동전을 떨어뜨린다 (구부러진 동전)
    static dropCoin(user, world) {
        if (!world || !user) return;
        const spots = [];
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const x = user.x + dx;
            const y = user.y + dy;
            if (!(dx || dy) || !world.getChunkAt(x, y) || !world.isWalkable(x, y)) continue;
            if (world.entitiesAt(x, y).some((o) => o.isHazard || o.solid)) continue;
            spots.push([x, y]);
        }
        if (!spots.length) return;
        const [x, y] = spots[Math.floor(Math.random() * spots.length)];
        world.spawn(new Hazard(x, y, "coin", { life: 1, name: "동전" }));
    }

    // 플레이어가 (칸 이동으로) 새 칸에 섰다: 그 칸의 동전을 줍는다 (ChunkManager.moveEntity · 순간이동)
    static stepped(player, world) {
        for (const o of [...world.entitiesAt(player.x, player.y)]) {
            if (!(o instanceof Hazard) || o.kind !== "coin" || !o.world) continue;
            o.remove(world);
            player.money += 5;
            MessageLog.add("동전을 주웠다: +5G", "#f0d060");
            const q = world.run ? world.run.queue : null;
            if (q) q.play(new PopupAnim(player, "+5G", "#f0d060"));
        }
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

Events.on(GameEvent.DAMAGED, ({ target, source, world, dealt }) => {
    if (!(source instanceof Player) || target === source || !(dealt > 0) || target.attitude !== "hostile") return;
    for (const e of Equip.active(source)) if (e.hit) e.hit(source, target, world);
});

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
                name: e.name, slot: e.slot || "trinket", rarity: e.rarity, price: e.price ?? 50, tags: e.tags ?? [],
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

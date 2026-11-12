// 바닥에 떨어진 것: 전투 보상, 보물 방의 물건, 상점 진열대. 길을 막지 않아서 위를 지나다닐 수 있고, 지나가기만 해서는 줍지 않는다.
// 그 칸 바로 위에 서서 상호작용(손 버튼·E, 서 있는 칸을 다시 탭해도 된다)해야 가진다 (interact → Pickups.collect). 옆칸에서는 안 된다.
//   gold  돈 더미 (상호작용하면 바로)
//   card  카드 (행동 카드는 덱에, 물건·장비는 패에). price가 있으면 그 값을 내고 산다 (돈이 모자라면 못 가진다)
//   gear  장비 (패에, 자리가 있어야)
//   group 같은 group인 것들은 하나만 가질 수 있다 (하나를 가지면 나머지는 사라진다: 전투 보상 카드 3장 중 1장)
// item: { key(그 방에서 겹치지 않는 이름), kind, gold, card, price, group }
// 방을 나갔다 다시 와도 이미 가진 것(key)은 다시 안 나온다 (Run.rooms[id].taken).
// 그림은 HazardOverlay가 그린다 (받침 + 아이콘 + 이름·값).
class Pickup extends Hazard {
    constructor(x, y, data = {}) {
        super(x, y, "pickup", {});
        this.item = data.item;
        this.displayName = data.item.kind === "gold" ? `${data.item.gold} G` : data.item.card.name;
        this.stoodMsg = false;
    }

    // 플레이어가 이 칸 위에 서 있을 때만 상호작용할 수 있다 (옆칸에서는 안 된다)
    get interactable() {
        const p = Player.current;
        return !!p && p.x === this.x && p.y === this.y;
    }

    // 상호작용: 줍기·사기 (돈이 모자라거나 패가 가득 차면 메시지만)
    interact(ctx) {
        if (!this.world) return false;
        Pickups.collect(ctx.player, this, ctx.world);
        return true;
    }

    // 설치물 틱: 아무것도 안 한다
    tick() {
        return [];
    }
}
EntityTypes.register("pickup", (x, y, d) => new Pickup(x, y, d));

class Pickups {
    static run = null; // 지금 런 (Run 생성자가 넣는다)

    // 플레이어가 (x, y)에 섰다 (걷기·순간이동): 줍지는 않고, 물건 위에 서면 한 번 안내만 한다 (실수로 줍지 않게)
    static stepped(player, world) {
        for (const o of world.entitiesAt(player.x, player.y)) {
            if (!(o instanceof Pickup) || !o.world || o.stoodMsg) continue;
            o.stoodMsg = true;
            MessageLog.add(`${o.displayName} 위에 섰다. 상호작용(손 버튼·E)으로 가진다`, "#c8b890");
        }
    }

    static say(text) {
        MessageLog.add(text, "#c8b890");
    }

    static collect(player, pickup, world) {
        const it = pickup.item;
        const run = Pickups.run;
        if (it.kind === "gold") {
            player.money += it.gold;
            MessageLog.add(`${it.gold} G를 주웠다`, "#f0d878");
        } else {
            const card = it.card;
            if (it.price && player.money < it.price) {
                Pickups.say(`${card.name}: ${it.price} G가 필요하다 (지금 ${player.money} G)`);
                return;
            }
            if (card.isSkill) player.cards.addToDeck(card);
            else if (!player.cards.addToHand(card)) {
                Pickups.say(`패가 가득 차서 ${josa(card.name, "을를")} 가질 수 없다`);
                return;
            }
            if (it.price) {
                player.money -= it.price;
                MessageLog.add(`${josa(card.name, "을를")} ${it.price} G에 샀다`, "#e8c860");
                if (it.offer) it.offer.sold = true;
            } else MessageLog.add(`${josa(card.name, "을를")} ${card.isSkill ? "덱에" : ""} 얻었다`.replace("  ", " "), "#e8c860");
        }
        if (run) run.taken.add(it.key);
        pickup.remove(world);
        // 한 묶음에서 하나를 가졌다: 나머지는 사라진다
        if (it.group) {
            for (const o of [...world.hazards]) {
                if (o === pickup || !(o instanceof Pickup) || o.item.group !== it.group) continue;
                if (run) run.taken.add(o.item.key);
                o.remove(world);
            }
            MessageLog.add("나머지는 사라졌다", "#a89878");
        }
        const q = world.run ? world.run.queue : run ? run.queue : null;
        if (q) q.play(new PopupAnim(player, it.kind === "gold" ? `+${it.gold}G` : it.card.name, "#f0d878"));
    }
}

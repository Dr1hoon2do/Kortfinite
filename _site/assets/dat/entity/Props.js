// 방 안의 지형지물: 입구, 출구, 모닥불, 보물 상자. 길을 막고, 부서지지 않는다(invulnerable).
// 상호작용(손 버튼·E, 또는 바로 옆에서 탭)하면 interact(ctx)가 불린다. ctx = { player, world, turns, run }
class Prop extends Entity {
    constructor(x, y, sprite, options = {}) {
        super(x, y, sprite, { deathVerb: "부서졌다", ...options, tags: ["prop", ...(options.tags ?? [])] });
        this.invulnerable = true;
    }

    act() {
        return null;
    }

    // 그림이 바뀌지 않는 지형지물은 청크 그림에 구워진다
    get baked() {
        return true;
    }

    get interactable() {
        return !!this.interact;
    }
}

// 입구: 방에 들어온 자리 (꾸밈. 되돌아갈 수는 없다)
class Entrance extends Prop {
    constructor(x, y) {
        super(x, y, "ladder_up", { type: "entrance", name: "입구" });
    }

    interact() {
        MessageLog.add("들어온 길이다. 되돌아갈 수는 없다", "#c8b890");
        return true;
    }
}

// 출구: 방의 적을 모두 쓰러뜨리면 열린다. 열린 출구를 쓰면 지도에서 다음 방을 고른다
class Exit extends Prop {
    constructor(x, y) {
        super(x, y, "exit_locked", { type: "exit", name: "출구" });
        this.open = false;
    }

    // 열리고 닫힐 때 그림이 바뀌어서 굽지 않는다
    get baked() {
        return false;
    }

    setOpen(value) {
        this.open = value;
        this.sprite = value ? "stairs_down" : "exit_locked";
        if (this.sr) this.sr.setSprite(Resource.image(this.sprite));
    }

    interact(ctx) {
        if (!this.open) {
            const n = ctx.world.hostiles(ctx.player).length;
            MessageLog.add(`출구가 잠겨 있다. 적을 모두 쓰러뜨려야 열린다 (남은 적 ${n})`, "#e8b860");
            return true;
        }
        ctx.run.leaveRoom();
        return true;
    }
}

// 모닥불 (휴식처): 한 번만 쉴 수 있다 (RestDialog)
class Campfire extends Prop {
    constructor(x, y, data = {}) {
        super(x, y, "campfire", { type: "campfire", name: "모닥불" });
        this.used = !!data.used;
    }

    interact(ctx) {
        if (this.used) {
            MessageLog.add("이미 쉬었다. 출구로 나가자", "#c8b890");
            return true;
        }
        ctx.run.ui.rest.open(this);
        return true;
    }
}

// 보물 상자: 열면 돈과 장비·젬·물약 중 하나 (RewardDialog)
class TreasureChest extends Prop {
    constructor(x, y, data = {}) {
        super(x, y, "chest", { type: "treasure", name: "보물 상자" });
        this.opened = !!data.opened;
    }

    interact(ctx) {
        if (this.opened) {
            MessageLog.add("빈 상자다", "#c8b890");
            return true;
        }
        this.opened = true;
        ctx.run.openTreasure(this);
        return true;
    }
}

EntityTypes.register("entrance", (x, y) => new Entrance(x, y));
EntityTypes.register("exit", (x, y) => new Exit(x, y));
EntityTypes.register("campfire", (x, y, d) => new Campfire(x, y, d));
EntityTypes.register("treasure", (x, y, d) => new TreasureChest(x, y, d));

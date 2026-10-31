class Player extends Entity {
    static BASE_HP = 40;
    static BASE_ATTACK = 5;
    static BASE_DEFENSE = 5;
    static BASE_SPEED = 3;     // 이동속도: [기본이동] 한 장으로 걷는 칸 수
    static MAX_ENERGY = 3;     // 기력: 행동 카드 비용. 턴이 지날 때마다 가득 찬다
    static MAX_MANA = 20;
    static current = null;     // 카드 설명(피해 수치 등)이 보는 플레이어

    // options.cards: CardSystem 옵션 { actionHand, invHand, rules }
    constructor(x, y, options = {}) {
        super(x, y, "player", {
            type: "player", name: "당신",
            stats: { maxHp: Player.BASE_HP, attack: Player.BASE_ATTACK, defense: Player.BASE_DEFENSE },
            tags: ["creature", "human", "player"]
        });
        Player.current = this;
        this.kills = 0;
        this.money = options.money ?? 50;
        // 마나: 주문 비용. 저절로 차지 않는다 — 방에 들어갈 때 조금, 마나 물약, 명상, 모닥불로 찬다
        this.maxMana = Player.MAX_MANA;
        this.mana = this.maxMana;
        // 기력: 행동 카드 비용. 턴이 지날 때마다 가득 찬다
        this.maxEnergy = Player.MAX_ENERGY;
        this.energy = this.maxEnergy;
        this.speed = Player.BASE_SPEED;
        // 방어도: [{ v: 남은 양, t: 남은 턴 }]. 따로 세고, 곧 끝나는 것부터 깎인다
        this.blocks = [];
        // 쉼: 남은 턴 동안 카드를 뽑지 못한다 (주문 비용 "쉼 n")
        this.drawLock = 0;
        // 상태 이상·버프 (Status.js): 독, 화상, 약화, 취약, 속박, 재생, 힘, 가시
        this.status = {};
        // 영구히 오른 능력치 (카드 효과: 처치·방 정리 때 조금씩) { maxHp, attack, defense, maxMana, speed }
        this.perm = {};
        // 재료: { id: 개수 } — 적이 떨어뜨리고, 카드 강화에 쓴다
        this.mats = {};
        // 이 방을 정리하면 할 일 (카드 효과 "방을 정리하면 ~"): [{ fx, card }]
        this.onClear = [];
        this._statVer = 0;
        this.cards = new CardSystem(options.cards);   // 패(행동·인벤토리)/덱/묘지/장비

        this.goal = null;           // 걸어갈 칸 { x, y, entity } — 적이 없는 방에서만 (카드 없이 걷는다)
        this.wantsInteract = null;  // 상호작용할 칸 { x, y }
        this.wantsCard = null;      // 쓰려고 고른 패의 카드 { card, target? }
        this.wantsDraw = false;     // 뽑기 (1턴)
        this.wantsWait = false;     // 대기 (1턴)
        this.pendingDir = null;     // 테스트·디버그용: 카드 없이 한 칸 걷기(부딪히면 공격) + 1턴. 화면 입력으로는 안 생긴다
    }

    update() {
        this.refreshGear();
    }

    // 예전 이름: 독·속박 수치 (Status)
    get poison() { return Status.get(this, "poison"); }
    set poison(v) { Status.set(this, "poison", v); }
    get root() { return Status.get(this, "root"); }
    set root(v) { Status.set(this, "root", v); }

    // 힘·영구 능력치가 바뀌었다 (능력치 다시 계산)
    statsChanged() {
        this._statVer++;
        this.refreshGear();
    }

    // 영구히 능력치 올리기
    addPerm(key, n) {
        this.perm[key] = (this.perm[key] ?? 0) + n;
        if (key === "maxMana") this.maxMana = Player.MAX_MANA + this.perm.maxMana;
        if (key === "maxHp") this.stats.hp += n;
        this.statsChanged();
    }

    // 방에 적이 없는가 (적이 없으면 땅을 탭해 카드 없이 걸어 다닌다)
    get safe() {
        return !!this.world && this.world.hostiles(this).length === 0;
    }

    // 땅 탭: 적이 없는 방이면 그 칸으로 걸어간다 (턴·카드 없이). 상호작용할 것(출구·상인·모닥불·상자)을 탭하면 옆까지 가서 쓴다.
    // 적이 있는 방에서는 아무것도 하지 않는다 (움직임은 이동 카드로). 바로 옆의 상호작용 대상은 언제든 쓴다
    setGoal(x, y) {
        const entity = this.world.entityAt(x, y);
        const usable = entity && entity !== this && entity.interactable && !this.isHostileTo(entity);
        if (usable && Math.abs(x - this.x) + Math.abs(y - this.y) === 1) {
            this.wantsInteract = { x, y };
            return true;
        }
        // 적을 탭하면 그 적이 다음 턴에 할 일을 알려 준다
        if (entity && entity !== this && entity.ai instanceof EnemyAI && entity.alive) {
            MessageLog.add(EnemyMoves.describe(entity, this), "#f0c8a0");
            this.clearGoal();
            return false;
        }
        if (!this.safe) {
            this.clearGoal();
            return false;
        }
        if (entity && entity !== this && !usable) {
            this.clearGoal();
            return false;
        }
        this.goal = { x, y, entity: usable ? entity : null };
        return true;
    }

    clearGoal() {
        this.goal = null;
    }

    // 이번 행동. { type: "card", card, target } | { type: "draw" } | { type: "wait" } | { type: "interact", x, y } | { type: "walk", path } | null
    nextAction() {
        if (Modal.isOpen) return null;
        if (this.pendingDir) {
            const dir = this.pendingDir;
            this.pendingDir = null;
            this.clearGoal();
            return { type: "move", dir };
        }
        if (this.wantsCard) {
            const { card, target, picks } = this.wantsCard;
            this.wantsCard = null;
            this.clearGoal();
            return { type: "card", card, target, picks };
        }
        if (this.wantsDraw) {
            this.wantsDraw = false;
            this.clearGoal();
            return { type: "draw" };
        }
        if (this.wantsWait) {
            this.wantsWait = false;
            this.clearGoal();
            return { type: "wait" };
        }
        if (this.wantsInteract) {
            const { x, y } = this.wantsInteract;
            this.wantsInteract = null;
            this.clearGoal();
            return { type: "interact", x, y };
        }
        if (this.goal) return this._walkStep();
        return null;
    }

    // 걸어가기 (적이 없는 방): 목표까지 길을 찾아 한 번에 걷는다. 상호작용 대상이면 옆에 닿은 뒤 쓴다
    _walkStep() {
        const g = this.goal;
        this.clearGoal();
        if (!this.safe) return null;
        const w = this.world;
        if (g.entity && Math.abs(g.x - this.x) + Math.abs(g.y - this.y) === 1) return { type: "interact", x: g.x, y: g.y };
        const path = Pathfinder.find(w, this.x, this.y, g.x, g.y, { mover: this });
        if (!path || !path.length) {
            MessageLog.add("거기까지 가는 길이 없다", "#c8b890");
            return null;
        }
        if (g.entity) path.pop(); // 대상 칸 앞에서 멈춘다
        return { type: "walk", path, then: g.entity ? { x: g.x, y: g.y } : null };
    }

    get attitude() {
        return "player";
    }

    // 플레이어는 우호가 아닌 상대를 칠 수 있다. 상호작용 대상(상인·출구 …)은 화났을 때만 적
    isHostileTo(other) {
        if (other.interactable) return other.attitude === "hostile";
        return other.attitude !== "friendly";
    }

    // ---------- 장비 (Gear.js) ----------
    gear(key) {
        return Gear.sum(this.cards, key);
    }

    // 장비가 바뀌면 능력치 다시 계산
    refreshGear() {
        const key = this.cards.version + ":" + this._statVer;
        if (this._gearVersion === key) return;
        this._gearVersion = key;
        const pm = this.perm ?? {};
        this.stats.attack = Player.BASE_ATTACK + this.gear("attack") + (pm.attack ?? 0) + Status.get(this, "str");
        const def = Player.BASE_DEFENSE + this.gear("defense") + (pm.defense ?? 0) + Status.get(this, "harden");
        this.stats.defense = Math.floor(def * (100 + this.gear("defensePct")) / 100 + 1e-9); // 방어력 % 증가는 버림
        this.speed = Player.BASE_SPEED + this.gear("speed") + (pm.speed ?? 0); // 둔화는 Status.speed가 따로 반영한다
        const max = this.baseMaxHp + this.gear("maxHp") + (pm.maxHp ?? 0);
        if (max !== this.stats.maxHp) {
            this.stats.maxHp = max;
            this.stats.hp = Math.min(this.stats.hp, max);
        }
    }

    // 최대 체력 (모닥불·보상으로 오른다. 장비 보너스는 빼고)
    get baseMaxHp() {
        return this._baseMaxHp ?? Player.BASE_HP;
    }

    set baseMaxHp(v) {
        this._baseMaxHp = v;
        this._gearVersion = null;
        this.statsChanged();
    }

    // ---------- 방어도 ----------
    get block() {
        return this.blocks.reduce((s, b) => s + b.v, 0);
    }

    addBlock(v, turns) {
        if (v > 0) this.blocks.push({ v, t: turns });
    }

    // 피해를 방어도로 막고 남은 피해를 돌려준다. 곧 끝나는 방어도부터 깎는다
    absorb(damage) {
        this.blocks.sort((a, b) => a.t - b.t);
        for (const b of this.blocks) {
            if (damage <= 0) break;
            const used = Math.min(b.v, damage);
            b.v -= used;
            damage -= used;
        }
        this.blocks = this.blocks.filter((b) => b.v > 0);
        return damage;
    }

    // ---------- 턴 ----------
    // 턴이 지난 뒤 (뽑기·대기, 주변이 다 움직인 다음): 방어도 남은 턴 -1, 기력 가득, 쉼 -1
    startTurn() {
        for (const b of this.blocks) b.t--;
        this.blocks = this.blocks.filter((b) => b.t > 0 && b.v > 0);
        this.energy = this.maxEnergy;
        // 무기력: 새 턴에 얻는 기력이 줄어든다
        const lazy = Status.applyLate(this);
        if (lazy) {
            this.energy = Math.max(0, this.energy - lazy);
            MessageLog.add(`무기력으로 기력이 ${lazy} 줄었다 (${this.energy}/${this.maxEnergy})`, "#9a8cf0");
        }
        if (this.drawLock > 0) this.drawLock--;
    }

    // 방에 들어갈 때: 방어도·쉼을 비우고 기력을 채운다
    enterRoom() {
        this.blocks = [];
        Status.clear(this);
        this.onClear = [];
        this.drawLock = 0;
        this.energy = this.maxEnergy;
        this.clearGoal();
    }

    // 카드를 쓰겠다고 정한다. 고르기가 필요한 카드(버릴 카드 · 덱에서 찾기)는 고르기 창을 먼저 연다
    requestCard(card, target = null) {
        const pk = card.def.picker;
        if (!pk) {
            this.wantsCard = { card, target };
            return;
        }
        const cfg = pk(this, card);
        if (cfg.min > 0 && cfg.cards.length < cfg.min) {
            MessageLog.add(`${card.name}: 고를 카드가 없다`, "#c8b890");
            return;
        }
        if (!cfg.cards.length || !CardPicker.viewer) {
            this.wantsCard = { card, target, picks: [] };
            return;
        }
        CardPicker.open(cfg.title, cfg.cards, cfg.min, cfg.max, (picks) => { this.wantsCard = { card, target, picks }; });
    }

    // 재료 더하기 / 가진 수
    addMat(id, n = 1) {
        this.mats[id] = (this.mats[id] ?? 0) + n;
    }

    matCount(id) {
        return this.mats[id] ?? 0;
    }

    // 이 카드를 지금 쓸 수 있는가 (비용 + 속박이면 이동 카드는 못 쓴다)
    canUse(card) {
        if (this.root > 0 && card.target && (card.target.walk || card.target.move)) return false;
        return !card.cost || this.canPay(card.cost);
    }

    // 비용: energy(기력), mana, hp(남는 체력이 1 이상일 때만), rest(쉼: 그만큼 못 뽑는다, 언제든 낼 수 있다)
    canPay(cost) {
        if (cost.energy && this.energy < cost.energy) return false;
        if (cost.mana && this.mana < cost.mana) return false;
        if (cost.hp && this.stats.hp <= cost.hp) return false; // 체력 비용으로 쓰러질 수는 없다
        if (cost.gold && this.money < cost.gold) return false;
        return true;
    }

    lackText(cost) {
        if (cost.energy && this.energy < cost.energy) return `기력이 모자란다 (${this.energy}/${cost.energy}) · 턴을 넘기면 가득 찬다`;
        if (cost.mana && this.mana < cost.mana) return `마나가 모자란다 (${this.mana}/${cost.mana})`;
        if (cost.gold && this.money < cost.gold) return `돈이 모자란다 (${this.money}/${cost.gold} G)`;
        if (cost.hp && this.stats.hp <= cost.hp) return `체력이 모자란다 (체력 ${cost.hp}을 쓰려면 ${cost.hp + 1} 이상 있어야 한다)`;
        return "";
    }

    pay(cost) {
        if (cost.energy) this.energy -= cost.energy;
        if (cost.mana) this.mana -= cost.mana;
        if (cost.hp) this.stats.hp = Math.max(1, this.stats.hp - cost.hp);
        if (cost.gold) this.money -= cost.gold;
        if (cost.rest) {
            this.drawLock += cost.rest;
            MessageLog.add(`${this.drawLock}턴 동안 카드를 뽑을 수 없다 (쉼)`, "#a0b8e8");
        }
    }

    save() {
        return {
            hp: this.stats.hp, maxHp: this.baseMaxHp, money: this.money, kills: this.kills, mana: this.mana, perm: this.perm,
            cards: this.cards.save(), mats: this.mats
        };
    }

    load(data) {
        this.money = data.money;
        this.kills = data.kills ?? 0;
        this.mana = data.mana ?? this.maxMana;
        this.cards.load(data.cards);
        this.mats = data.mats ?? {};
        this.perm = data.perm ?? {};
        this.maxMana = Player.MAX_MANA + (this.perm.maxMana ?? 0);
        this.baseMaxHp = data.maxHp ?? Player.BASE_HP;
        this.stats.hp = Math.min(data.hp, this.stats.maxHp);
    }
}

// ---- 이벤트를 듣는 쪽: 처치 수 ----
Events.on(GameEvent.KILLED, ({ killer, target }) => {
    if (!(killer instanceof Player) || !target.hasTag("creature")) return;
    killer.kills++;
    killer.cards.notify("kill", { target });
}, { priority: 10 });

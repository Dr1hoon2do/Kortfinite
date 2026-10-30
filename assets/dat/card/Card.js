// 실제로 들고 있는 카드 한 장. 모든 카드는 1장씩이다 (count는 늘 1).
class Card {
    static _nextId = 1;

    constructor(defId, count = 1) {
        this.id = Card._nextId++;
        this.defId = CardDef.resolve(defId);
        this.count = count;
        // 카드마다 다른 데이터 (장비: uid·장비 카드 자리 — Gear.js / 장비 카드: src / 주문: 비용, 젬 — Spell.js / 젬: 품질)
        this.data = null;
        this._drawn = 0; // 패에 들어온 순서 (자동 이동 중 버릴 카드 고르기). 저장하지 않는다
    }

    ensureData() {
        if (!this.data) this.data = {};
        return this.data;
    }

    get name() {
        if (this.def.gem) return Gem.name(this);
        return this.def.name;
    }

    // 값: 주문·젬은 카드마다, 나머지는 정의의 값
    get price() {
        if (this.def.spell) return Spell.price(this);
        if (this.def.gem) return Gem.price(this);
        return this.def.price;
    }

    // 쓸 때 내는 비용 { energy: 1 } / { mana: 5 } 등. 주문은 카드마다 다르다 (Spell.js)
    get cost() {
        if (this.def.spell) return Spell.costObject(this);
        const d = this.def.cost;
        const keys = Card.costKeys(this.def);
        if (keys.length < 2) return d;
        // 비용이 여러 종류로 적힌 카드는 "그중 하나": 카드 한 장마다 하나로 정해져 있다 (data.pay)
        const key = keys.includes(this.data?.pay) ? this.data.pay : keys[0];
        return { [key]: d[key] };
    }

    // 정의에 적힌 비용 종류들 (기력·마나·체력 …)
    static costKeys(def) {
        return Object.keys(def.cost ?? {}).filter((k) => def.cost[k]);
    }

    // 비용을 고를 수 있는 카드면 이 카드의 비용 종류를 정한다 (이미 있으면 그대로)
    rollCost(rng = Math.random) {
        const keys = Card.costKeys(this.def);
        if (keys.length > 1 && !keys.includes(this.data?.pay)) this.ensureData().pay = keys[Math.floor(rng() * keys.length)];
        return this;
    }

    // 칸을 골라 쓰는 카드면 { range, radius, ... }. 주문·행동 카드는 플레이어 능력치에 따라 달라진다
    get target() {
        if (this.def.spell) return Spell.target(this);
        return typeof this.def.target === "function" ? this.def.target(this) : this.def.target;
    }

    // 새 카드 한 장. 주문과 젬은 무작위로 굴린다 (상점, 던전 보상 등). 저장본 불러오기는 Card.load
    static create(id, rng = Math.random) {
        id = CardDef.resolve(id);
        if (Spell.kinds.has(id)) return Spell.roll(id, rng);
        if (CardDef.get(id)?.gem) return Gem.roll(id, Gem.rollTier(1, 3, rng), rng);
        return new Card(id).rollCost(rng);
    }

    // 설명 전체
    get description() {
        if (this.def.spell) return Spell.describe(this);
        if (this.def.gem) return Gem.describe(this);
        const lines = [];
        if (this.def.slot) lines.push(`(부위: ${CardDef.slotName(this.def.slot)})`, ...Gear.lines(this));
        const text = typeof this.def.text === "function" ? this.def.text(this) : this.def.description;
        if (text) lines.push(text);
        if (this.isToken) lines.push(`(장비 카드: ${this.def.from ?? "장비"}를 해제하면 덱에서 빠진다)`);
        return lines.join("\n");
    }

    // 설명 (verbose: 자세히 "공격력 100%(5)", 아니면 "5"). [[키:글자]] 색 표시가 들어 있다
    text(verbose = CardText.verbose) {
        return CardText.with(verbose, () => this.description);
    }

    // 짧은 설명 (카드 그림 아래 좁은 칸)
    get summary() {
        if (this.def.spell) return Spell.summary(this);
        if (this.def.gem) return Gem.summary(this);
        if (typeof this.def.short === "function") return this.def.short(this);
        if (this.def.slot) return Gear.lines(this).map((l) => l.slice(2)).join(" / ");
        return this.def.description;
    }

    get def() {
        return CardDef.get(this.defId);
    }

    // 임시 카드 (카드 효과로 패에 생긴 것): 쓰거나 버리면 사라지고, 방을 나가면 없어진다
    get isTemp() {
        return !!(this.data && this.data.temp);
    }

    // 행동 카드 (덱 → 행동 패 → 묘지)
    get isSkill() {
        return this.def.type === "skill";
    }

    get isAction() {
        return this.isSkill;
    }

    // 장비에서 나온 행동 카드 (장비를 해제하면 빠진다. 상자에 넣거나 팔 수 없다)
    get isToken() {
        return !!this.def.token;
    }

    get maxStack() {
        return this.def.stack;
    }

    get stackable() {
        return this.maxStack > 1;
    }

    get label() {
        return this.count > 1 ? `${this.name} x${this.count}` : this.name;
    }

    save() {
        const data = { d: this.defId };
        if (this.count > 1) data.c = this.count;
        if (this.data) data.x = this.data;
        return data;
    }

    static load(data) {
        const card = new Card(data.d);
        if (data.x) card.data = JSON.parse(JSON.stringify(data.x));
        return card;
    }

    static loadAll(list) {
        return list.map((data) => Card.load(data));
    }
}

// 플레이어의 카드 존: 패(hand), 덱(deck, 드로우 더미), 묘지(graveyard). equipped는 패 안에서 장착한 카드 표시.
// - 패는 행동 패와 인벤토리 패로 나뉜다 (한 배열 hand에 같이 들어 있고 종류로 나눈다):
//     행동 카드(스킬)는 행동 패에만 (최대 actionLimit장)
//     아이템은 인벤토리 패에 먼저 들어가고(최대 invLimit장), 넘치면 행동 패의 빈자리를 쓴다
//     예) 행동 5 · 인벤토리 3: 나무 4 + 행동 카드 4 → 됨 / 나무 2 + 행동 카드 6 → 안 됨
//   CardSystem.fits(행동 장수, 아이템 장수)가 이 규칙이다.
// - 아이템은 줍기로 들어오고, 버리면 바닥에 떨어지고, 소모품은 쓰면 사라진다.
// - 행동 카드는 덱 → 패 → 묘지를 돈다. 덱이 비면 묘지를 섞어 덱으로 되돌린다 (순환).
// - 뽑기는 플레이어의 "뽑기" 행동(1턴)이나 카드 효과(통찰)로만 일어난다.
// - 장착: 부위(slot)가 있는 아이템은 패(인벤토리 패)에 있는 채로 부위마다 한 장 장착된다. 장착해도 패 한 자리를 차지한다.
//   장착한 장비의 능력치(행동 패·인벤토리 패 크기 포함)가 오르고, 장비 카드(grants)가 덱에 들어온다 (Gear.js).
//   장착·해제·빼기 뒤 패가 넘치게 되면 막는다. 장착한 카드를 패에서 빼면(버리기, 팔기, 상자) 저절로 해제된다.
// 바뀔 때마다 version이 올라서 UI가 다시 그릴 때를 안다.
class CardSystem {
    static ACTION_HAND = 4;
    static INV_HAND = 4;

    constructor(options = {}) {
        this.baseAction = options.actionHand ?? CardSystem.ACTION_HAND;
        this.baseInv = options.invHand ?? CardSystem.INV_HAND;
        this.hand = [];
        this.equipped = {};   // 부위 → 장착한 장비 카드 (패 안의 카드)
        this.deck = [];       // 맨 뒤가 맨 위 (pop으로 뽑는다)
        this.graveyard = [];  // 맨 뒤가 가장 최근
        this.exhausted = [];  // 소멸: 이번 방에서 다시 안 나온다 (다음 방에 들어가면 덱으로 돌아온다)
        this.rules = options.rules ?? [];
        this.version = 0;
        this.drawSeq = 0;
    }

    // ---------- 패 크기 ----------
    get actionLimit() {
        return this.baseAction + Gear.sum(this, "actionHand");
    }

    get invLimit() {
        return this.baseInv + Gear.sum(this, "invHand");
    }

    // 패 전체 크기 (행동 + 인벤토리)
    get handLimit() {
        return this.actionLimit + this.invLimit;
    }

    get actions() {
        return this.hand.filter((c) => c.isSkill);
    }

    get items() {
        return this.hand.filter((c) => !c.isSkill);
    }

    counts() {
        let a = 0;
        for (const c of this.hand) if (c.isSkill) a++;
        return { a, i: this.hand.length - a };
    }

    // 인벤토리 패를 넘쳐 행동 패 자리를 쓰는 아이템 수
    get overflow() {
        return Math.max(0, this.counts().i - this.invLimit);
    }

    // 행동 카드 a장, 아이템 i장이 패에 들어가는가
    static fits(a, i, actionLimit, invLimit) {
        return a + Math.max(0, i - invLimit) <= actionLimit;
    }

    fitsNow(a, i) {
        return CardSystem.fits(a, i, this.actionLimit, this.invLimit);
    }

    // 이 카드 한 장이 더 들어가는가
    canAdd(card) {
        const { a, i } = this.counts();
        return card.isSkill ? this.fitsNow(a + 1, i) : this.fitsNow(a, i + 1);
    }

    // 행동 카드를 더 못 받는다 (뽑기·회수가 실패한다)
    get actionFull() {
        const { a, i } = this.counts();
        return !this.fitsNow(a + 1, i);
    }

    // 아이템을 더 못 받는다 (줍기·사기·제작이 실패한다)
    get invFull() {
        const { a, i } = this.counts();
        return !this.fitsNow(a, i + 1);
    }

    // 예전 이름: 아이템을 더 못 받는다
    get handFull() {
        return this.invFull;
    }

    // ---------- 장착 ----------
    isEquipped(card) {
        return !!card.def.slot && this.equipped[card.def.slot] === card;
    }

    get equippedCards() {
        return Object.values(this.equipped);
    }

    // 이 부위의 장비가 card로 바뀌면(null이면 비면) 패 최대가 어떻게 되는가 { a: 행동 패, i: 인벤토리 패 }
    _limitsWith(slot, card) {
        const old = this.equipped[slot];
        const st = (c, k) => (c && c.def.stats ? c.def.stats[k] ?? 0 : 0);
        return {
            a: this.actionLimit - st(old, "actionHand") + st(card, "actionHand"),
            i: this.invLimit - st(old, "invHand") + st(card, "invHand")
        };
    }

    // 장착 (패의 장비를 그 부위에. 같은 부위의 다른 장비는 풀린다). 성공하면 true
    equip(card) {
        const slot = card.def.slot;
        if (!slot || !this.hand.includes(card)) return false;
        if (this.isEquipped(card)) return true;
        const old = this.equipped[slot] ?? null;
        const lim = this._limitsWith(slot, card);
        const tokens = old ? this.tokensInHand(old) : 0;
        const { a, i } = this.counts();
        if (!CardSystem.fits(a - tokens, i, lim.a, lim.i)) {
            MessageLog.add(`패가 넘쳐서 ${josa(card.name, "을를")} 장착할 수 없다`, "#c8b890");
            return false;
        }
        if (old) this._pullTokens(old);
        this.equipped[slot] = card;
        this._pushTokens(card);
        MessageLog.add(`${josa(card.name, "을를")} ${CardDef.slotName(slot)}에 장착했다${old ? ` (${old.name} 해제)` : ""}`, "#e8c860");
        this._changed();
        return true;
    }

    // 해제 (장비는 패에 남는다). 패가 넘치게 되면 막는다. force면 그냥 푼다 (쓰러졌을 때)
    unequip(card, force = false) {
        if (!this.isEquipped(card)) return false;
        if (!force && !this.canUnequip(card, true)) return false;
        delete this.equipped[card.def.slot];
        const pulled = this._pullTokens(card);
        if (!force) MessageLog.add(`${josa(card.name, "을를")} 해제했다${pulled ? ` (장비 카드 ${pulled}장이 빠졌다)` : ""}`, "#c8b890");
        this._changed();
        return true;
    }

    // 이 장비를 풀어도(stays: 패에 남는다 / 아니면 패에서도 빠진다) 패가 넘치지 않는가
    canUnequip(card, stays) {
        const lim = this._limitsWith(card.def.slot, null);
        const { a, i } = this.counts();
        const ok = CardSystem.fits(a - this.tokensInHand(card), i - (stays ? 0 : 1), lim.a, lim.i);
        if (!ok) MessageLog.add(`패가 넘쳐서 ${josa(card.name, "을를")} ${stays ? "해제할" : "뺄"} 수 없다 (먼저 카드를 줄이자)`, "#c8b890");
        return ok;
    }

    // 패에 있는 이 장비의 장비 카드 수
    tokensInHand(gear) {
        if (!gear.def.grants || !gear.data?.uid) return 0;
        return this.hand.filter((c) => Gear.isFrom(c, gear.data.uid)).length;
    }

    // 이 장비에서 나온 카드를 패·덱·묘지에서 모두 빼고, 어디에 몇 장 있었는지 장비에 적어 둔다. 뺀 장수
    _pullTokens(gear) {
        if (!gear.def.grants) return 0;
        const uid = Gear.uid(gear);
        const stash = {};
        let n = 0;
        for (const zone of ["hand", "deck", "graveyard"]) {
            const list = this[zone];
            for (let k = list.length - 1; k >= 0; k--) {
                const c = list[k];
                if (!Gear.isFrom(c, uid)) continue;
                list.splice(k, 1);
                const s = (stash[c.defId] ??= { hand: 0, deck: 0, graveyard: 0 });
                s[zone]++;
                n++;
            }
        }
        gear.data.stash = stash;
        return n;
    }

    // 장비 카드를 넣는다: 적어 둔 자리가 있으면 그대로, 처음이면 덱에 섞는다. 패에 자리가 없으면 덱으로
    _pushTokens(gear) {
        if (!gear.def.grants) return;
        const uid = Gear.uid(gear);
        const stash = gear.data.stash ?? null;
        let shuffle = false;
        for (const { id, n } of gear.def.grants) {
            const s = stash?.[id] ?? { hand: 0, deck: n, graveyard: 0 };
            const where = [...Array(Math.min(s.hand, n)).fill("hand"), ...Array(Math.min(s.graveyard, n)).fill("graveyard")].slice(0, n);
            while (where.length < n) where.push("deck");
            for (const zone of where) {
                const card = new Card(id);
                card.data = { src: uid };
                if (zone === "hand" && this.canAdd(card)) {
                    card._drawn = ++this.drawSeq;
                    this.hand.push(card);
                } else if (zone === "graveyard") this.graveyard.push(card);
                else {
                    this.deck.push(card);
                    shuffle = true;
                }
            }
        }
        delete gear.data.stash;
        if (shuffle) this.shuffle(this.deck);
    }

    _changed() {
        // 패에서 빠진 장비는 장착도 풀린다 (장비 카드도 빠진다)
        for (const [slot, card] of Object.entries(this.equipped)) {
            if (this.hand.includes(card)) continue;
            delete this.equipped[slot];
            this._pullTokens(card);
        }
        this.version++;
    }

    // ---------- 패 ----------
    // 패에 넣기 (줍기, 회수, 사기 등). 자리가 없으면 false
    addToHand(card) {
        if (!this.canAdd(card)) return false;
        card._drawn = ++this.drawSeq;
        this.hand.push(card);
        this._changed();
        return true;
    }

    // 패에 이 종류가 몇 장 있는가
    countOf(defId) {
        let n = 0;
        for (const card of this.hand) if (card.defId === defId) n += card.count;
        return n;
    }

    // 패에서 이 종류를 count장 덜어낸다 (제작 재료 등). 모자라면 아무것도 안 하고 false
    takeFromHand(defId, count) {
        if (this.countOf(defId) < count) return false;
        for (let i = this.hand.length - 1; i >= 0 && count > 0; i--) {
            const card = this.hand[i];
            if (card.defId !== defId) continue;
            const used = Math.min(count, card.count);
            card.count -= used;
            count -= used;
            if (card.count === 0) this.hand.splice(i, 1);
        }
        this._changed();
        return true;
    }

    // 패의 카드 한 장을 떼어 돌려준다 (팔기 등). 장비 카드는 뗄 수 없다
    takeOne(card) {
        if (!this.hand.includes(card) || card.isToken) return null;
        if (this.removeFromHand(card) < 0) return null;
        return card;
    }

    // 패에서 빼기. 빠진 자리(index)를 돌려준다 (없으면 -1)
    // 장착한 장비를 빼서 패가 넘치게 되면 막는다 (-1). force면 그냥 뺀다 (쓰러졌을 때)
    removeFromHand(card, force = false) {
        const i = this.hand.indexOf(card);
        if (i < 0) return -1;
        if (!force && this.isEquipped(card) && !this.canUnequip(card, false)) return -1;
        if (this.isEquipped(card)) this.unequip(card, true);
        this.hand.splice(i, 1);
        this._changed();
        return i;
    }

    // 행동 카드를 덱에 넣고 섞는다
    addToDeck(card) {
        this.deck.push(card);
        this.shuffle(this.deck);
        this._changed();
    }

    exhaust(card) {
        this.exhausted.push(card);
        MessageLog.add(`${josa(card.name, "이가")} 소멸했다 (이번 방에서는 다시 안 나온다)`, "#a0b8e8");
        this._changed();
    }

    toGraveyard(card) {
        this.graveyard.push(card);
        this._changed();
    }

    // 섞기: 방에 들어갈 때 Run이 시드 난수(rng)를 넣어 준다 (새로고침해도 같은 순서)
    shuffle(list) {
        const rng = this.rng ?? Math.random;
        for (let i = list.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [list[i], list[j]] = [list[j], list[i]];
        }
        return list;
    }

    // 뽑을 카드가 있는가 (덱이나 묘지에)
    get canDraw() {
        return this.deck.length > 0 || this.graveyard.length > 0;
    }

    // 덱에서 count장 뽑는다. 덱이 비면 묘지를 섞어 덱으로 돌린다. 행동 패가 차면 멈춘다. 뽑은 카드들을 돌려준다.
    // over: 행동 패 제한을 넘어서도 뽑는다 (통찰)
    draw(count = 1, over = false) {
        const drawn = [];
        for (let i = 0; i < count; i++) {
            if (!over && this.actionFull) {
                MessageLog.add("행동 패가 가득 차서 뽑지 못했다", "#c8b890");
                break;
            }
            if (this.deck.length === 0) {
                if (this.graveyard.length === 0) {
                    MessageLog.add("덱도 묘지도 비어 있다", "#c8b890");
                    break;
                }
                this.deck = this.shuffle(this.graveyard);
                this.graveyard = [];
                MessageLog.add("묘지를 섞어 덱으로 되돌렸다", "#a0b8e8");
            }
            const card = this.deck.pop();
            card._drawn = ++this.drawSeq;
            this.hand.push(card);
            drawn.push(card);
            MessageLog.add(`${josa(card.name, "을를")} 뽑았다`, "#a0b8e8");
        }
        if (drawn.length) this._changed();
        return drawn;
    }

    // 덱·묘지에 있는 이 카드를 패로 가져온다 (기도). 못 하면 false
    fetch(card) {
        for (const zone of ["deck", "graveyard"]) {
            const i = this[zone].indexOf(card);
            if (i < 0) continue;
            if (this.actionFull) return false;
            this[zone].splice(i, 1);
            card._drawn = ++this.drawSeq;
            this.hand.push(card);
            this._changed();
            MessageLog.add(`${josa(card.name, "을를")} ${zone === "deck" ? "덱" : "묘지"}에서 가져왔다`, "#a0b8e8");
            return true;
        }
        return false;
    }

    // 묘지에서 가장 최근 카드 1장을 패로
    recall() {
        if (this.graveyard.length === 0) {
            MessageLog.add("묘지가 비어 있다", "#c8b890");
            return null;
        }
        if (this.actionFull) {
            MessageLog.add("행동 패가 가득 찼다", "#c8b890");
            return null;
        }
        const card = this.graveyard.pop();
        card._drawn = ++this.drawSeq;
        this.hand.push(card);
        this._changed();
        MessageLog.add(`${josa(card.name, "을를")} 묘지에서 가져왔다`, "#a0b8e8");
        return card;
    }

    // 패의 카드를 쓴다 (턴은 쓰지 않는다). 효과를 고르는 동안 카드는 패에서 빠져 있다 (회수가 자기 자신을 가져오지 않게).
    // 못 쓰면 원래 자리로 돌아가고 null.
    use(card, ctx) {
        const def = card.def;
        if (!def.use) {
            MessageLog.add(`${josa(def.name, "은는")} 쓸 수 없다`, "#c8b890");
            return null;
        }
        if (!this.hand.includes(card)) return null; // 고르는 사이에 버린 카드
        const cost = card.cost;
        if (cost && ctx.user && !ctx.user.canPay(cost)) {
            MessageLog.add(`${card.name}: ${ctx.user.lackText(cost)}`, "#c8b890");
            return null;
        }
        const index = this.removeFromHand(card);
        const steps = def.use({ ...ctx, cards: this, card });
        if (!steps) {
            this.hand.splice(index, 0, card);
            this._changed();
            return null;
        }
        if (!ctx.quiet) MessageLog.add(`${josa(card.name, "을를")} 썼다${cost ? ` (${CardDef.costText(cost)})` : ""}`, card.isSkill ? "#a0b8e8" : "#e8c860");
        if (cost && ctx.user) ctx.user.pay(cost, ctx.turns);
        if (card.isSkill) {
            if (card.isTemp) this._changed(); // 임시 카드는 쓰면 사라진다
            else if (card.def.exhaust) this.exhaust(card);
            else this.toGraveyard(card);
        }
        Events.emit(GameEvent.CARD_USED, { card, user: ctx.user });
        return steps;
    }

    // 패에서 버리기: 행동 카드는 묘지로 가고, 아이템은 돌려준다 (바닥에 떨어뜨리는 건 호출한 쪽에서)
    // byEffect: 카드 효과로 버려진 것 (원한은 이때만 터진다. 손으로 [묘지로] 하면 안 터진다)
    discard(card, byEffect = false) {
        if (this.removeFromHand(card) < 0) return null;
        if (card.isSkill && card.isTemp) return card;
        if (card.isSkill) {
            this.toGraveyard(card);
            MessageLog.add(`${josa(card.name, "을를")} 묘지에 버렸다`, "#a0b8e8");
            // 원한: 버려질 때 터지는 효과
            if (byEffect && card.def.grudge) card.def.grudge({ user: Player.current, cards: this, card, world: Player.current ? Player.current.world : null });
        }
        return card;
    }

    // 드로우 조건에 사건을 알린다 ("turn", "kill" 등). 조건들이 말한 만큼 뽑는다. (지금은 조건 없음)
    notify(event, data = {}) {
        if (!this.rules.length || !this.canDraw) return [];
        let count = 0;
        for (const rule of this.rules) count += rule.on(event, data, this);
        return count > 0 ? this.draw(count) : [];
    }

    // 시작 덱: [기본이동] 3, [기본공격] 3
    static starterDeck() {
        const cards = [];
        for (const [id, n] of CardSystem.STARTER) for (let i = 0; i < n; i++) cards.push(new Card(id));
        return cards;
    }

    static STARTER = [["step", 3], ["strike", 3]];

    // 방에 들어갈 때: 패·묘지의 행동 카드를 모두 덱으로 되돌려 섞고, 처음 패 count장을 뽑는다 (턴 안 씀).
    // 아이템(소모품·장비)은 패에 그대로 남는다
    resetForRoom(count) {
        const back = this.hand.filter((c) => c.isSkill);
        this.hand = this.hand.filter((c) => !c.isSkill);
        this.deck.push(...back, ...this.graveyard, ...this.exhausted);
        this.graveyard = [];
        this.exhausted = [];
        this.deck = this.deck.filter((c) => !c.isTemp);
        this.shuffle(this.deck);
        this._changed();
        return count > 0 ? this.draw(count) : [];
    }

    // 덱 전체 (패·덱·묘지의 행동 카드). 카드 빼기·덱 보기에 쓴다. 장비 카드는 뺀다
    get allActions() {
        return [...this.hand.filter((c) => c.isSkill), ...this.deck, ...this.graveyard, ...this.exhausted].filter((c) => !c.isToken && !c.isTemp);
    }

    // 덱에서 행동 카드 한 장을 아주 없앤다 (상점·모닥불 카드 빼기). 패·덱·묘지 어디에 있든
    removeCard(card) {
        for (const zone of ["hand", "deck", "graveyard", "exhausted"]) {
            const i = this[zone].indexOf(card);
            if (i < 0) continue;
            this[zone].splice(i, 1);
            this._changed();
            return true;
        }
        return false;
    }

    // 시작 덱 넣기 (새 런)
    giveStarter() {
        for (const card of CardSystem.starterDeck()) this.deck.push(card);
        this.shuffle(this.deck);
        this._changed();
    }

    // 저장/불러오기. 장착은 부위 → 패 자리
    save() {
        const list = (cards) => cards.map((c) => c.save());
        const eq = {};
        for (const [slot, card] of Object.entries(this.equipped)) eq[slot] = this.hand.indexOf(card);
        const keep = (cards) => cards.filter((c) => !c.isTemp);
        return { act: this.baseAction, inv: this.baseInv, eq, hand: list(keep(this.hand)), deck: list(keep([...this.deck, ...this.exhausted])), graveyard: list(keep(this.graveyard)) };
    }

    load(data) {
        this.baseAction = data.act ?? CardSystem.ACTION_HAND;
        this.baseInv = data.inv ?? CardSystem.INV_HAND;
        this.hand = Card.loadAll(data.hand);
        this.deck = Card.loadAll(data.deck);
        this.graveyard = Card.loadAll(data.graveyard);
        this.equipped = {};
        for (const [slot, i] of Object.entries(data.eq ?? {})) if (this.hand[i]?.def.slot === slot) this.equipped[slot] = this.hand[i];
        this.drawSeq = 0;
        for (const card of this.hand) card._drawn = ++this.drawSeq;
        this._changed();
    }
}

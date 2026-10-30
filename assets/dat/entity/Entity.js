// 월드 위의 모든 것: 플레이어, 동물, NPC, 나무·돌 같은 지형지물, 바닥 아이템.
// - tags: 종류를 묻는 꼬리표 (Set). 도구나 카드 효과가 "나무에게만", "동물에게만" 같은 조건을 거는 데 쓴다.
//         예: 나무 ["tree", "wood", "prop"], 소 ["creature", "animal", "cow"], 주민 ["creature", "human", "npc"]
// - type: 저장용 종류 이름. EntityTypes에 등록된 이름이어야 불러올 때 다시 만들 수 있다.
class Entity extends Component {
    static RIGHT = [1, 0];
    static LEFT = [-1, 0];
    static UP = [0, 1];
    static DOWN = [0, -1];
    static DIRS = [Entity.RIGHT, Entity.LEFT, Entity.UP, Entity.DOWN];

    // options: { name, stats, ai, loot, solid, deathVerb, tags, type }
    constructor(x, y, sprite, options = {}) {
        super();
        this.x = x;
        this.y = y;
        this.sprite = sprite;
        this.flipX = false;
        this.world = null;

        this.type = options.type ?? null;
        this.displayName = options.name ?? sprite;
        this.stats = new Stats(options.stats);
        this.loot = options.loot ?? [];   // 쓰러지면 그 자리에 떨어뜨리는 카드 id
        this.solid = options.solid ?? true; // false면 길을 막지 않고 부딪혀 공격 대상도 아니다 (아이템)
        this.deathVerb = options.deathVerb ?? "쓰러졌다";
        this.tags = new Set(options.tags ?? []);
        this._anims = []; // 턴 중에 생긴 연출 (emit). TurnManager가 그 턴 단계에 넣는다
        this.ai = null;
        if (options.ai) this.setAI(options.ai);
    }

    // 움직이지 않고 그림이 안 바뀌는 엔티티(지형지물)는 청크 그림에 같이 구워서 그린다 (ChunkRenderer).
    // 구운 엔티티는 오브젝트를 켜지 않아서 렌더러가 없다. 맞으면 입자·숫자(PropOverlay)로 보여 준다.
    get baked() {
        return false;
    }

    start() {
        this.sr = new SpriteRenderer(Resource.image(this.sprite), { orderInLayer: 2 });
        this.addComponent(this.sr);
        this.overlay = this.addComponent(new EntityOverlay(this));
        this.sync();
        this.applyFlip();
    }

    sync() {
        if (!this.world) return; // 아직 방에 없다 (런 시작 전 플레이어)
        const t = this.world.tileSize;
        this.transform.position = new Vector(this.x * t, this.y * t);
    }

    applyFlip() {
        if (this.sr) this.sr.flipX = this.flipX;
    }

    setAI(ai) {
        this.ai = ai;
        ai.entity = this;
    }

    hasTag(tag) {
        return this.tags.has(tag);
    }

    hasAnyTag(tags) {
        return tags.some((t) => this.tags.has(t));
    }

    get alive() {
        return this.stats.alive;
    }

    get attitude() {
        return this.ai ? this.ai.attitude : "neutral";
    }

    // 말을 걸 수 있는 엔티티 (NPC)
    get interactable() {
        return false;
    }

    isHostileTo(other) {
        return this.ai ? this.ai.isHostileTo(other) : false;
    }

    onAttacked(attacker) {
        if (this.ai) this.ai.onAttacked(attacker);
    }

    act(ctx) {
        return this.ai ? this.ai.act(ctx) : null;
    }

    // 이번 턴에 보여줄 연출 추가 (예: 머리 위 "수확!" 글자)
    emit(anim) {
        this._anims.push(anim);
    }

    takeAnims() {
        const list = this._anims;
        this._anims = [];
        return list;
    }

    // 저장: 종류, 위치, 체력(다쳤을 때만) + 종류별 상태
    save() {
        const data = { t: this.type, x: this.x, y: this.y };
        if (this.stats.hp !== this.stats.maxHp) data.hp = this.stats.hp;
        if (this.flipX) data.f = 1;
        if (this.built) data.b = 1; // 플레이어가 지은 것 (몬스터가 부수고, 침대면 플레이어 것)
        const ai = this.ai && this.ai.save ? this.ai.save() : null;
        if (ai) data.ai = ai;
        return Object.assign(data, this.saveState());
    }

    // 상속해서 종류별로 저장할 값 (이름, 소지품 등)
    saveState() {
        return {};
    }

    // 불러올 때. 상속하면 super.loadState(data)도 부른다
    loadState(data) {
        if (data.hp !== undefined) this.stats.hp = data.hp;
        if (data.f) this.flipX = true;
        if (data.b) this.built = true;
        if (data.ai && this.ai && this.ai.load) this.ai.load(data.ai);
    }
}

// 저장한 엔티티를 다시 만들기 위한 종류표. 새 엔티티 클래스는 파일 끝에서 register 한다.
//   EntityTypes.register("cow", (x, y, data) => new Cow(x, y));
class EntityTypes {
    static factories = new Map();

    static register(type, factory) {
        EntityTypes.factories.set(type, factory);
    }

    static create(type, x, y, data = {}) {
        const factory = EntityTypes.factories.get(type);
        if (!factory) throw new Error("알 수 없는 엔티티 종류: " + type);
        const entity = factory(x, y, data);
        entity.type = type;
        return entity;
    }

    static load(data) {
        const entity = EntityTypes.create(data.t, data.x, data.y, data);
        entity.loadState(data);
        return entity;
    }
}

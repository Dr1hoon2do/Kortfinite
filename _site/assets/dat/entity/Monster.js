// 몬스터: 방 안의 적. 방에 들어오면 처음부터 플레이어를 노린다 (방이 작아서 시야는 방 전체).
// 종류(KINDS)는 카드 공방 데이터(data/GameData.js)의 적에서 만든다 (data/EnemyImpl.js). 행동은 EnemyAI의 brain.
// lv: 층이 깊을수록 오른다 (체력 +30%, 공격 +1). rank: "normal" | "elite" | "boss"
// moves: 이동속도 (한 턴에 움직이는 칸 수). 둔화에 걸리면 줄어든다 (speedNow)
// 방어도(blocks): [{ v, t }] — 따로 턴을 세고 곧 끝나는 것부터 깎인다. 자기 턴이 시작될 때 턴이 하나 준다 (1턴짜리는 그때 사라진다)
// 새 몬스터: 공방 데이터에 적을 만들고 data/EnemyImpl.js에 행동을 짠다 + 스프라이트(entities/종류.png)
class Monster extends Entity {
    static KINDS = {};

    // 정예·보스: 이름 앞에 붙는 말, 능력치(체력·공격·방어) 배수. 정예만 1.5배, 보스는 배수 없음 (공방 스탯 그대로, 대신 패턴: 세 턴에 한 번 연속 행동)
    static RANKS = {
        normal: { title: "", hp: 1, attack: 1, defense: 1 },
        elite: { title: "정예", hp: 1.5, attack: 1.5, defense: 1.5 },
        boss: { title: "우두머리", hp: 1, attack: 1, defense: 1 }
    };
    static BOSS_DOUBLE_EVERY = 3; // 우두머리는 이 턴마다 한 번 한 턴에 두 번 움직인다

    // data: { lv, rank }
    constructor(x, y, kind, data = {}) {
        const k = Monster.KINDS[kind];
        const lv = data.lv ?? 1;
        const rank = data.rank ?? "normal";
        const R = Monster.RANKS[rank];
        const base = k.name + (lv > 1 ? ` Lv${lv}` : "");
        super(x, y, k.sprite ?? kind, {
            type: kind,
            name: R.title ? `${R.title} ${base}` : base,
            size: k.size ?? 1,
            // data.stats: 소환된 것처럼 능력치를 정해 줄 때 { hp, atk, def } (층·등급 보정 없이 그대로)
            stats: data.stats ? { maxHp: Math.max(1, data.stats.hp), attack: data.stats.atk, defense: data.stats.def } : {
                maxHp: Math.floor(k.hp * (1 + 0.3 * (lv - 1)) * R.hp + 1e-9),
                attack: Math.floor((k.attack + (lv - 1)) * R.attack + 1e-9),
                defense: Math.floor((k.defense + Math.floor((lv - 1) / 2)) * R.defense + 1e-9)
            },
            tags: ["creature", "monster", kind, ...(k.tags ?? []), ...(rank !== "normal" ? [rank] : [])],
            ai: new EnemyAI({ brain: kind })
        });
        this.kind = kind;
        this.lv = lv;
        this.rank = rank;
        this.moves = k.moves ?? 1;
        this.baseAttack = this.stats.attack;
        this.baseDefense = this.stats.defense;
        this.blocks = [];
    }

    // 한 턴에 움직이는 칸 (둔화 반영)
    get speedNow() {
        return Status.speed(this, this.moves);
    }

    // 힘·경질화가 바뀌면 공격력·방어력을 다시 계산한다 (Status.set이 부른다)
    statsChanged() {
        this.stats.attack = this.baseAttack + Status.get(this, "str");
        this.stats.defense = this.baseDefense + Status.get(this, "harden");
        const g = Status.get(this, "growth"); // 성장: 최대 체력 +수치
        if (this.baseMaxHp === undefined) this.baseMaxHp = this.stats.maxHp - (this._growth ?? 0);
        this._growth = g;
        this.stats.maxHp = this.baseMaxHp + g;
    }

    // ---------- 방어도 ----------
    get guard() {
        return this.blocks.reduce((s, b) => s + b.v, 0);
    }

    // 방어도 얻기 (turns: 자기 턴이 몇 번 시작될 때까지)
    addGuard(v, turns = 1) {
        if (v > 0) this.blocks.push({ v, t: turns });
    }

    // 자기 턴이 시작될 때: 방어도 턴이 줄고 끝난 것은 사라진다
    tickGuard() {
        for (const b of this.blocks) b.t--;
        this.blocks = this.blocks.filter((b) => b.t > 0 && b.v > 0);
    }

    // 방어도로 피해를 막고 남은 피해를 돌려준다 (곧 끝나는 것부터)
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
}


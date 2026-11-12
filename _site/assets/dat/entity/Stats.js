// 전투 능력치. 피해 = max(1, 공격력 - 방어력)
class Stats {
    constructor(options = {}) {
        this.maxHp = options.maxHp ?? 10;
        this.hp = options.hp ?? this.maxHp;
        this.attack = options.attack ?? 1;
        this.defense = options.defense ?? 0;
    }

    get alive() {
        return this.hp > 0;
    }

    damageFrom(attacker) {
        return Math.max(1, attacker.attack - this.defense);
    }
}

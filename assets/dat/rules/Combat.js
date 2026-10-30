// 공격 한 번의 로직: 피해 계산 → 맞은 쪽 반응(AI) → 죽음 처리 → 메시지.
// 연출(애니메이션)은 돌려주기만 하고, 재생은 TurnManager가 큐에 넣는다.
class Combat {
    // 가장 최근 hit의 결과 { target, dealt(깎인 체력), blocked(방어도로 막은 양), dies } — 흡혈·처치 효과가 읽는다
    static last = null;

    // 부딪혀 공격 (몬스터·상인의 공격): 공격 연출 + 공격력만큼 피해. 방어력은 피해를 줄이지 않는다 (방어도만 막는다).
    // 플레이어는 부딪혀 공격하지 않고 공격 카드로 친다
    static attack(attacker, target, world) {
        return Combat.strike(attacker, target, world, Math.max(1, attacker.stats.attack));
    }

    // 정해진 피해로 한 번 친다 (공격 카드, 부딪히기). using: 메시지에 붙일 카드 이름
    static strike(attacker, target, world, damage, using = null) {
        if (target.invulnerable) {
            MessageLog.add(`${josa(target.displayName, "은는")} 꿈쩍도 하지 않는다`, "#c8b890");
            return [new AttackAnim(attacker, target, world.tileSize)];
        }
        damage = Status.modify(damage, attacker, target);
        MessageLog.add(`${josa(attacker.displayName, "이가")} ${target.displayName}에게 ${damage} 피해${using ? ` (${using})` : ""}`,
            attacker instanceof Player ? "#e8d9b8" : "#f0a0a0");
        return [new AttackAnim(attacker, target, world.tileSize), ...Combat.hit(target, damage, attacker, world, "physical", false)];
    }

    // 피해 유형. 기본 공격은 물리. 주문은 Spell.register의 element
    static TYPES = { physical: "물리", heat: "열", cold: "냉기", shock: "전기", arcane: "마력", dark: "암흑", poison: "독" };

    // 피해 주기: 방어도가 먼저 막고, 체력이 0이 되면 방에서 빠진다.
    // 공격이 아닌 피해(폭발 등)도 이걸 부르고, 돌려받은 연출을 AnimQueue에 넣으면 된다.
    // mod: 약화·취약 보정을 할지 (Combat.strike처럼 이미 보정한 피해면 false)
    static hit(target, damage, source, world, type = "physical", mod = true) {
        if (target.invulnerable) return [];
        if (mod) damage = Status.modify(damage, source, target);
        let blocked = 0;
        if (source && target.absorb) {
            const left = target.absorb(damage);
            blocked = damage - left;
            damage = left;
            if (blocked) MessageLog.add(`방어도로 ${blocked} 피해를 막았다`, "#8cc8f0");
        }
        const hpBefore = target.stats.hp;
        target.stats.hp = Math.max(0, target.stats.hp - damage);
        const dealt = hpBefore - target.stats.hp;

        const before = target.attitude;
        if (source) target.onAttacked(source);
        if (before !== "hostile" && target.attitude === "hostile") {
            MessageLog.add(`${josa(target.displayName, "이가")} 화났다!`, "#f0a0a0");
        }

        Events.emit(GameEvent.DAMAGED, { target, damage, dealt, source, world, type });

        const dies = !target.stats.alive;
        Combat.last = { target, dealt, blocked, dies, damage };
        if (dies) Combat.kill(target, source, world);
        const back = [];
        if (blocked && !damage) return [new PopupAnim(target, "막음", "#8cc8f0"), ...back];
        return [new HitAnim(target, damage, dies), ...back];
    }

    static kill(target, killer, world) {
        world.removeEntity(target);
        MessageLog.add(`${josa(target.displayName, "이가")} ${target.deathVerb}`, target instanceof Player ? "#f06060" : "#c8b890");
        Events.emit(GameEvent.KILLED, { target, killer, world });
        if (target instanceof Player) Events.emit(GameEvent.PLAYER_DIED, { player: target, killer, world });
    }
}

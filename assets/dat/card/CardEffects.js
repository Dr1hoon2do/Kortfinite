// 카드 효과에서 같이 쓰는 동작들. 새 카드는 여기 함수를 조합하거나 직접 use를 쓰면 된다. (주문 효과는 Spell.js)
class CardEffects {
    static heal(ctx, amount) {
        const s = ctx.user.stats;
        if (s.hp >= s.maxHp) {
            MessageLog.add("이미 체력이 가득하다", "#c8b890");
            return null;
        }
        const healed = Math.min(amount, s.maxHp - s.hp);
        s.hp += healed;
        MessageLog.add(`체력 ${healed} 회복`, "#7cd47c");
        return [[new PopupAnim(ctx.user, "+" + healed, "#7cd47c")]];
    }

    // 마나 회복 (물약, 명상)
    static mana(ctx, amount) {
        const u = ctx.user;
        if (u.mana >= u.maxMana) {
            MessageLog.add("이미 마나가 가득하다", "#c8b890");
            return null;
        }
        const n = Math.min(amount, u.maxMana - u.mana);
        u.mana += n;
        MessageLog.add(`마나 ${n} 회복`, "#7cb0f0");
        return [[new PopupAnim(u, "+" + n, "#7cb0f0")]];
    }

    static elixir(ctx) {
        const u = ctx.user;
        const s = u.stats;
        if (s.hp >= s.maxHp && u.mana >= u.maxMana) {
            MessageLog.add("이미 체력과 마나가 가득하다", "#c8b890");
            return null;
        }
        s.hp = s.maxHp;
        u.mana = u.maxMana;
        MessageLog.add("체력과 마나가 가득 찼다", "#f0d878");
        return [[new PopupAnim(u, "MAX", "#f0d878")]];
    }

    static draw(ctx, count) {
        const drawn = ctx.cards.draw(count);
        return drawn.length > 0 ? [] : null;
    }

    // 폭탄 따위: 고른 칸 주변 radius 안 모든 생물에게 피해 (던지는 사람은 빼고)
    static explode(ctx, damage, radius, frame) {
        const at = ctx.target;
        const u = ctx.user;
        const range = ctx.card.target.range;
        if (!at || Math.abs(at.x - u.x) + Math.abs(at.y - u.y) > range) {
            MessageLog.add(`${range}칸 안의 칸을 골라야 한다`, "#c8b890");
            return null;
        }
        const tiles = Spell.square(at.x, at.y, radius);
        const targets = [];
        for (const [x, y] of tiles) for (const e of ctx.world.entitiesAt(x, y)) if (e !== u && e.alive && !e.invulnerable) targets.push(e);
        const size = ctx.world.tileSize;
        const fly = new ProjectileAnim(ctx.world, "cards", frame, new Vector(u.x * size, u.y * size), new Vector(at.x * size, at.y * size));
        MessageLog.add(targets.length ? `펑! ${targets.length}개 대상에게 ${damage} 피해` : "펑! 아무것도 맞지 않았다", "#ff9a50");
        const hits = [];
        for (const e of targets) hits.push(...Combat.hit(e, damage, u, ctx.world, "heat"));
        return [[fly], [new AreaFlashAnim(ctx.world, tiles, "#ff8a30"), ...hits]];
    }

    static recall(ctx) {
        const card = ctx.cards.recall();
        return card ? [] : null;
    }
}

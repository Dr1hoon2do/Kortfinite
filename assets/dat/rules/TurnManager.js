// 턴 진행. 플레이어의 모든 행동은 카드로 한다 (Player.nextAction):
//   - 카드 쓰기(이동·공격·방어·주문·소모품), 상호작용, 적이 없는 방에서 걷기: 턴이 지나지 않는다
//   - 뽑기(덱에서 1장), 대기: 1턴이 지난다 → 방의 적이 한 번씩 행동하고, 새 턴이 시작된다 (기력 가득, 방어도·쉼 -1)
// 연출이 끝나야 다음 입력을 받는다. 플레이어 행동이 아무것도 못 했으면(null) 아무 일도 없다.
class TurnManager extends Component {
    // options: { world, player, queue, run }
    constructor(options) {
        super();
        this.world = options.world;
        this.player = options.player;
        this.queue = options.queue;
        this.run = options.run ?? null;
        this.turn = 0;
        this.resting = 0; // 남은 "그냥 넘길 턴" (rest(n): 디버그·테스트용으로 대기를 n번)
        // 턴이 끝나면 Events.emit(GameEvent.TURN_END, { turn })로 알린다
    }

    update() {
        if (this.queue.busy || !this.player.alive || !this.player.world) return;
        if (this.resting > 0) {
            this.resting--;
            this.passTurn();
            return;
        }
        const action = this.player.nextAction();
        if (action) this.playTurn(action);
    }

    // 1턴을 쓴다 (대기와 같다)
    spendTurn() {
        if (!this.player.alive) return false;
        this.player.clearGoal();
        this.passTurn();
        return true;
    }

    // n턴 그냥 넘기기 (프레임마다 한 턴씩, 대기와 같다)
    rest(n) {
        this.resting += n;
    }

    playTurn(action) {
        const steps = this.playerAction(this.player, action);
        if (!steps) return;
        if (!this.passes(action)) {
            for (const step of steps) this.queue.enqueue(step);
            return;
        }
        this.passTurn(steps.flat());
    }

    // 이 행동이 턴을 넘기는가 (뽑기·대기, 테스트용 한 칸 걷기)
    passes(action) {
        return action.type === "draw" || action.type === "wait" || action.type === "move";
    }

    // 턴 넘기기: 턴 +1 → 방의 적 행동 → 새 턴 (기력 가득, 방어도·쉼 -1)
    // lead: 이 단계에 같이 재생할 플레이어 연출
    passTurn(lead = []) {
        const player = this.player;
        this.turn++;
        const together = Settings.get("together");
        const ctx = { world: this.world, player, turn: this.turn };
        const step = [...lead];
        const ambient = [];
        // 상태 이상의 남은 턴은 플레이어가 턴을 넘길 때 1 준다 (적이 건 것은 이 뒤에 걸리므로 플레이어 턴 n번 동안 이어진다)
        Status.tickTurns(player);
        for (const entity of [...this.world.actors]) {
            if (entity === player || !entity.alive || !player.alive || !entity.ai) continue;
            // 패턴이 있는 적 (EnemyAI): 정해 둔 의도를 한다
            if (entity.ai.takeTurn) {
                const r = entity.ai.takeTurn(ctx, this);
                (!together || r.hitPlayer ? step : ambient).push(...r.anims);
                continue;
            }
            const moves = entity.moves ?? 1;
            for (let i = 0; i < moves && entity.alive && player.alive; i++) {
                const result = this.perform(entity, entity.act(ctx));
                if (!result) break;
                (!together || this.lastTarget === player ? step : ambient).push(...result);
                if (this.lastWasAttack) break; // 치면 그 턴은 끝
            }
        }
        // 소환수 (적 다음에 움직인다)
        for (const entity of [...this.world.actors]) {
            if (!(entity instanceof Ally) || !entity.alive || !player.alive) continue;
            step.push(...entity.ai.takeTurn(ctx, this).anims);
        }
        // 설치물 (지뢰·장판·장벽)
        for (const h of [...(this.world.hazards ?? [])]) if (h.world) step.push(...h.tick(ctx));
        // 플레이어 독: 적이 다 움직인 뒤 (방어도로 못 막는다). 화상은 새 턴 시작에 (아래 startTurn 다음)
        if (player.alive) {
            const p0 = player.poison;
            if (p0) MessageLog.add(`독으로 ${p0} 피해`, "#9ce05c");
            step.push(...Status.tickPoison(player, this.world));
        }

        // 다음 턴 의도 (머리 위·땅에 보인다)
        EnemyMoves.planAll(this.world, player, this.turn);

        if (player.alive) {
            player.startTurn();
            step.push(...Status.tickStart(player, this.world));
            step.push(...Equip.turnStart(player, this.world)); // 장착한 장비 (마력석 마법서 …)
            player.cards.notify("turn", { turn: this.turn });
        }
        this.queue.enqueue(step);
        for (const anim of ambient) this.queue.play(anim);
        Events.emit(GameEvent.TURN_END, { turn: this.turn });
    }

    // 플레이어 행동 → 연출 단계 배열. 아무것도 못 했으면 null
    playerAction(player, action) {
        const cards = player.cards;
        switch (action.type) {
            case "card":
                return cards.use(action.card, { user: player, world: this.world, turns: this, target: action.target, picks: action.picks });
            case "draw":
                return this.draw(player) ? [[]] : null;
            case "wait":
                MessageLog.add("한 턴 기다렸다", "#a0b8e8");
                return [[]];
            case "interact":
                this.interact(player, action.x, action.y);
                return null;
            case "walk":
                return this.walk(player, action.path, action.then);
            case "move": {
                const anims = this.perform(player, action.dir); // 테스트·디버그용: 한 칸 걷고 1턴
                return anims ? [anims] : null;
            }
        }
        return null;
    }

    // 적이 없는 방에서 걷기 (턴 안 씀): 길을 따라 한 칸씩 미끄러진다. 도착하면 then 칸과 상호작용
    walk(player, path, then) {
        const steps = [];
        const t = this.world.tileSize;
        for (const [dx, dy] of path) {
            const fx = player.x;
            const fy = player.y;
            if (!this.world.moveEntity(player, dx, dy)) break;
            steps.push([new MoveAnim(player, new Vector(fx * t, fy * t), new Vector(player.x * t, player.y * t))]);
        }
        if (then) {
            const done = () => this.interact(player, then.x, then.y);
            steps.push([new CallbackAnim(done)]);
        }
        return steps.length ? steps : null;
    }

    // 덱에서 1장 뽑기 (1턴). 못 뽑으면 이유를 알리고 false
    draw(player) {
        const cards = player.cards;
        if (player.drawLock > 0) {
            MessageLog.add(`쉬는 중이라 ${player.drawLock}턴 동안 뽑을 수 없다 (대기로 턴을 넘기자)`, "#c8b890");
            return false;
        }
        if (!cards.canDraw) {
            MessageLog.add("덱도 묘지도 비어 있다", "#c8b890");
            return false;
        }
        if (cards.actionFull) {
            MessageLog.add("행동 패가 가득 차서 뽑을 수 없다 (카드를 쓰거나 묘지로 버리자)", "#c8b890");
            return false;
        }
        return cards.draw(1).length > 0;
    }

    face(entity, x) {
        if (x !== entity.x) entity.flipX = x < entity.x;
        entity.applyFlip();
    }

    // 상호작용 (턴 안 씀): 내 칸이나 바로 옆 칸의 출구·상인·모닥불·상자. 아무것도 못 했으면 false
    interact(player, x = player.x, y = player.y) {
        if (Math.abs(x - player.x) + Math.abs(y - player.y) > 1) return false;
        this.face(player, x);
        const target = this.world.entitiesAt(x, y).find((e) => e !== player && e.interactable);
        if (!target) {
            MessageLog.add("상호작용할 것이 없다", "#c8b890");
            return false;
        }
        return !!target.interact({ player, world: this.world, turns: this, run: this.run });
    }

    // 한 칸 행동: 그 칸에 적대하는 상대가 있으면 공격, 아니면 이동. 아무것도 못 했으면 null (턴 소모 없음)
    perform(entity, dir) {
        this.lastWasAttack = false;
        this.lastTarget = null; // 이번 행동이 친 대상
        if (!dir) return null;
        if (dir[0]) entity.flipX = dir[0] < 0;
        entity.applyFlip();

        const target = this.world.entityAt(entity.x + dir[0], entity.y + dir[1]);
        if (target && entity.isHostileTo(target) && !(entity instanceof Player && target.interactable && target.attitude !== "hostile")) {
            this.lastWasAttack = true;
            this.lastTarget = target;
            return Combat.attack(entity, target, this.world);
        }

        const fx = entity.x;
        const fy = entity.y;
        if (!this.world.moveEntity(entity, dir[0], dir[1])) return null;
        return [this.slide(entity, fx, fy)];
    }

    // 이전 칸(fx, fy)에서 지금 논리 좌표로 미끄러지는 연출
    slide(entity, fx, fy) {
        const t = this.world.tileSize;
        return new MoveAnim(entity, new Vector(fx * t, fy * t), new Vector(entity.x * t, entity.y * t));
    }
}

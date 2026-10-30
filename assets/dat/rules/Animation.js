class Anim {
    constructor(duration) {
        this.duration = duration;
        this.elapsed = 0;
        this.finished = false;
    }

    get remaining() {
        return Math.max(0, this.duration - this.elapsed);
    }

    update(dt) {
        this.elapsed += dt;
        const t = Math.min(this.elapsed / this.duration, 1);
        this.onUpdate(t);
        this.finished = t >= 1;
    }

    onUpdate(t) {}
}

// 연출 순서 중간에 할 일 (걸어가서 도착한 뒤 상호작용 등). 처음 재생될 때 한 번 부른다
class CallbackAnim extends Anim {
    constructor(fn) {
        super(0.001);
        this.fn = fn;
        this.called = false;
    }

    onUpdate() {
        if (this.called) return;
        this.called = true;
        this.fn();
    }
}

class MoveAnim extends Anim {
    constructor(entity, from, to, duration = 0.14) {
        super(duration);
        this.entity = entity;
        this.from = from;
        this.to = to;
    }

    onUpdate(t) {
        this.entity.transform.position = new Vector(
            this.from.x + (this.to.x - this.from.x) * t,
            this.from.y + (this.to.y - this.from.y) * t
        );
    }
}

// 공격: 상대 쪽으로 반 칸 찔렀다가 돌아온다. 논리 좌표는 그대로.
class AttackAnim extends Anim {
    constructor(attacker, target, tileSize, duration = 0.16) {
        super(duration);
        this.entity = attacker;
        this.home = new Vector(attacker.x * tileSize, attacker.y * tileSize);
        this.dx = Math.sign(target.x - attacker.x) * tileSize * 0.45;
        this.dy = Math.sign(target.y - attacker.y) * tileSize * 0.45;
    }

    onUpdate(t) {
        const k = Ease.pingPong(t); // 0 → 1 → 0
        this.entity.transform.position = new Vector(this.home.x + this.dx * k, this.home.y + this.dy * k);
    }
}

// 피격: 깜빡이고 피해 숫자를 띄운다. 죽었으면 끝에 흐려지며 사라진다 (플레이어는 흐린 채로 남는다).
class HitAnim extends Anim {
    constructor(target, damage, dies, duration = 0.32) {
        super(duration);
        this.entity = target;
        this.damage = damage;
        this.dies = dies;
    }

    onUpdate(t) {
        const e = this.entity;
        // 화면 흔들기: 플레이어가 맞으면 피해만큼, 지형지물이 부서지면 살짝
        if (!this._shook) {
            this._shook = true;
            if (Camera.main && e instanceof Player) Camera.main.shake(Math.min(1.5 + this.damage * 0.4, 5), 0.25);
            else if (Camera.main && e.baked && this.dies) Camera.main.shake(1.2, 0.15);
        }
        // 청크에 구운 지형지물: 깜빡일 그림이 없으니 파편 입자와 숫자로 보여 주고, 부서졌으면 남겨 둔 그림을 지운다
        if (e.baked) {
            if (!this._started) {
                this._started = true;
                if (e.world) {
                    e.world.propOverlay.hit(e, this.damage, this.dies);
                    if (this.dies) e.world.releaseGhost(e);
                }
            }
            if (t >= 1 && this.dies) e.gameObject.destroy();
            return;
        }
        // 화면 밖이라 아직 한 번도 켜지지 않은 엔티티는 그릴 것이 없다 (죽었으면 지우기만)
        if (e.overlay) e.overlay.popup = { text: String(this.damage), t };
        if (e.sr) {
            const blink = t < 0.5 && Math.floor(t * 8) % 2 === 0;
            e.sr.opacity = blink ? 0.25 : 1;
            if (this.dies && t >= 0.5) e.sr.opacity = 1 - (t - 0.5) * 2 * (e instanceof Player ? 0.65 : 1);
        }

        if (t >= 1) {
            if (e.overlay) e.overlay.popup = null;
            if (this.dies && !(e instanceof Player)) e.gameObject.destroy();
        }
    }
}

// 엔티티 머리 위에 글자를 띄운다 (회복량 등)
class PopupAnim extends Anim {
    constructor(entity, text, color, duration = 0.5) {
        super(duration);
        this.entity = entity;
        this.text = text;
        this.color = color;
    }

    onUpdate(t) {
        const e = this.entity;
        if (e.baked) {
            // 구운 지형지물은 공용 표시(PropOverlay)에 띄운다 (Tween으로 혼자 재생)
            if (!this._started && e.world) e.world.propOverlay.popup(e, this.text, this.color, this.duration);
            this._started = true;
            return;
        }
        if (e.overlay) e.overlay.popup = t < 1 ? { text: this.text, t, color: this.color } : null;
    }
}

// 시트의 아이콘 하나를 from에서 to로 날린다 (파이어볼 등). 재생이 시작될 때 만들고 끝나면 지운다.
class ProjectileAnim extends Anim {
    constructor(world, sprite, frame, from, to, speed = 160) {
        super(Math.max(0.08, from.distance(to) / speed));
        this.world = world;
        this.sprite = sprite;
        this.frame = frame;
        this.from = from;
        this.to = to;
        this.go = null;
    }

    onUpdate(t) {
        if (!this.go) {
            this.go = new GameObject("projectile");
            this.go.addComponent(new SpriteRenderer(Resource.image(this.sprite), {
                region: { x: this.frame * 16, y: 0, width: 16, height: 16 },
                pixelsPerUnit: 1.5,
                sortingLayer: "Foreground"
            }));
            this.world.gameObject.addChild(this.go);
        }
        this.go.transform.setPosition(this.from.x + (this.to.x - this.from.x) * t, this.from.y + (this.to.y - this.from.y) * t);
        if (t >= 1) this.go.destroy();
    }
}

// 여러 칸을 한꺼번에 번쩍이게 한다 (폭발 범위 등). 재생이 시작될 때 만들고 끝나면 지운다.
class AreaFlashAnim extends Anim {
    constructor(world, tiles, color, duration = 0.3, shake = true) {
        super(duration);
        this.shake = shake;
        this.world = world;
        this.tiles = tiles;
        this.color = color;
        this.go = null;
    }

    onUpdate(t) {
        if (!this.go) {
            if (Camera.main && this.shake) Camera.main.shake(2.5, 0.3); // 폭발
            this.go = new GameObject("flash");
            this.flash = this.go.addComponent(new TileFlash(this.tiles, this.world.tileSize, this.color));
            this.world.gameObject.addChild(this.go);
        }
        this.flash.alpha = 0.75 * (1 - t);
        if (t >= 1) this.go.destroy();
    }
}

// 칸들을 한 색으로 칠하는 월드 렌더러
class TileFlash extends Renderer {
    constructor(tiles, tileSize, color) {
        super();
        this.tiles = tiles;
        this.tileSize = tileSize;
        this.color = color;
        this.alpha = 1;
        this.sortingLayer = "Foreground";
    }

    getBounds(out) {
        return null;
    }

    render(ctx, camera) {
        const m = camera.viewMatrix;
        ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
        const t = this.tileSize;
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = this.color;
        for (const [x, y] of this.tiles) ctx.fillRect(x * t - t / 2, y * t - t / 2, t, t);
        ctx.globalAlpha = 1;
    }
}

// 연출 큐. 단계(step)는 차례대로, 한 단계 안의 연출은 동시에 재생한다.
// - speed: 재생 배속 (설정의 "애니메이션 속도")
// - 한 단계가 프레임 중간에 끝나면 남은 시간을 다음 단계로 넘긴다. 다음 턴이 같은 프레임에 들어오면 그 턴으로도 넘겨서
//   한 칸씩 이어 걸을 때 멈칫하지 않고 미끄러지듯 이어진다.
class AnimQueue extends Component {
    constructor() {
        super();
        this.steps = [];
        this.speed = 1;
        this.carry = 0; // 지난 프레임에 쓰고 남은 시간 (바로 다음 단계가 들어왔을 때만 쓴다)
        this.ambient = []; // 배경 연출 (play)
        this.last = performance.now();
    }

    get busy() {
        return this.steps.length > 0;
    }

    enqueue(step) {
        if (step.length) this.steps.push(step);
    }

    // 턴을 붙잡지 않는 연출 (머리 위 글자, 플레이어와 상관없는 주변 싸움·이동 등). 큐와 따로 같은 속도로 재생된다
    play(anim) {
        this.ambient.push(anim);
    }

    _updateAmbient(dt) {
        if (!this.ambient.length) return;
        for (const anim of this.ambient) if (!anim.finished) anim.update(Math.min(dt, anim.remaining + 1e-9));
        this.ambient = this.ambient.filter((a) => !a.finished);
    }

    update() {
        const now = performance.now();
        let dt = Math.min((now - this.last) / 1000, 0.1) * this.speed;
        this.last = now;
        this._updateAmbient(dt);
        if (!this.busy) {
            this.carry = 0;
            return;
        }
        dt += this.carry;
        this.carry = 0;

        while (this.busy && dt > 0) {
            const step = this.steps[0];
            let longest = 0;
            for (const anim of step) if (!anim.finished) longest = Math.max(longest, anim.remaining);
            const use = Math.min(dt, longest);
            for (const anim of step) {
                if (!anim.finished) anim.update(dt >= longest ? anim.remaining + 1e-9 : use);
            }
            if (step.every((anim) => anim.finished)) {
                this.steps.shift();
                dt -= longest;
            } else {
                dt = 0;
            }
        }
        if (!this.busy) this.carry = Math.max(0, dt);
    }
}

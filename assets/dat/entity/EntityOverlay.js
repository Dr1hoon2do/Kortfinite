// 엔티티 머리 위 표시: 체력바(색 = 플레이어에 대한 태도), 피격 숫자, 의도(플레이어를 노리는 적이 다음 턴에 할 일).
// 체력바는 AI가 있는 엔티티는 항상, 아이템처럼 AI가 없는 엔티티는 다쳤을 때만 보인다.
// 월드 공간 렌더러라서 카메라 확대에 맞춰 같이 커진다. 플레이어는 체력바를 HUD로 보여서 숫자만 띄운다.
class EntityOverlay extends Renderer {
    static COLORS = { hostile: "#d8443c", neutral: "#d8a83c", friendly: "#5cb85c", item: "#b8b0a0" };

    constructor(entity) {
        super();
        this.entity = entity;
        this.sortingLayer = "Foreground";
        this.popup = null; // { text, t, color? } HitAnim / PopupAnim이 채운다
        this._m = new Matrix();
    }

    // 화면 밖이면 그리지 않게 (지형지물이 수천 개라 컬링이 필요하다). 위쪽은 피격 숫자가 뜨는 자리까지
    getBounds(out) {
        const p = this.transform.position;
        out.minX = p.x - 10;
        out.maxX = p.x + 10;
        out.minY = p.y - 10;
        out.maxY = p.y + 26;
        return out;
    }

    render(ctx, camera) {
        const e = this.entity;
        if (!e.alive && !this.popup) return;
        const bar = e.alive && !(e instanceof Player) && (e.ai || e.stats.hp < e.stats.maxHp);
        const popup = this.popup && Settings.get("damageNumbers") ? this.popup : null;
        const intent = bar ? Intent.of(e) : null;
        if (!bar && !popup) return;
        Matrix.multiply(camera.viewMatrix, this.transform.worldMatrix, this._m);
        EntityOverlay.draw(ctx, this._m, e, bar, popup, intent);
    }

    // 체력바·숫자 그리기. m = 화면 행렬(카메라 × 엔티티 위치). 구운 지형지물(PropOverlay)도 같이 쓴다
    static draw(ctx, m, e, bar, popup, intent = null) {
        ctx.setTransform(m.a, m.b, m.c, m.d, Math.round(m.e), Math.round(m.f));
        ctx.scale(1, -1); // 월드 Y-up → 여기서부터 y는 아래로 +, 엔티티 중심이 원점
        if (intent) Intent.draw(ctx, intent, !!popup);

        if (bar) {
            const w = 12;
            const fill = Math.ceil(w * e.stats.hp / e.stats.maxHp);
            ctx.fillStyle = "rgba(20, 14, 10, 0.85)";
            ctx.fillRect(-w / 2 - 1, -12, w + 2, 3);
            ctx.fillStyle = EntityOverlay.COLORS[e.attitude];
            ctx.fillRect(-w / 2, -11, fill, 1);
            if (e.guard > 0) {
                // 몬스터 방어도: 체력바 왼쪽 파란 칸
                ctx.font = "bold 5px monospace";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillStyle = "#3c78b8";
                ctx.fillRect(-w / 2 - 7, -13, 6, 5);
                ctx.fillStyle = "#ffffff";
                ctx.fillText(String(e.guard), -w / 2 - 4, -10.5);
            }
            // 상태 이상: 발밑에 색 칸 + 수치 (독·약화 등)
            const keys = Status.entries(e);
            if (keys.length) {
                ctx.font = "bold 4px monospace";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                let x = -keys.length * 2.5;
                for (const k of keys) {
                    ctx.fillStyle = "rgba(20, 14, 10, 0.85)";
                    ctx.fillRect(x - 0.5, 7.5, 5, 5);
                    ctx.fillStyle = k.color;
                    ctx.fillRect(x, 8, 4, 4);
                    ctx.fillStyle = "#000000";
                    ctx.fillText(String(k.value), x + 2, 10.2);
                    x += 5;
                }
            }
        }

        if (popup) {
            const t = popup.t;
            const rise = Ease.outCubic(t) * 7; // 처음엔 빨리 솟고 천천히 멈춘다
            ctx.globalAlpha = 1 - t * t;
            ctx.font = "bold 8px monospace";
            ctx.textAlign = "center";
            ctx.textBaseline = "bottom";
            ctx.fillStyle = "rgba(20, 14, 10, 0.9)";
            ctx.fillText(popup.text, 0.5, -13 - rise + 0.5);
            ctx.fillStyle = popup.color ?? (e instanceof Player ? "#ff7060" : "#ffffff");
            ctx.fillText(popup.text, 0, -13 - rise);
            ctx.globalAlpha = 1;
        }
    }
}

// 청크에 구운 지형지물(나무, 바위, 벽...)의 체력바와 피해 숫자를 렌더러 하나로 그린다.
// 지형지물마다 렌더러를 두면 수천 개를 매 프레임 훑어야 해서, 다친 것·숫자가 뜬 것만 따로 들고 있는다.
class PropOverlay extends Renderer {
    constructor(world) {
        super();
        this.world = world;
        this.sortingLayer = "Foreground";
        this.popups = []; // { entity, text, color, t }
        this._m = new Matrix();
        this._pos = new Matrix();
    }

    // 맞았을 때: 파편 입자를 튀기고, 숫자를 띄우고, 다쳤으면 체력바 목록에 넣는다
    hit(entity, damage, dies) {
        const t = this.world.tileSize;
        const img = Resource.image(entity.sprite);
        this.world.particles.emit(entity.x * t, entity.y * t, {
            count: dies ? 18 : 5 + Math.min(damage, 5) * 2,
            colors: ParticleSystem.paletteFromImage(img, null, 4),
            area: dies ? 6 : 3,
            speed: dies ? [30, 80] : [25, 60],
            angle: Math.PI / 2,
            spread: dies ? Math.PI * 2 : Math.PI * 1.2,
            gravity: -300,
            drag: 1.5,
            life: [0.25, 0.55],
            size: [1.5, 2.5]
        });
        if (dies) this.world.damagedProps.delete(entity);
        else if (entity.stats.hp < entity.stats.maxHp) this.world.damagedProps.add(entity);
        this.popup(entity, String(damage));
    }

    // 머리 위 글자 (Tween으로 0.5초 동안 솟았다 사라진다)
    popup(entity, text, color = null, duration = 0.5) {
        const p = { entity, text, color, t: 0 };
        this.popups.push(p);
        Tween.to(p, { t: 1 }, duration, {
            owner: this,
            onComplete: () => {
                const i = this.popups.indexOf(p);
                if (i >= 0) this.popups.splice(i, 1);
            }
        });
        return p;
    }

    get isVisible() {
        return (this.popups.length > 0 || this.world.damagedProps.size > 0) && super.isVisible;
    }

    getBounds(out) {
        return null; // 몇 개 안 돼서 그릴 때 하나씩 화면 안인지 본다
    }

    render(ctx, camera) {
        const t = this.world.tileSize;
        const numbers = Settings.get("damageNumbers");
        for (const e of this.world.damagedProps) {
            if (!e.alive || e.stats.hp >= e.stats.maxHp || e.world !== this.world) {
                this.world.damagedProps.delete(e);
                continue;
            }
            const popup = numbers ? this.popups.find((p) => p.entity === e) : null;
            this._draw(ctx, camera, e, t, true, popup);
        }
        if (!numbers) return;
        for (const p of this.popups) {
            if (this.world.damagedProps.has(p.entity) && p.entity.alive) continue; // 위에서 체력바와 같이 그렸다
            this._draw(ctx, camera, p.entity, t, false, p);
        }
    }

    _draw(ctx, camera, e, t, bar, popup) {
        const x = e.x * t;
        const y = e.y * t;
        if (!camera.isInView(x - 10, y - 10, x + 10, y + 26)) return;
        Matrix.setIdentity(this._pos);
        this._pos.e = x;
        this._pos.f = y;
        Matrix.multiply(camera.viewMatrix, this._pos, this._m);
        EntityOverlay.draw(ctx, this._m, e, bar, popup);
    }
}

// 적의 의도: 플레이어를 노리는 엔티티가 다음 턴(플레이어가 뽑기·대기로 턴을 넘기면)에 할 일.
//   이번 턴에 닿을 거리면 공격 (빨간 칼 + 피해), 아니면 다가온다 (노란 !)
// 카드로 움직이면(턴 안 씀) 바로 바뀐다 (그릴 때마다 계산한다)
class Intent {
    static of(e) {
        const p = Player.current;
        if (!p || !p.alive || !e.ai || !e.alive || e.world !== p.world) return null;
        if (e.ai instanceof EnemyAI) return EnemyMoves.view(e.ai, p);
        if (!e.isHostileTo(p)) return null;
        const d = Math.abs(e.x - p.x) + Math.abs(e.y - p.y);
        if (d <= (e.moves ?? 1)) return { kind: "attack", v: e.stats.attack };
        if (d <= (e.ai.sight ?? 6)) return { kind: "chase" };
        return null;
    }

    // 의도별 바탕색과 글자. 숫자는 피해·방어도
    static STYLE = {
        charge: { color: "#e05a20", label: "돌진" },
        leap: { color: "#8a6a3a", label: "도약" },
        area: { color: "#b83030", label: "광역" },
        web: { color: "#9aa0b0", label: "거미줄" },
        buff: { color: "#c89020", label: "울부짖기" },
        block: { color: "#3c78b8", label: "방어" },
        heal: { color: "#3c9a4a", label: "회복" },
        summon: { color: "#8a50c8", label: "소환" },
        idle: { color: "#5a5248", label: "쉼" },
        stunned: { color: "#806040", label: "기절" },
        chase: { color: "#8a7a3a", label: "이동" }
    };

    // 엔티티 중심 원점, y 아래로 +. 체력바(-12) 위에 그린다. 숫자가 뜨는 중이면 살짝 옆으로
    static draw(ctx, intent, shifted) {
        const y = -21;
        const x0 = shifted ? 5 : 0;
        ctx.font = "bold 6px monospace";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        if (intent.kind === "attack") {
            const text = String(intent.v) + (intent.poison ? "+독" + intent.poison : "");
            const w = 7 + Math.ceil(ctx.measureText(text).width);
            const left = Math.round(x0 - w / 2);
            ctx.fillStyle = "rgba(20, 8, 6, 0.9)";
            ctx.fillRect(left - 1, y - 1, w + 2, 8);
            ctx.fillStyle = intent.poison ? "#5a8a2c" : "#c83a30";
            ctx.fillRect(left, y, w, 6);
            // 작은 칼 (대각선)
            ctx.fillStyle = "#f0e6cc";
            for (let i = 0; i < 4; i++) ctx.fillRect(left + 1 + i, y + 4 - i, 1, 1);
            ctx.fillStyle = "#e8b840";
            ctx.fillRect(left + 1, y + 3, 1, 1);
            ctx.fillRect(left + 2, y + 4, 1, 1);
            ctx.fillStyle = "#ffffff";
            ctx.fillText(text, left + 6, y);
            return;
        }
        const st = Intent.STYLE[intent.kind] ?? { color: "#806040", label: "?" };
        const label = intent.kind === "area" && intent.name ? intent.name : st.label;
        const text = label + (intent.v !== undefined ? " " + intent.v : "");
        const w = Math.ceil(ctx.measureText(text).width) + 4;
        const left = Math.round(x0 - w / 2);
        ctx.fillStyle = "rgba(20, 8, 6, 0.9)";
        ctx.fillRect(left - 1, y - 1, w + 2, 8);
        ctx.fillStyle = st.color;
        ctx.fillRect(left, y, w, 6);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(text, left + 2, y);
    }
}

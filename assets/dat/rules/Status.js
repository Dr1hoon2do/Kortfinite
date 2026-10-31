// 상태 이상·버프. 플레이어와 몬스터·소환수가 같은 체계를 쓴다.
//   entity.status  = { 키: 수치 }   — 수치 (독 3, 화상 피해 2, 빙결 추가 피해 4 …)
//   entity.statusT = { 키: 남은 턴 } — 턴으로 세는 것들의 남은 턴
// 종류 (DEFS.kind):
//   "dot"   독: 턴이 끝날 때 수치만큼 피해를 입고 수치가 1 준다 (턴 수 없음)
//   "vt"    수치 + 턴: 화상(턴 시작 피해) · 빙결(맞을 때 추가 피해) · 무기력(턴 시작 기력 감소) ·
//            경질화(방어력 +) · 둔화(이동속도 -%) · 힘(공격력 +)
//   "turns" 턴만: 속박 · 기절 · 도발 (수치는 남은 턴과 같다)
// 영구: 턴이 ENDLESS(999) 이상이면 방(전투)이 끝날 때까지 줄지 않는다 (경질화 "이번 전투동안", 늑대의 힘 "영구")
//
// 턴이 줄어드는 때
//   몬스터·소환수: 자기 턴 시작에 화상 피해 → 행동 → 자기 턴 끝에 독 피해, 남은 턴 -1
//   플레이어: 턴을 넘길 때(적이 움직이기 전) 남은 턴 -1 → (적이 움직인 뒤) 독 피해 → 새 턴 시작에 화상 피해·무기력 적용
//            (무기력만 새 턴에 적용하고 나서 줄어든다: "1턴" = 바로 다음 턴)
class Status {
    static ENDLESS = 999;

    static DEFS = {
        poison: { name: "독", color: "#9ce05c", kind: "dot", max: 99, tag: "poison" },
        burn: { name: "화상", color: "#ff8a40", kind: "vt", max: 99, tag: "burning", desc: "턴 시작시 수치만큼 피해" },
        ice: { name: "빙결", color: "#7ab8ff", kind: "vt", max: 99, tag: "ice", desc: "피해를 입을 때 수치만큼 추가 피해" },
        lethargy: { name: "무기력", color: "#9a8cf0", kind: "vt", max: 9, tag: "lethargy", late: true, desc: "턴 시작시 얻는 기력이 수치만큼 감소" },
        harden: { name: "경질화", color: "#9ad0e8", kind: "vt", max: 99, buff: true, tag: "hardening", desc: "수치만큼 방어력 증가" },
        slow: { name: "둔화", color: "#8c9cf0", kind: "vt", max: 100, tag: "slowness", desc: "이동속도가 수치(%)만큼 감소" },
        str: { name: "힘", color: "#f0a050", kind: "vt", max: 99, buff: true, tag: "strength", desc: "수치만큼 공격력 증가" },
        root: { name: "속박", color: "#e8e8f0", kind: "turns", max: 9, tag: "root", desc: "움직이지 못한다" },
        stun: { name: "기절", color: "#f0e070", kind: "turns", max: 3, tag: "sturn", desc: "행동할 수 없다" },
        taunt: { name: "도발", color: "#f08080", kind: "turns", max: 9, tag: "taunt", desc: "공격 대상이 도발한 쪽이 된다" },
        charm: { name: "매혹", color: "#f080c0", kind: "turns", max: 3, tag: "charm", desc: "매혹한 상대를 공격할 수 없다" }
    };

    // by가 target을 매혹한다 (turns턴). 매혹당한 쪽은 by를 공격 대상으로 고를 수 없다
    static charm(by, target, turns = 1) {
        Status.add(target, "charm", turns);
        target.charmedBy = by;
    }

    // e가 other에게 매혹당해 있는가 (other를 해칠 수 없다)
    static charmedBy(e, other) {
        return Status.get(e, "charm") > 0 && e.charmedBy === other;
    }

    // 예전 키 → 지금 키 (저장·옛 코드 호환)
    static ALIAS = { burning: "burn", hardening: "harden", slowness: "slow", strength: "str", sturn: "stun" };

    static key(k) {
        return Status.ALIAS[k] ?? k;
    }

    static get(e, key) {
        return (e.status && e.status[Status.key(key)]) || 0;
    }

    static turns(e, key) {
        return (e.statusT && e.statusT[Status.key(key)]) || 0;
    }

    static has(e, key) {
        return Status.get(e, key) > 0;
    }

    // 직접 정하기 (수치 v, 남은 턴 t). v가 0이면 지운다
    static set(e, key, v, t = null) {
        key = Status.key(key);
        if (!e.status) e.status = {};
        if (!e.statusT) e.statusT = {};
        const d = Status.DEFS[key];
        v = Math.max(0, Math.min(d ? d.max : 99, v));
        if (v) {
            e.status[key] = v;
            if (d && d.kind === "vt") e.statusT[key] = t ?? e.statusT[key] ?? 1;
            else if (d && d.kind === "turns") e.statusT[key] = v;
        } else {
            delete e.status[key];
            delete e.statusT[key];
        }
        if ((key === "str" || key === "harden") && e.statsChanged) e.statsChanged();
        return v;
    }

    // 더하기. 수치는 쌓이고, 턴은 더 긴 쪽을 따른다. 턴만 있는 것(속박·기절·도발)은 턴이 늘어난다(긴 쪽)
    static add(e, key, n, turns = null) {
        key = Status.key(key);
        const d = Status.DEFS[key];
        if (!d) return 0;
        if (d.kind === "turns") {
            Status.set(e, key, Math.max(Status.get(e, key), n));
            return Status.get(e, key);
        }
        if (d.kind === "vt") {
            const t = Math.max(Status.turns(e, key), turns ?? 1);
            Status.set(e, key, Status.get(e, key) + n, t);
            return Status.get(e, key);
        }
        Status.set(e, key, Status.get(e, key) + n);
        return Status.get(e, key);
    }

    static clear(e, keys = null) {
        for (const k of Object.keys(e.status ?? {})) if (!keys || keys.includes(k)) Status.set(e, k, 0);
    }

    // 디버프만 지우기 (정화). 지운 개수
    static cleanse(e, limit = 99) {
        const bad = Object.keys(e.status ?? {}).filter((k) => Status.DEFS[k] && !Status.DEFS[k].buff);
        const gone = bad.slice(0, limit);
        for (const k of gone) Status.set(e, k, 0);
        return gone.length;
    }

    // 지금 디버프가 몇 개인가
    static debuffs(e) {
        return Object.keys(e.status ?? {}).filter((k) => Status.DEFS[k] && !Status.DEFS[k].buff);
    }

    // 피해 보정: 맞는 쪽이 빙결이면 수치만큼 추가 피해
    static modify(dmg, source, target) {
        if (typeof Equip !== "undefined") dmg = Equip.dealt(dmg, source, target); // 장착한 장비 (구부러진 단검 …)
        if (target && dmg > 0) dmg += Status.get(target, "ice");
        return Math.max(dmg > 0 ? 1 : 0, dmg);
    }

    // 이동속도 (둔화: -%): base는 원래 이동속도
    static speed(e, base) {
        const slow = Status.get(e, "slow");
        return slow ? Math.floor(base * (100 - slow) / 100 + 1e-9) : base;
    }

    // 턴 시작 효과 (화상 피해). 연출 배열
    static tickStart(e, world) {
        const anims = [];
        const b = Status.get(e, "burn");
        if (b && e.alive) {
            MessageLog.add(`${josa(e.displayName, "이가")} 화상으로 ${b} 피해`, "#ff8a40");
            anims.push(...Combat.hit(e, b, null, world, "heat"));
        }
        return anims;
    }

    // 턴 끝 효과 (독 피해, 수치 -1)
    static tickPoison(e, world) {
        const anims = [];
        const p = Status.get(e, "poison");
        if (p && e.alive) {
            anims.push(...Combat.hit(e, p, null, world, "poison"));
            Status.add(e, "poison", -1);
        }
        return anims;
    }

    // 남은 턴 -1 (skipLate: 무기력은 따로 센다). 0이 되면 사라진다
    static tickTurns(e, skipLate = true) {
        for (const k of Object.keys(e.statusT ?? {})) {
            const d = Status.DEFS[k];
            if (skipLate && d && d.late) continue;
            if (e.statusT[k] >= Status.ENDLESS) continue;
            e.statusT[k]--;
            if (e.statusT[k] <= 0) Status.set(e, k, 0);
        }
    }

    // 몬스터·소환수가 자기 턴 시작에 부른다 (예전 이름 호환): 화상 피해
    static tickDamage(e, world) {
        return Status.tickStart(e, world);
    }

    // 플레이어의 새 턴: 무기력으로 기력이 줄고, 무기력의 남은 턴이 준다
    static applyLate(e) {
        const l = Status.get(e, "lethargy");
        if (!l) return 0;
        if (e.statusT.lethargy !== undefined) {
            e.statusT.lethargy--;
            if (e.statusT.lethargy <= 0) Status.set(e, "lethargy", 0);
        }
        return l;
    }

    // "독 3 · 화상 2(3턴)"
    static text(e) {
        return Object.keys(e.status ?? {}).filter((k) => Status.DEFS[k]).map((k) => {
            const d = Status.DEFS[k];
            const t = Status.turns(e, k);
            const unit = k === "slow" ? "%" : "";
            if (d.kind === "turns") return `${d.name} ${t >= Status.ENDLESS ? "" : t + "턴"}`.trim();
            const tt = d.kind === "vt" ? (t >= Status.ENDLESS ? "(전투 중)" : `(${t}턴)`) : "";
            return `${d.name} ${e.status[k]}${unit}${tt}`;
        }).join(" · ");
    }
}

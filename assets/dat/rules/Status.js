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
        growth: { name: "성장", color: "#e0605a", kind: "vt", max: 99, buff: true, tag: "growth", desc: "최대 체력이 수치만큼 증가" },
        charm: { name: "매료", color: "#f080c0", kind: "vt", max: 9, tag: "charm", desc: "건 상대에게서 수치칸 이내로만 움직일 수 있다 (여럿이면 겹치는 범위)" }
    };

    // 매료: 건 사람(by)마다 { by, n, t }가 따로 있다 (e.charms). 매료당한 쪽은 모든 시전자에게서 n칸 이내인 칸으로만 움직일 수 있다
    //   (여러 명에게 걸리면 그 범위들의 교집합). 화면에 보이는 상태효과 수치는 가장 좁은 n, 턴은 가장 긴 것
    static charm(by, target, n = 2, turns = 1) {
        const list = (target.charms ??= []).filter((c) => c.by !== by);
        Status.casterName(by); // 시전자 번호는 거는 순서대로
        list.push({ by, n, t: turns });
        target.charms = list;
        Status.syncCharm(target);
    }

    static syncCharm(e) {
        const list = (e.charms ?? []).filter((c) => c.t > 0);
        e.charms = list;
        if (!list.length) {
            if (e.status) delete e.status.charm;
            if (e.statusT) delete e.statusT.charm;
            return;
        }
        e.status ??= {};
        e.statusT ??= {};
        e.status.charm = Math.min(...list.map((c) => c.n));
        e.statusT.charm = Math.max(...list.map((c) => c.t));
    }

    // 턴이 지나면 매료도 한 턴씩 줄어든다
    static tickCharm(e) {
        for (const c of e.charms ?? []) c.t--;
        Status.syncCharm(e);
    }

    // e가 (x, y)에 설 수 있는가? 매료한 상대(살아 있는) 모두에게서 n칸 이내여야 한다 (그 밖이면 못 간다)
    static charmBlocks(e, x, y) {
        for (const c of e.charms ?? []) {
            if (!c.by || !c.by.alive || c.t <= 0) continue;
            if (Math.abs(x - c.by.x) + Math.abs(y - c.by.y) > c.n) return true;
        }
        return false;
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
        if (key === "charm" && !v) e.charms = [];
        if ((key === "str" || key === "harden" || key === "growth") && e.statsChanged) e.statsChanged();
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
            if (k === "charm") continue; // 매료는 시전자별로 따로 센다 (tickCharm)
            if (e.statusT[k] >= Status.ENDLESS) continue;
            e.statusT[k]--;
            if (e.statusT[k] <= 0) Status.set(e, k, 0);
        }
        if (e.charms && e.charms.length) Status.tickCharm(e);
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

    // 시전자 이름 (같은 이름이 둘 이상이면 A·B…를 붙여 가른다). 방에 들어갈 때 번호는 처음부터
    static _labels = new Map();
    static casterName(by) {
        const base = by.displayName ?? "?";
        if (by.world && Status._lw !== by.world) { // 방이 바뀌면 번호는 처음부터
            Status._lw = by.world;
            Status._labels.clear();
        }
        if (!by._label) {
            const n = (Status._labels.get(base) ?? 0) + 1;
            Status._labels.set(base, n);
            by._label = String.fromCharCode(64 + Math.min(n, 26));
        }
        return by._label === "A" && !Status._dup(base, by) ? base : `${base}${by._label}`;
    }

    static _dup(base, by) {
        return (Status._labels.get(base) ?? 0) > 1;
    }

    // 화면에 그릴 상태이상 목록 [{ key, name, color, value, t, from }]. 매료는 시전자마다 하나씩
    static entries(e) {
        const out = [];
        for (const k of Object.keys(e.status ?? {})) {
            const d = Status.DEFS[k];
            if (!d) continue;
            if (k === "charm") {
                for (const c of e.charms ?? []) if (c.t > 0) out.push({ key: k, name: d.name, color: d.color, value: c.n, t: c.t, from: c.by ? Status.casterName(c.by) : null });
            } else out.push({ key: k, name: d.name, color: d.color, value: e.status[k], t: Status.turns(e, k), from: null, buff: !!d.buff });
        }
        return out;
    }

    // 상태이상 목록 창에 쓸 글: { title, desc }  (예: "매료(서큐버스A) 2칸 · 3턴")
    static describe(en) {
        if (en.key === "block") return { title: `방어도 ${en.value} · ${en.t}턴`, desc: "피해를 체력보다 먼저 막는다. 곧 끝나는 것부터 깎이고, 턴이 지나면 사라진다" };
        const d = Status.DEFS[en.key];
        const unit = en.key === "slow" ? "%" : "";
        const turns = en.t >= Status.ENDLESS ? "전투 중" : `${en.t}턴`;
        let part;
        if (d.kind === "dot") part = `${en.value}`;
        else if (d.kind === "turns") part = en.t >= Status.ENDLESS ? "" : turns;
        else if (en.key === "charm") part = `${en.value}칸 · ${turns}`;
        else part = `${en.value}${unit} · ${turns}`;
        const from = en.from ? `(${en.from})` : "";
        if (en.key === "charm") return { title: `${d.name}${from} ${part}`, desc: `${en.from ?? "건 상대"}에게서 ${en.value}칸 안으로만 움직일 수 있다 (여럿에게 걸리면 겹치는 범위)` };
        const desc = d.kind === "dot" ? "턴이 끝날 때 수치만큼 피해를 입고, 수치가 1 줄어든다" : d.desc ?? "";
        return { title: `${d.name}${from}${part ? " " + part : ""}`, desc };
    }

    // "독 3 · 화상 2(3턴)"  ·  매료는 "매료(서큐버스A) 2칸(3턴) · 매료(서큐버스B) 2칸(1턴)"
    static text(e) {
        return Object.keys(e.status ?? {}).filter((k) => Status.DEFS[k]).map((k) => {
            const d = Status.DEFS[k];
            if (k === "charm" && e.charms && e.charms.length) {
                return e.charms.filter((c) => c.t > 0).map((c) => `${d.name}(${c.by ? Status.casterName(c.by) : "?"}) ${c.n}칸(${c.t}턴)`).join(" · ");
            }
            const t = Status.turns(e, k);
            const unit = k === "slow" ? "%" : "";
            if (d.kind === "turns") return `${d.name} ${t >= Status.ENDLESS ? "" : t + "턴"}`.trim();
            const tt = d.kind === "vt" ? (t >= Status.ENDLESS ? "(전투 중)" : `(${t}턴)`) : "";
            return `${d.name} ${e.status[k]}${unit}${tt}`;
        }).join(" · ");
    }
}

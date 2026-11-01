// 런 저장본. 브라우저 localStorage "kortfinite.run"에 하나만 둔다 (이 브라우저에서만 보인다).
// 방 사이(지도에서 고를 때, 방에 들어갈 때)에 저장한다. 런이 끝나면(이기거나 쓰러지면) 지운다.
// 형식(VERSION)이 다른 저장본과 예전 오픈월드 세계 저장본(kortfinite.worlds, kortfinite.world.*)은 읽을 때 지운다.
// localStorage를 못 쓰는 환경(사생활 보호 모드 등)이면 메모리에만 두고, 새로고침하면 사라진다.
class RunStore {
    static KEY = "kortfinite.run";
    static VERSION = 8; // 아이작식 층 지도 = 8, 로그라이크 런 = 4, 지도 4~5칸 그물망 = 5, 엇갈림 적은 지도·시드 섞기 = 6, 공방 데이터 카드·적으로 교체 = 7
    static persistent = true;
    static _memory = null;

    static _cleanOld() {
        try {
            for (let i = localStorage.length - 1; i >= 0; i--) {
                const k = localStorage.key(i);
                if (k && (k === "kortfinite.worlds" || k.startsWith("kortfinite.world."))) localStorage.removeItem(k);
            }
        } catch (e) {
            RunStore.persistent = false;
        }
    }

    static load() {
        RunStore._cleanOld();
        let raw = RunStore._memory;
        try {
            raw = localStorage.getItem(RunStore.KEY) ?? raw;
        } catch (e) {
            RunStore.persistent = false;
        }
        if (!raw) return null;
        try {
            const data = JSON.parse(raw);
            if (data.version !== RunStore.VERSION) {
                RunStore.clear();
                return null;
            }
            return data;
        } catch (e) {
            return null;
        }
    }

    static save(data) {
        RunStore._cleanOld();
        const raw = JSON.stringify(data);
        RunStore._memory = raw;
        try {
            localStorage.setItem(RunStore.KEY, raw);
            return true;
        } catch (e) {
            RunStore.persistent = false;
            return false;
        }
    }

    static clear() {
        RunStore._memory = null;
        try {
            localStorage.removeItem(RunStore.KEY);
        } catch (e) {
            RunStore.persistent = false;
        }
    }

    // 시드 글자: 숫자면 그 숫자, 글자면 해시, 비우면 무작위
    static seedFrom(text) {
        const t = (text ?? "").trim();
        if (!t) return Math.floor(Math.random() * 2147483647);
        if (/^-?\d+$/.test(t)) return Number(t) >>> 0;
        let h = 2166136261;
        for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619);
        return h >>> 0;
    }
}

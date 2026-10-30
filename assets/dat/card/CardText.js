// 카드 설명글의 색 글자와 용어 풀이.
//
// 설명글 안에 [[키:글자]]를 넣으면 그 글자를 키의 색으로 칠한다 (UIText의 rich 옵션).
//   능력치 키: hp 체력 · mana 마나 · energy 기력 · atk 공격력 · def 방어력 · spd 이동속도 · gold 돈
//   상태 이상 키: Status.DEFS의 키 (poison, burn, weak ...)
// 숫자가 능력치에서 나오면 CardText.stat으로 쓴다:
//   자세히 (덱 보기·상점·보상)  "공격력 100%(5)"
//   짧게   (전투 중 패·덱·묘지)  "5"
// 어느 쪽으로 쓸지는 CardText.verbose가 정한다. 화면이 card.text(true/false)로 골라 읽는다.
class CardText {
    static verbose = false;

    // 색: light = 어두운 바탕(설명 칸)용, dark = 카드 종이(밝은 바탕)용
    static STATS = {
        hp: { name: "체력", light: "#7cd47c", dark: "#257025" },
        mana: { name: "마나", light: "#7aaaf2", dark: "#24509e" },
        energy: { name: "기력", light: "#f29a3a", dark: "#a85200" },
        atk: { name: "공격력", light: "#f5bf8c", dark: "#9a4a14" },
        def: { name: "방어력", light: "#b6c6d6", dark: "#455a70" },
        spd: { name: "이동속도", light: "#f0e08a", dark: "#7d6a00" },
        gold: { name: "돈", light: "#f0d060", dark: "#866400" }
    };

    // 능력치 비례 수치. pct가 없으면 "이동속도(3)"처럼
    static stat(key, pct, value) {
        const s = CardText.STATS[key];
        if (!CardText.verbose) return `[[${key}:${value}]]`;
        return pct === null || pct === undefined ? `[[${key}:${s.name}(${value})]]` : `[[${key}:${s.name} ${pct}%(${value})]]`;
    }

    // 그냥 색만 칠하기
    static tag(key, text) {
        return `[[${key}:${text}]]`;
    }

    // 자세히 볼 때만 붙는 글 (공식 설명 등)
    static more(text) {
        return CardText.verbose ? text : "";
    }

    // 상태 이상 이름에 색 ("독 3")
    static status(key, text = null) {
        return `[[${key}:${text ?? Status.DEFS[key].name}]]`;
    }

    static with(verbose, fn) {
        const old = CardText.verbose;
        CardText.verbose = verbose;
        try {
            return fn();
        } finally {
            CardText.verbose = old;
        }
    }

    static strip(text) {
        return String(text ?? "").replace(/\[\[(\w+):([^\]]*)\]\]/g, "$2");
    }

    static color(key, palette = "light") {
        const s = CardText.STATS[key];
        if (s) return s[palette];
        const d = typeof Status !== "undefined" && Status.DEFS[key];
        if (!d) return null;
        return palette === "light" ? d.color : CardText.darken(d.color);
    }

    // 밝은 상태 색을 종이 위에서도 읽히게 어둡게 (흰색 계열은 회색으로)
    static darken(hex) {
        const n = parseInt(hex.slice(1), 16);
        let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
        const k = 0.5;
        r = Math.round(r * k); g = Math.round(g * k); b = Math.round(b * k);
        return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
    }

    // "가 [[atk:5]] 피해" → [{ text: "가 " }, { text: "5", color }, { text: " 피해" }]
    static parse(text, palette = "light") {
        const out = [];
        const re = /\[\[(\w+):([^\]]*)\]\]/g;
        let last = 0;
        let m;
        while ((m = re.exec(text))) {
            if (m.index > last) out.push({ text: text.slice(last, m.index), color: null });
            out.push({ text: m[2], color: CardText.color(m[1], palette), bold: true });
            last = re.lastIndex;
        }
        if (last < text.length) out.push({ text: text.slice(last), color: null });
        return out;
    }

    // ---------- 용어 풀이 ----------
    // 카드 설명에 나오면 상세 칸 아래에 풀이를 붙인다 (설정에서 끌 수 있다)
    static TERMS = [
        ["독", "poison", "턴이 지날 때마다 수치만큼 피해를 받고, 수치가 1 줄어든다."],
        ["화상", "burn", "턴이 지날 때마다 3 피해를 받는다. 남은 턴이 1씩 줄어든다."],
        ["약화", "weak", "주는 피해가 25% 줄어든다 (남은 턴 동안)."],
        ["취약", "vuln", "받는 피해가 50% 늘어난다 (남은 턴 동안)."],
        ["기절", "stun", "그 턴에는 아무것도 하지 못한다."],
        ["속박", "root", "움직이지 못한다. 이동 카드를 쓸 수 없다 (남은 턴 동안)."],
        ["재생", "regen", "턴이 지날 때마다 체력을 2 회복한다 (남은 턴 동안)."],
        ["힘", "str", "공격력이 수치만큼 오른다 (이 방 동안)."],
        ["가시", "thorns", "나를 때린 적이 수치만큼 피해를 받는다 (이 방 동안)."],
        ["방어도", "def", "받는 피해를 먼저 막아 주는 수치. 정해진 턴이 지나면 사라진다."],
        ["소멸", null, "쓰면 이 방에서는 다시 나오지 않는다. 다음 방에서 덱으로 돌아온다."],
        ["임시 카드", null, "쓰거나 버리면 사라지고, 방을 나가면 없어진다."],
        ["쉼", null, "쓰고 나면 그만큼의 턴 동안 카드를 뽑을 수 없다."],
        ["위력", null, "주문의 세기. 비용으로 낸 자원과 증폭 젬으로 정해진다."],
        ["젬 칸", null, "젬을 끼울 수 있는 자리. 젬은 주문을 강하게 한다."],
        ["밀어", null, "대상을 밀어낸다. 벽이나 다른 적에 부딪히면 3 피해."],
        ["장판", null, "바닥에 깔려 몇 턴 동안 남는다. 밟은 적에게 효과를 준다."],
        ["지뢰", null, "적이 그 칸이나 바로 옆에 오면 터진다."],
        ["장벽", null, "몇 턴 동안 칸을 막는 벽. 적도 나도 지나갈 수 없다."]
    ];

    // 설명글에 나온 용어들 [{ name, key, text }]
    static terms(text) {
        const plain = CardText.strip(text);
        return CardText.TERMS.filter(([name]) => plain.includes(name)).map(([name, key, t]) => ({ name, key, text: t }));
    }

    // 풀이를 한 덩어리 글로 ("[[poison:독]]: 턴이 지날 때마다 …")
    static glossary(text) {
        return CardText.terms(text).map((t) => `${t.key ? `[[${t.key}:${t.name}]]` : t.name}: ${t.text}`).join("\n");
    }
}

UIText.colorOf = (key, palette) => CardText.color(key, palette);

// 카드 강화 흐름 (모닥불·상인이 같이 쓴다). 담당: UpgradeFlow 에이전트가 채운다.
// 강화 색: red 붉은 · blue 푸른 · yellow 노란 (쉬움), green 초록 · purple 보라 (어려움).
// 계약 (다른 코드가 이 모양으로 부른다):
//   UpgradeFlow.COLORS[key] = { name: "붉은", css: "#e8584a", hard: false }
//   UpgradeFlow.EASY = ["red","blue","yellow"], UpgradeFlow.HARD = ["green","purple"]
//   UpgradeFlow.candidates(player, colors = null) → 그 색(null이면 아무 색) 강화를 지금 받을 수 있는 행동 카드들 (Card[])
//   UpgradeFlow.open({ colors = null, title = "강화", onDone = null })
//       Game.player / Game.deckView로 카드를 고르게 하고(색 제한), 한 카드에 갈래가 여럿이면 강화 하나를 고르게 한 뒤 그 자리에서 바꾼다.
//       바꿨으면 onDone(바뀐 Card), 취소하거나 후보가 없으면 onDone(null). 부르는 쪽은 onDone(card)일 때만 값·기회를 쓴다.
class UpgradeFlow {
    static COLORS = {
        red: { name: "붉은", css: "#e8584a", hard: false },
        blue: { name: "푸른", css: "#58a0f0", hard: false },
        yellow: { name: "노란", css: "#f0d040", hard: false },
        green: { name: "초록", css: "#5cc86c", hard: true },
        purple: { name: "보라", css: "#b078e0", hard: true }
    };
    static EASY = ["red", "blue", "yellow"];
    static HARD = ["green", "purple"];

    // 그 카드가 지금 받을 수 있는 강화들 (변형 키가 colors 안인 것. null이면 전부)
    static optionsOf(card, colors = null) {
        return GameContent.upgradesOf(card.defId).filter((d) => !colors || colors.includes(d.upgradeKey));
    }

    static candidates(player, colors = null) {
        return player.cards.allActions.filter((c) => UpgradeFlow.optionsOf(c, colors).length > 0);
    }

    // 제목: 색이 하나면 그 색 이름을 앞에 붙인다 ("붉은 강화")
    static headline(title, colors) {
        const base = title.split(" · ")[0];
        const c = colors && colors.length === 1 ? UpgradeFlow.COLORS[colors[0]] : null;
        return c ? `${c.name} ${base}` : base;
    }

    // deckView.pick에 "취소" 알림을 덧붙인다 (그만두기·닫기·Esc로 닫히면 onCancel)
    static pick(deckView, title, cards, onPick, onCancel) {
        let picked = false;
        const release = () => delete deckView.close;
        const orig = deckView.close.bind(deckView);
        deckView.close = () => {
            release();
            orig();
            Promise.resolve().then(() => { if (!picked) onCancel(); });
        };
        deckView.pick(title, cards, (card) => {
            picked = true;
            onPick(card);
        });
    }

    static open({ colors = null, title = "강화", onDone = null } = {}) {
        const player = Game.player;
        const deckView = Game.deckView;
        const done = (card) => { if (onDone) onDone(card); };
        const cards = UpgradeFlow.candidates(player, colors);
        if (cards.length === 0) {
            MessageLog.add("강화할 수 있는 카드가 없다", "#c8b890");
            return done(null);
        }
        const head = UpgradeFlow.headline(title, colors);
        const first = title.includes("카드를 고른다") ? (colors && colors.length === 1 ? `${UpgradeFlow.COLORS[colors[0]].name} ${title}` : title) : `${head} · 카드를 고른다`;
        UpgradeFlow.pick(deckView, first, cards, (card) => {
            const opts = UpgradeFlow.optionsOf(card, colors);
            if (opts.length === 0) return done(null);
            const apply = (preview) => {
                const before = card.name;
                card.defId = preview.def.id;
                card.rollCost();
                player.cards._changed();
                MessageLog.add(`${before} → ${card.name} 강화했다`, "#f0c080");
                done(card);
            };
            const previews = opts.map((d) => Object.assign(new Card(d.id), { data: card.data ? { ...card.data } : null }).rollCost());
            if (previews.length === 1) return apply(previews[0]);
            UpgradeFlow.pick(deckView, `${head} · ${card.name}`, previews, apply, () => done(null));
        }, () => done(null));
    }
}

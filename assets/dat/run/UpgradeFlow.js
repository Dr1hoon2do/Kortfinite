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

    // colors가 null이면 먼저 "어떤 색으로 강화할까?"를 물어 색을 정하고(카드 고르기에서 취소하면 색 고르기로 돌아온다),
    // colors가 주어지면(상인·퀘스트) 색 고르기 없이 곧바로 카드를 고른다.
    static open({ colors = null, title = "강화", onDone = null } = {}) {
        const player = Game.player;
        const done = (card) => { if (onDone) onDone(card); };
        if (colors) return UpgradeFlow.openCards({ colors, title, done, onCancel: () => done(null) });
        if (UpgradeFlow.candidates(player).length === 0) {
            MessageLog.add("강화할 수 있는 카드가 없다", "#c8b890");
            return done(null);
        }
        const choose = () => {
            UpgradeFlow.colorDialog().open(player, (key) => {
                if (!key) return done(null);
                UpgradeFlow.openCards({ colors: [key], title, done, onCancel: choose });
            });
        };
        choose();
    }

    // 색 고르기 창 (처음 필요할 때 만든다)
    static colorDialog() {
        const deckView = Game.deckView;
        if (!UpgradeFlow._dialog || UpgradeFlow._dialog.engine !== deckView.engine) {
            UpgradeFlow._dialog = deckView.gameObject.addComponent(new UpgradeColorDialog({ engine: deckView.engine }));
        }
        return UpgradeFlow._dialog;
    }

    // 색이 정해진 카드 고르기 → 강화. 카드 고르기를 취소하면 onCancel
    static openCards({ colors, title, done, onCancel }) {
        const player = Game.player;
        const deckView = Game.deckView;
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
        }, onCancel);
    }
}

// "어떤 색으로 강화할까?" 창: 색마다 큰 버튼 (색 칩 · 이름 · 받을 수 있는 카드 수). 후보 없는 색은 흐리게 꺼 둔다.
class UpgradeColorDialog extends Component {
    static W = 340;
    static ROW = 48;
    static GAP = 6;

    constructor(options) {
        super();
        this.engine = options.engine;
        this.onPick = null;
        this.rows = [];
        this.armed = false;
    }

    get isOpen() {
        return this.onPick !== null;
    }

    start() {
        this.build();
    }

    // 창을 만든다 (런타임에 붙여서 start()가 늦으니 open()에서도 부른다)
    build() {
        if (this.root) return;
        const keys = [...UpgradeFlow.EASY, ...UpgradeFlow.HARD];
        const { ROW, GAP, W } = UpgradeColorDialog;
        this.height = 56 + keys.length * (ROW + GAP) + 36 + 10;
        const { root, box } = Modal.create(this.engine, "upgradeColor", W, this.height, () => this.finish(null));
        this.root = root;
        this.box = box;
        UIKit.label(box, "title", "어떤 색으로 강화할까?", 14, 10, null, 18, { fontSize: 14, fontWeight: "bold", color: UIKit.COLORS.gold });
        UIKit.label(box, "sub", "색을 고르면, 그 색을 받을 수 있는 카드만 보인다.", 14, 32, null, 14, { fontSize: 11, color: "#c8b890" });
        keys.forEach((key, i) => {
            const c = UpgradeFlow.COLORS[key];
            const b = UIKit.button(box, key, "", () => this.finish(key), { fontSize: 12 });
            b.rt.setAnchor(0, 0, 1, 0);
            b.rt.setOffsets(14, 56 + i * (ROW + GAP), 14, -(56 + i * (ROW + GAP) + ROW));
            const chip = b.rt.createChild("chip");
            UIKit.place(chip, 10, 10, 28, 28);
            const chipRect = chip.addComponent(new UIRect({ color: c.css, borderColor: "#1e1610", borderWidth: 1 }));
            const name = UIKit.label(b.rt, "name", `${c.name} 강화`, 50, 8, null, 18, { fontSize: 14, fontWeight: "bold" });
            const note = UIKit.label(b.rt, "note", "", 50, 28, null, 14, { fontSize: 11, color: "#e89060" });
            const count = UIKit.label(b.rt, "count", "", 12, 14, null, 18, { fontSize: 14, fontWeight: "bold", align: "right" });
            this.rows.push({ key, b, chipRect, name, note, count });
        });
        const close = UIKit.button(box, "close", "그만두기", () => this.finish(null), { fontSize: 12 });
        close.rt.setAnchor(0, 1, 1, 1);
        close.rt.setOffsets(14, -46, 14, 10);
    }

    // 색을 정하면 onPick(key), 그만두면 onPick(null)
    open(player, onPick) {
        this.build();
        this.onPick = onPick;
        this.armed = false;
        for (const r of this.rows) {
            const c = UpgradeFlow.COLORS[r.key];
            const n = UpgradeFlow.candidates(player, [r.key]).length;
            r.count.setText(n > 0 ? `${n}장` : "0장");
            r.note.setText(n === 0 ? "받을 카드 없음" : c.hard ? "어려움" : "");
            r.note.color = n === 0 ? UIKit.COLORS.faint : "#e89060";
            r.chipRect.color = n > 0 ? c.css : UIKit.COLORS.faint;
            r.name.color = n > 0 ? UIKit.COLORS.text : UIKit.COLORS.faint;
            r.count.color = n > 0 ? UIKit.COLORS.gold : UIKit.COLORS.faint;
            r.b.rect.color = n > 0 ? UIKit.COLORS.button : UIKit.COLORS.buttonOff;
            r.b.ui.enabled = n > 0;
        }
        Modal.fit(this.engine, this.box, UpgradeColorDialog.W, this.height);
        Modal.show(this.root, true);
    }

    finish(key) {
        const fn = this.onPick;
        if (!fn) return;
        this.onPick = null;
        Modal.show(this.root, false);
        fn(key);
    }

    update() {
        if (!this.onPick) return;
        if (!this.armed) { this.armed = true; return; }
        if (Input.getButtonDown("cancel")) this.finish(null);
    }
}

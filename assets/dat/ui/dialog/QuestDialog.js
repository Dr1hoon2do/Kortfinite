// 퀘스트 창 (퀘스트 게시판에 말을 걸면). 계약: new QuestDialog({ engine, player, run, deckView }), open(board), isOpen.
//   위: 이 층 정보 ("받은 퀘스트 0/2"). 목록은 두 묶음이다:
//     [게시판] 이 층에 제시된 3개 — 줄마다 색 띠, "붉은 강화", 조건 글, 보상, [받기]
//     [받은 퀘스트] 받은 것 — 진행 "4/10"과 상태, 완료면 [보상 받기]
//   목록은 페이지식이다 ([▲]/[▼]로 쪽을 넘긴다, ShopDialog와 같다).
class QuestDialog extends Component {
    static ROW = 80;
    static HEAD = 24;
    static W = 440;
    static H = 520;

    constructor(options) {
        super();
        this.engine = options.engine;
        this.player = options.player;
        this.run = options.run;
        this.deckView = options.deckView;
        this.board = null;
        this.rows = [];
        this.pages = [];
        this.page = 0;
        this._key = null;
    }

    get isOpen() {
        return this.board !== null;
    }

    start() {
        const { root, box } = Modal.create(this.engine, "quest", QuestDialog.W, QuestDialog.H, () => this.close());
        this.root = root;
        this.box = box;
        UIKit.label(box, "title", "퀘스트 게시판", 14, 10, null, 18, { fontSize: 14, fontWeight: "bold", color: UIKit.COLORS.gold });
        this.info = UIKit.label(box, "info", "", 14, 32, null, 16, { fontSize: 12, color: "#e8d9b8" });
        UIKit.label(box, "hint", "층마다 2개까지 받을 수 있다. 완료하고 여기서 보상을 받자", 14, 50, null, 14, { fontSize: 10, color: "#a89878" });

        const list = box.createChild("list");
        this.list = list.getComponent(RectTransform);
        this.list.setAnchor(0, 0, 1, 1);
        this.list.setOffsets(12, 72, 12, 94);
        list.addComponent(new UIRect({ color: "rgba(0, 0, 0, 0.25)" }));
        list.addComponent(new UIMask());
        this.content = this.list.createChild("content").getComponent(RectTransform);
        this.content.setAnchor(0, 0, 1, 1);
        this.content.setOffsets(0, 0, 0, 0);

        this.prevButton = UIKit.button(box, "prev", "▲ 위", () => this.turnPage(-1), { fontSize: 12 });
        this.prevButton.rt.setAnchor(0, 1, 0.4, 1);
        this.prevButton.rt.setOffsets(12, -86, 3, 52);
        this.pageText = UIKit.label(box, "page", "", 0, 0, null, 18, { fontSize: 12, color: "#c8b890", align: "center", verticalAlign: "middle" });
        const prt = this.pageText.gameObject.getComponent(RectTransform);
        prt.setAnchor(0.4, 1, 0.6, 1);
        prt.setOffsets(0, -86, 0, 52);
        this.nextButton = UIKit.button(box, "next", "▼ 아래", () => this.turnPage(1), { fontSize: 12 });
        this.nextButton.rt.setAnchor(0.6, 1, 1, 1);
        this.nextButton.rt.setOffsets(3, -86, 12, 52);

        const close = UIKit.button(box, "close", "나가기", () => this.close(), { fontSize: 13 });
        close.rt.setAnchor(0, 1, 1, 1);
        close.rt.setOffsets(12, -44, 12, 10);
    }

    open(board) {
        this.board = board;
        this.page = 0;
        this._key = null;
        Modal.fit(this.engine, this.box, QuestDialog.W, QuestDialog.H);
        Modal.show(this.root, true);
    }

    close() {
        if (!this.board) return;
        this.board = null;
        Modal.show(this.root, false);
    }

    update() {
        if (!this.board) return;
        if (Input.getButtonDown("cancel")) return this.close();
        if (!this.player.alive) return this.close();
        const key = [this.page, this.pageSize(), QuestLog.offers.map((q) => `${q.status}${q.progress}`).join(",")].join("|");
        if (key !== this._key) {
            this._key = key;
            this.rebuild();
        }
    }

    turnPage(d) {
        this.page += d;
        this._key = null;
    }

    // 목록 칸 높이 (UI 단위)
    listHeight() {
        return this.list.rect.height / this.list.uiRoot.scale;
    }

    pageSize() {
        return Math.floor(this.listHeight());
    }

    // 목록 항목: 머리글 또는 퀘스트 줄. 높이를 보며 쪽으로 나눈다
    entries() {
        const offers = QuestLog.offers;
        const taken = QuestLog.accepted;
        const list = [{ head: "게시판 — 이 층에 붙은 퀘스트" }];
        for (const q of offers) list.push({ q, board: true });
        list.push({ head: `받은 퀘스트 ${taken.length}/${QuestLog.MAX_ACCEPT}` });
        if (taken.length === 0) list.push({ empty: true });
        for (const q of taken) list.push({ q, board: false });
        return list;
    }

    static heightOf(e) {
        return e.head ? QuestDialog.HEAD : e.empty ? 30 : QuestDialog.ROW;
    }

    paginate(entries, limit) {
        const pages = [[]];
        let used = 6;
        entries.forEach((e, i) => {
            const h = QuestDialog.heightOf(e) + (e.head && entries[i + 1] ? QuestDialog.heightOf(entries[i + 1]) : 0); // 머리글은 다음 줄과 같은 쪽에
            if (used + h > limit && pages[pages.length - 1].length) {
                pages.push([]);
                used = 6;
            }
            pages[pages.length - 1].push(e);
            used += QuestDialog.heightOf(e);
        });
        return pages;
    }

    rebuild() {
        for (const row of this.rows) row.destroy();
        this.rows = [];
        const taken = QuestLog.acceptedCount;
        this.info.setText(`${QuestLog.state.floor ?? this.run.floorNo}층 · 받은 퀘스트 ${taken}/${QuestLog.MAX_ACCEPT}`);
        this.pages = this.paginate(this.entries(), this.pageSize());
        this.page = Math.max(0, Math.min(this.pages.length - 1, this.page));
        this.pageText.setText(`${this.page + 1} / ${this.pages.length} 쪽`);
        UIKit.setEnabled(this.prevButton, this.page > 0);
        UIKit.setEnabled(this.nextButton, this.page < this.pages.length - 1);
        let y = 6;
        for (const e of this.pages[this.page]) {
            if (e.head) y = this.addHead(y, e.head);
            else if (e.empty) y = this.addEmpty(y);
            else y = this.addQuest(y, e.q, e.board);
        }
    }

    addHead(y, text) {
        const go = this.content.createChild("head");
        const rt = UIKit.place(go, 6, y, null, QuestDialog.HEAD - 4);
        UIKit.label(rt, "t", text, 2, 3, null, 14, { fontSize: 11, fontWeight: "bold", color: UIKit.COLORS.gold });
        this.rows.push(go);
        return y + QuestDialog.HEAD;
    }

    addEmpty(y) {
        const go = this.content.createChild("empty");
        const rt = UIKit.place(go, 6, y, null, 24);
        UIKit.label(rt, "t", "아직 받은 퀘스트가 없다", 8, 4, null, 14, { fontSize: 11, color: UIKit.COLORS.faint });
        this.rows.push(go);
        return y + 30;
    }

    // 퀘스트 한 줄. board: 게시판 쪽(받기 버튼) / 받은 쪽(진행·보상 버튼)
    addQuest(y, q, board) {
        const h = QuestDialog.ROW - 6;
        const color = UpgradeFlow.COLORS[q.color].css;
        const go = this.content.createChild("row");
        const rt = UIKit.place(go, 6, y, null, h);
        const faded = board ? q.status !== "offered" : q.status === "failed" || q.status === "claimed";
        go.addComponent(new UIRect({ color: faded ? "rgba(30, 26, 22, 0.8)" : "rgba(42, 35, 30, 0.95)", borderColor: UIKit.COLORS.border, borderWidth: 1 }));
        // 색 띠 (왼쪽)
        const chip = rt.createChild("chip");
        const crt = chip.getComponent(RectTransform);
        crt.setAnchor(0, 0, 0, 1);
        crt.setOffsets(0, 0, -7, 0);
        chip.addComponent(new UIRect({ color: faded ? "#4a423a" : color }));
        // 글자 칸: 오른쪽 버튼과 겹치지 않게 잘라서 보인다
        const tb = rt.createChild("text");
        const brt = tb.getComponent(RectTransform);
        brt.setAnchor(0, 0, 1, 1);
        brt.setOffsets(14, 0, 84, 0);
        tb.addComponent(new UIMask());
        const name = `${UpgradeFlow.COLORS[q.color].name} 강화${UpgradeFlow.COLORS[q.color].hard ? " · 어려움" : ""}`;
        UIKit.label(brt, "name", name, 0, 5, null, 15, { fontSize: 12, fontWeight: "bold", color: faded ? UIKit.COLORS.faint : color });
        UIKit.label(brt, "cond", QuestLog.condText(q), 0, 21, null, 34, { fontSize: 11, color: faded ? UIKit.COLORS.faint : UIKit.COLORS.text, wrap: true, lineHeight: 1.3 });
        let tail;
        if (board) tail = `보상 ${QuestLog.rewardText(q)}`;
        else tail = `${QuestDialog.STATUS[q.status]}${q.status === "active" || q.status === "failed" ? " " + QuestLog.progressText(q) : ""} · ${QuestLog.rewardText(q)}`;
        UIKit.label(brt, "tail", tail, 0, 58, null, 14, { fontSize: 10, color: faded ? UIKit.COLORS.faint : "#c8b890" });

        // 버튼
        let label, ok, fn = null;
        if (board) {
            if (q.status !== "offered") { label = "받음"; ok = false; }
            else if (QuestLog.acceptedCount >= QuestLog.MAX_ACCEPT) { label = "가득 참"; ok = false; }
            else { label = "받기"; ok = true; fn = () => { QuestLog.accept(q.id); this._key = null; }; }
        } else {
            label = { active: "진행 중", done: "보상 받기", failed: "실패", claimed: "받음" }[q.status];
            ok = q.status === "done";
            if (ok) fn = () => this.claim(q);
        }
        const b = UIKit.button(rt, "act", label, fn || (() => {}), { fontSize: 11 });
        b.rt.setAnchor(1, 0, 1, 0);
        b.rt.setOffsets(-76, (h - 34) / 2, 6, -((h - 34) / 2 + 34));
        UIKit.setEnabled(b, ok);
        this.rows.push(go);
        return y + QuestDialog.ROW;
    }

    static STATUS = { active: "진행 중", done: "완료!", failed: "실패", claimed: "보상 받음", offered: "" };

    // 보상 받기: 창을 먼저 닫고(겹침 방지) 강화 카드 고르기. 끝나면 창을 다시 연다
    claim(q) {
        const board = this.board;
        this.close();
        QuestLog.claim(q.id, () => {
            if (!this.board && this.player.alive) this.open(board);
        });
    }
}

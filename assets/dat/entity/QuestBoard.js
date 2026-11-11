// 퀘스트 게시판 (퀘스트 방의 지형지물). 담당: 퀘스트 에이전트가 채운다.
// 계약: type "questboard", 생성 데이터 { extra, seed, floor }. roomState()는 { } 정도(퀘스트 자체는 QuestLog가 런에 가진다).
//   interact(ctx) → ctx.run.ui.quest.open(this).
class QuestBoard extends Prop {
    constructor(x, y, data = {}) {
        super(x, y, "questboard", { type: "questboard", name: "퀘스트 게시판" });
        this.data = data;
    }

    roomState() {
        return {};
    }

    interact(ctx) {
        if (ctx.run.ui.quest) ctx.run.ui.quest.open(this);
        return true;
    }
}

EntityTypes.register("questboard", (x, y, d) => new QuestBoard(x, y, d));

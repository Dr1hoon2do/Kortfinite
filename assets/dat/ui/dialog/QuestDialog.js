// 퀘스트 창. 담당: 퀘스트 에이전트가 채운다. 계약: new QuestDialog({ engine, player, run, deckView }), open(board), isOpen.
class QuestDialog extends Component {
    constructor(options) {
        super();
        this.engine = options.engine;
        this.player = options.player;
        this.run = options.run;
        this.deckView = options.deckView;
        this.board = null;
    }

    get isOpen() {
        return this.board !== null;
    }

    open(board) {
        MessageLog.add("퀘스트 게시판 (아직 준비 중)", "#c8b890");
    }
}

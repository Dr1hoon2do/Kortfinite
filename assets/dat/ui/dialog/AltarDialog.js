// 제단 창. 담당: 제단 에이전트가 채운다. 계약: new AltarDialog({ engine, player, run, deckView }), open(altar), isOpen.
class AltarDialog extends Component {
    constructor(options) {
        super();
        this.engine = options.engine;
        this.player = options.player;
        this.run = options.run;
        this.deckView = options.deckView;
        this.altar = null;
    }

    get isOpen() {
        return this.altar !== null;
    }

    open(altar) {
        MessageLog.add("제단 (아직 준비 중)", "#c8b890");
    }
}

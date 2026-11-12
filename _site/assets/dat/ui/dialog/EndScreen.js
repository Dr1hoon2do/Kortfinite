// 런이 끝났을 때 (우두머리 처치 / 쓰러짐): 결과와 [처음으로] 버튼. 저장본은 이미 지워졌다.
class EndScreen extends Component {
    constructor(options) {
        super();
        this.engine = options.engine;
        this.player = options.player;
    }

    start() {
        const { root, box } = Modal.create(this.engine, "runEnd", 300, 230, () => {});
        this.root = root;
        this.box = box;
        this.title = UIKit.label(box, "title", "", 0, 16, null, 24, { fontSize: 20, fontWeight: "bold", align: "center" });
        this.text = UIKit.label(box, "text", "", 18, 52, null, 110, { fontSize: 12, color: "#e8d9b8", wrap: true, lineHeight: 1.5 });
        const again = UIKit.button(box, "again", "처음으로", () => location.reload(), { fontSize: 13 });
        again.rt.setAnchor(0, 1, 1, 1);
        again.rt.setOffsets(18, -48, 18, 12);
    }

    open(won, run) {
        const p = this.player;
        this.title.color = won ? UIKit.COLORS.gold : "#f06060";
        this.title.setText(won ? "승리!" : "쓰러졌다");
        this.text.setText([
            won ? "마지막 우두머리를 쓰러뜨리고 던전을 클리어했다." : `${run.floor}층에서 쓰러졌다. 런이 끝났다.`,
            `지나온 방 ${run.visited.length}개 · 처치 ${p.kills}`,
            `덱 ${p.cards.allActions.length}장 · 돈 ${p.money} G`,
            "처음 화면에서 새 런을 시작할 수 있다."
        ].join("\n"));
        Modal.fit(this.engine, this.box, 300, 230);
        Modal.show(this.root, true);
    }
}

class Chunk extends Component {
    constructor(manager, cx, cy) {
        super();
        this.manager = manager;
        this.cx = cx;
        this.cy = cy;
        this.tiles = new Uint16Array(manager.chunkSize * manager.chunkSize);
        this.tileEntities = new Map();
        this.entities = new Set(); // 생물, 지형지물, 아이템 모두
        this.cells = new Map();    // 칸 번호 → 그 칸의 엔티티 배열 (entitiesAt·entityAt를 빠르게. ChunkManager가 맞춰 둔다)
        this.dirty = true;         // 타일 그림을 다시 구워야 하는가
        this.visible = false;      // 화면 근처라 엔티티 오브젝트가 켜져 있는가
        this.sprite = null;
        this.ghosts = [];          // 부서졌지만 부서지는 연출이 끝날 때까지 그림에 남겨 둘 구운 엔티티 { entity, until }
    }

    get key() {
        return this.cx + "," + this.cy;
    }
}

// 청크 타일을 캔버스 한 장에 구워서 그린다.
// 화면 근처(한 청크 여유)에 들어올 때만 캔버스를 만들고 굽고, 멀어지거나 청크가 꺼지면 캔버스를 버린다.
// 렌더 거리 17x17 청크를 전부 구워 두면 캔버스만 70MB가 넘어서, 보이는 것만 들고 있는다.
// 같은 기준으로 청크의 엔티티 오브젝트도 켜고 끈다.
// 지형지물(나무, 바위, 벽... entity.baked)은 타일 위에 같이 굽는다. 엔티티마다 따로 그리면 수천 번 그려야 해서다.
// 구운 엔티티가 들어오거나 나가면(ChunkManager가 dirty로 표시) 그 청크만 다시 굽는다.
class ChunkRenderer extends Component {
    static _list = [];

    constructor(chunk) {
        super();
        this.chunk = chunk;
        this.sr = null;
    }

    start() {
        const manager = this.chunk.manager;
        // 엔티티 스프라이트는 기준점이 중앙이라 타일 (x, y)의 중심이 월드 (x*t, y*t)에 온다.
        // 청크 이미지는 좌하단 기준점으로 반 타일만큼 당겨서 타일 중심을 엔티티와 맞춘다.
        const half = manager.tileSize / 2;
        this.transform.position = new Vector(this.chunk.cx * manager.allSize - half, this.chunk.cy * manager.allSize - half);
        this.sr = this.addComponent(new SpriteRenderer(null, { pivot: { x: 0, y: 0 } }));
    }

    update() {
        // 부서지는 연출이 끝내 안 온 유령 그림은 잠시 뒤 지운다
        const ghosts = this.chunk.ghosts;
        if (ghosts.length) {
            const now = performance.now();
            const left = ghosts.filter((g) => g.until > now);
            if (left.length !== ghosts.length) {
                this.chunk.ghosts = left;
                this.chunk.dirty = true;
            }
        }
        const near = this._nearCamera();
        if (near && (this.chunk.dirty || !this.chunk.sprite)) this.bake();
        else if (!near && this.chunk.sprite) this.release();
        // 엔티티(나무, 동물...)도 화면 근처 청크만 켠다. 수천 개를 매 프레임 돌지 않게
        if (near !== this.chunk.visible) this.chunk.manager.setEntitiesVisible(this.chunk, near);
    }

    onDisable() {
        if (this.chunk.sprite) this.release();
    }

    _nearCamera() {
        const cam = Camera.main;
        if (!cam) return false;
        const m = this.chunk.manager;
        const p = this.transform.position;
        const pad = m.allSize;
        return cam.isInView(p.x - pad, p.y - pad, p.x + m.allSize + pad, p.y + m.allSize + pad);
    }

    release() {
        this.chunk.sprite = null;
        this.chunk.dirty = true;
        if (this.sr) this.sr.setSprite(null);
    }

    bake() {
        const chunk = this.chunk;
        const n = chunk.manager.chunkSize;
        const t = chunk.manager.tileSize;

        if (!chunk.sprite) {
            chunk.sprite = document.createElement("canvas");
            chunk.sprite.width = chunk.manager.allSize;
            chunk.sprite.height = chunk.manager.allSize;
        }
        const ctx = chunk.sprite.getContext("2d");

        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, chunk.manager.allSize, chunk.manager.allSize);

        for (let ly = 0; ly < n; ly++) {
            for (let lx = 0; lx < n; lx++) {
                const def = TileDef.get(chunk.tiles[ly * n + lx]);
                if (!def.sprite) continue;
                ctx.drawImage(Resource.image(def.sprite), lx * t, (n - 1 - ly) * t);
            }
        }

        this._bakeEntities(ctx, chunk, n, t);

        chunk.dirty = false;
        this.sr.setSprite(chunk.sprite);
    }

    // 구운 엔티티를 북쪽 줄부터 그린다 (그림이 칸보다 커도 남쪽 것이 위에 오게)
    _bakeEntities(ctx, chunk, n, t) {
        const list = ChunkRenderer._list;
        list.length = 0;
        for (const e of chunk.entities) if (e.baked) list.push(e);
        for (const g of chunk.ghosts) list.push(g.entity);
        if (!list.length) return;
        list.sort((a, b) => b.y - a.y || a.x - b.x);
        const x0 = chunk.cx * n;
        const y0 = chunk.cy * n;
        for (const e of list) {
            const img = Resource.image(e.sprite);
            if (!img) continue;
            const w = img.naturalWidth || img.width;
            const h = img.naturalHeight || img.height;
            // 엔티티 그림은 칸 가운데 기준 (SpriteRenderer pivot 0.5와 같다)
            const px = (e.x - x0) * t + (t - w) / 2;
            const py = (n - 1 - (e.y - y0)) * t + (t - h) / 2;
            if (e.flipX) {
                ctx.save();
                ctx.translate(px + w, py);
                ctx.scale(-1, 1);
                ctx.drawImage(img, 0, 0);
                ctx.restore();
            } else {
                ctx.drawImage(img, px, py);
            }
        }
        list.length = 0;
    }
}

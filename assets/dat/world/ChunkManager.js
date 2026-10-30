// 방 하나의 타일·엔티티 저장소. 청크(16x16) 단위로 타일 그림을 구워 그린다.
// 방은 작아서(최대 2x2 청크) 렌더 거리 안 청크를 모두 켜 둔다. 방마다 새로 만들고, 방을 나가면 통째로 버린다.
// 청크를 처음 만들 때 생성기(RoomPlan)가 타일을 채우고 엔티티를 놓는다.
class ChunkManager extends Component {
    // options: { chunkSize, tileSize, renderDistance(타일), generator: { fillTiles(chunk), populate(chunk) → Entity[] } }
    constructor(options = {}) {
        super();
        this.chunkSize = options.chunkSize ?? 16;
        this.tileSize = options.tileSize ?? 16;
        this.allSize = this.chunkSize * this.tileSize;
        this.renderDistance = options.renderDistance ?? 128;
        this.generator = options.generator ?? null;
        this.chunks = new Map();
        this.turn = 0; // 지금 턴 (TurnManager가 알려 준다)
        this.actors = new Set(); // 턴마다 행동하는 것 (AI가 있는 엔티티, 플레이어)
        this.hazards = new Set(); // 장벽·지뢰·장판 (Allies.js의 Hazard)
        this.damagedProps = new Set(); // 다친 구운 지형지물 (PropOverlay가 체력바를 그린다)

        this.focus = null; // 보통 플레이어
        this.loadedBounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 }; // 켜진 청크가 덮는 월드 영역 (카메라 제한용)
        this._center = null;
        this._active = new Set();
    }

    // 플레이어 청크에서 몇 청크까지 켜는지 (128타일 / 16 = 8 → 17x17 청크)
    get chunkRadius() {
        return Math.ceil(this.renderDistance / this.chunkSize);
    }

    start() {
        this.propOverlay; // 구운 지형지물 체력바 렌더러를 미리 붙여 둔다
    }

    update() {
        if (this.focus) this.loadAround(this.focus.x, this.focus.y);
    }

    // (x, y) 타일이 있는 청크를 중심으로 반경 안 청크를 만들고 켜고, 벗어난 청크는 끈다
    loadAround(x, y) {
        const n = this.chunkSize;
        const ccx = Math.floor(x / n);
        const ccy = Math.floor(y / n);
        if (this._center && this._center.cx === ccx && this._center.cy === ccy) return;
        this._center = { cx: ccx, cy: ccy };

        // 원형: 플레이어 청크 가운데에서 청크의 가장 가까운 점까지가 renderDistance 안인 청크만
        const r = this.chunkRadius;
        const mx = ccx * n + n / 2;
        const my = ccy * n + n / 2;
        const next = new Set();
        for (let cy = ccy - r; cy <= ccy + r; cy++) {
            for (let cx = ccx - r; cx <= ccx + r; cx++) {
                const dx = Math.max(cx * n - mx, 0, mx - (cx * n + n));
                const dy = Math.max(cy * n - my, 0, my - (cy * n + n));
                if (dx * dx + dy * dy > this.renderDistance * this.renderDistance) continue;
                next.add(this.chunks.get(cx + "," + cy) ?? this._createChunk(cx, cy));
            }
        }
        for (const chunk of this._active) if (!next.has(chunk)) this._setChunkActive(chunk, false);
        for (const chunk of next) if (!this._active.has(chunk)) this._setChunkActive(chunk, true);
        this._active = next;

        const half = this.tileSize / 2;
        const b = this.loadedBounds;
        b.minX = (ccx - r) * this.allSize - half;
        b.minY = (ccy - r) * this.allSize - half;
        b.maxX = (ccx + r + 1) * this.allSize - half;
        b.maxY = (ccy + r + 1) * this.allSize - half;
    }

    // 그 청크가 아직 없으면 만든다 (꺼진 채로). 저장/부활처럼 렌더 범위 밖을 다룰 때 쓴다
    ensureChunk(cx, cy) {
        return this.chunks.get(cx + "," + cy) ?? this._createChunk(cx, cy);
    }

    _createChunk(cx, cy) {
        const chunk = new Chunk(this, cx, cy);
        const go = new GameObject("chunk " + cx + "," + cy);
        go.addComponent(chunk);
        go.addComponent(new ChunkRenderer(chunk));
        go.setActive(false);
        this.gameObject.addChild(go);
        this.chunks.set(chunk.key, chunk);

        if (this.generator) {
            this.generator.fillTiles(chunk);
            for (const entity of this.generator.populate(chunk)) this.spawn(entity);
        }
        return chunk;
    }

    // 청크를 켜고 끈다. 엔티티 오브젝트는 청크가 화면 근처일 때만 켠다 (setEntitiesVisible, ChunkRenderer가 부른다).
    // 엔티티 오브젝트가 꺼져 있어도 청크 데이터에는 그대로 있어서 턴 계산(AI)은 된다. 꺼지는 건 그리기와 update뿐.
    _setChunkActive(chunk, value) {
        chunk.gameObject.setActive(value);
        if (!value) this.setEntitiesVisible(chunk, false);
    }

    setEntitiesVisible(chunk, value) {
        chunk.visible = value;
        for (const entity of chunk.entities) {
            if (entity.baked || entity instanceof Player || !entity.gameObject) continue; // 구운 엔티티는 늘 꺼 둔다
            entity.gameObject.setActive(value);
        }
    }

    // 입자 (맞은 지형지물의 파편 등). 월드 오브젝트에 하나
    get particles() {
        if (!this._particles) this._particles = this.addComponent(new ParticleSystem({ capacity: 1024 }));
        return this._particles;
    }

    // 구운 지형지물의 체력바·피해 숫자
    get propOverlay() {
        if (!this._propOverlay) this._propOverlay = this.addComponent(new PropOverlay(this));
        return this._propOverlay;
    }

    // 구운 엔티티가 들어오거나 나가면 그 청크 그림을 다시 굽는다
    _bakeChanged(entity, chunk) {
        if (!entity.baked || !chunk) return;
        chunk.dirty = true;
    }

    getChunkAt(x, y) {
        return this.chunks.get(Math.floor(x / this.chunkSize) + "," + Math.floor(y / this.chunkSize));
    }

    // 청크 안 1차원 번호
    localIndex(x, y) {
        const n = this.chunkSize;
        return (((y % n) + n) % n) * n + (((x % n) + n) % n);
    }

    getTile(x, y) {
        const chunk = this.getChunkAt(x, y);
        if (!chunk) return TileDef.VOID;
        return chunk.tiles[this.localIndex(x, y)];
    }

    // 그 칸을 막고 있는 엔티티 (solid). 한 칸에 하나뿐이다. 이동·공격·길찾기는 이걸 본다.
    entityAt(x, y) {
        const chunk = this.getChunkAt(x, y);
        const cell = chunk && chunk.cells.get(this.localIndex(x, y));
        if (!cell) return undefined;
        for (const e of cell) if (e.solid) return e;
        return undefined;
    }

    // 그 칸의 모든 엔티티 (막는 엔티티 + 겹쳐 있는 아이템들)
    entitiesAt(x, y) {
        const chunk = this.getChunkAt(x, y);
        const cell = chunk && chunk.cells.get(this.localIndex(x, y));
        return cell ? cell.slice() : [];
    }

    // 칸 색인 (chunk.cells) 맞추기: 청크에 넣고 뺄 때, 칸을 옮길 때 부른다
    _cellAdd(chunk, e) {
        const i = this.localIndex(e.x, e.y);
        const cell = chunk.cells.get(i);
        if (cell) cell.push(e);
        else chunk.cells.set(i, [e]);
    }

    _cellRemove(chunk, e, x = e.x, y = e.y) {
        const i = this.localIndex(x, y);
        const cell = chunk.cells.get(i);
        if (!cell) return;
        const k = cell.indexOf(e);
        if (k >= 0) cell.splice(k, 1);
        if (!cell.length) chunk.cells.delete(i);
    }

    // 여러 칸에 있는 엔티티 중 조건에 맞는 것. tag를 주면 그 태그가 있는 것만
    entitiesIn(tiles, options = {}) {
        const list = [];
        for (const [x, y] of tiles) {
            for (const e of this.entitiesAt(x, y)) {
                if (!e.alive || (options.tag && !e.hasTag(options.tag)) || (options.filter && !options.filter(e))) continue;
                list.push(e);
            }
        }
        return list;
    }

    isWalkable(x, y) {
        return TileDef.get(this.getTile(x, y)).walkable && !this.entityAt(x, y);
    }

    // 이 타일에 들어갈 수 있는가 (엔티티는 안 본다)
    static tileOk(tileId) {
        const t = TileDef.get(tileId);
        return !!t && t.walkable;
    }

    canEnter(mover, x, y) {
        return ChunkManager.tileOk(this.getTile(x, y)) && !this.entityAt(x, y);
    }

    // (예전: 저장 대상 표시) 방은 저장하지 않는다. 부르는 곳이 많아 빈 함수로 둔다
    touch(entity) {}

    addEntity(entity) {
        entity.world = this;
        if (entity.ai || entity instanceof Player) this.actors.add(entity);
        if (entity.isHazard) this.hazards.add(entity);
        const n = this.chunkSize;
        const chunk = this.getChunkAt(entity.x, entity.y) ?? this.ensureChunk(Math.floor(entity.x / n), Math.floor(entity.y / n));
        chunk.entities.add(entity);
        this._cellAdd(chunk, entity);
        if (entity.baked) {
            this._bakeChanged(entity, chunk);
            if (entity.alive && entity.stats.hp < entity.stats.maxHp) this.damagedProps.add(entity); // 다친 채로 불러온 것
        }
    }

    removeEntity(entity) {
        this.actors.delete(entity);
        this.hazards.delete(entity);
        const chunk = this.getChunkAt(entity.x, entity.y);
        chunk.entities.delete(entity);
        this._cellRemove(chunk, entity);
        if (entity.baked) {
            // 부서진 것은 부서지는 연출(HitAnim)이 시작될 때까지 그림에 남긴다. 연출이 안 오면 잠시 뒤 저절로 빠진다
            if (!entity.alive) chunk.ghosts.push({ entity, until: performance.now() + 2000 });
            else this._bakeChanged(entity, chunk);
        }
    }

    // 부서지는 연출이 시작됐다: 남겨 둔 그림을 지운다
    releaseGhost(entity) {
        const chunk = this.getChunkAt(entity.x, entity.y);
        if (!chunk) return;
        const i = chunk.ghosts.findIndex((g) => g.entity === entity);
        if (i < 0) return;
        chunk.ghosts.splice(i, 1);
        chunk.dirty = true;
    }

    // 엔티티를 월드에 넣고 GameObject도 만든다 (월드 오브젝트의 자식). 청크가 꺼져 있으면 같이 꺼진 채로.
    spawn(entity) {
        this.addEntity(entity);
        const go = new GameObject(entity.type ?? "entity");
        go.addComponent(entity);
        const chunk = this.getChunkAt(entity.x, entity.y);
        go.setActive(chunk.gameObject.isActive && chunk.visible && !entity.baked);
        this.gameObject.addChild(go);
        return entity;
    }

    swapEntities(a, b) {
        const ca = this.getChunkAt(a.x, a.y);
        const cb = this.getChunkAt(b.x, b.y);
        this._cellRemove(ca, a);
        this._cellRemove(cb, b);
        [a.x, b.x] = [b.x, a.x];
        [a.y, b.y] = [b.y, a.y];
        if (ca !== cb) {
            ca.entities.delete(a);
            cb.entities.delete(b);
            ca.entities.add(b);
            cb.entities.add(a);
        }
        this._cellAdd(this.getChunkAt(a.x, a.y), a);
        this._cellAdd(this.getChunkAt(b.x, b.y), b);
    }

    moveEntity(entity, dx, dy) {
        if (dx) entity.flipX = dx < 0;

        const nx = entity.x + dx;
        const ny = entity.y + dy;
        if (!this.canEnter(entity, nx, ny)) return false;

        const from = this.getChunkAt(entity.x, entity.y);
        const to = this.getChunkAt(nx, ny);
        this._cellRemove(from, entity);
        if (from !== to) {
            from.entities.delete(entity);
            to.entities.add(entity);
            // 화면 근처 청크로 들어오면 보이게 (멀리서 걸어 들어오는 동물)
            if (to.visible && !(entity instanceof Player) && !entity.gameObject.isActive) entity.gameObject.setActive(true);
        }
        entity.x = nx;
        entity.y = ny;
        this._cellAdd(to, entity);
        return true;
    }

    // 순간이동 (부활 등). 도착 청크가 없으면 만든다
    teleport(entity, x, y) {
        this.removeEntity(entity);
        this.ensureChunk(Math.floor(x / this.chunkSize), Math.floor(y / this.chunkSize));
        entity.x = x;
        entity.y = y;
        this.addEntity(entity);
        entity.sync();
    }

    // (x, y)에서 가장 가까운 비어 있는 걸을 수 있는 칸 (나선형으로 찾는다)
    findFreeTile(x, y, maxRadius = 12) {
        for (let r = 0; r <= maxRadius; r++) {
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
                    this.ensureChunk(Math.floor((x + dx) / this.chunkSize), Math.floor((y + dy) / this.chunkSize));
                    if (this.isWalkable(x + dx, y + dy)) return { x: x + dx, y: y + dy };
                }
            }
        }
        return { x, y };
    }

    // center에서 원형 반경 radius 칸 안의 엔티티
    entitiesNear(center, radius) {
        const n = this.chunkSize;
        const cr = Math.ceil(radius / n) + 1;
        const r2 = radius * radius;
        const list = [];
        for (const e of this.activeEntities(center, cr)) {
            const dx = e.x - center.x;
            const dy = e.y - center.y;
            if (dx * dx + dy * dy <= r2) list.push(e);
        }
        return list;
    }

    // center에서 원형 반경 radius 칸 안의 행동하는 엔티티 (actors만 훑어서 빠르다)
    actorsNear(center, radius) {
        const r2 = radius * radius;
        const list = [];
        for (const e of this.actors) {
            const dx = e.x - center.x;
            const dy = e.y - center.y;
            if (dx * dx + dy * dy <= r2) list.push(e);
        }
        return list;
    }

    activeEntities(center, radius) {
        const n = this.chunkSize;
        const ccx = Math.floor(center.x / n);
        const ccy = Math.floor(center.y / n);
        const list = [];
        for (let cy = ccy - radius; cy <= ccy + radius; cy++) {
            for (let cx = ccx - radius; cx <= ccx + radius; cx++) {
                const chunk = this.chunks.get(cx + "," + cy);
                if (chunk) list.push(...chunk.entities);
            }
        }
        return list;
    }

    // 방 안의 살아 있는 적 (플레이어를 노리는 것)
    hostiles(player) {
        const list = [];
        for (const e of this.actors) if (e !== player && e.alive && e.ai && e.attitude === "hostile") list.push(e);
        return list;
    }
}

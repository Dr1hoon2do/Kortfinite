// 타일 종류표. 방(Room)은 바닥 타일과 벽 타일로 이루어진다. 벽 타일은 걸을 수 없고 부서지지 않는다 (무적 벽).
class TileDef {
    static VOID = 0;
    static FLOOR = 1;      // 던전 바닥 (전투방)
    static WALL = 2;       // 던전 벽 (방 둘레, 기둥)
    static CAVE_FLOOR = 3; // 동굴 바닥 (정예방)
    static CAVE_WALL = 4;
    static PLANKS = 5;     // 나무 마루 (상점)
    static GRASS = 6;      // 풀밭 (휴식처)

    static defs = [];

    static register(id, def) {
        TileDef.defs[id] = def;
    }

    static get(id) {
        return TileDef.defs[id];
    }
}

TileDef.register(TileDef.VOID, { name: "void", walkable: false, sprite: null });
TileDef.register(TileDef.FLOOR, { name: "floor", walkable: true, sprite: "dungeon_floor" });
TileDef.register(TileDef.WALL, { name: "wall", walkable: false, wall: true, sprite: "dungeon_wall" });
TileDef.register(TileDef.CAVE_FLOOR, { name: "cave_floor", walkable: true, sprite: "cave_floor" });
TileDef.register(TileDef.CAVE_WALL, { name: "cave_wall", walkable: false, wall: true, sprite: "cave_wall" });
TileDef.register(TileDef.PLANKS, { name: "planks", walkable: true, sprite: "planks" });
TileDef.register(TileDef.GRASS, { name: "grass", walkable: true, sprite: "grass" });

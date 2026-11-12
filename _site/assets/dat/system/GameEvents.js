// Kortfinite 게임 이벤트 이름. 엔진의 전역 버스 Events로 알리고 듣는다.
//   Events.emit(GameEvent.KILLED, { target, killer, world });
//   Events.on(GameEvent.KILLED, (e) => ..., { owner: this, priority: 0 });
// 오타를 막으려고 이름은 여기 상수로만 쓴다. 새 이벤트는 여기에 한 줄 + 알리는 곳에 emit 한 줄.
const GameEvent = {
    KILLED: "entity.killed",        // { target, killer, world }        생물이 쓰러짐 (Combat.kill). 플레이어도 포함
    DAMAGED: "entity.damaged",      // { target, damage, dealt, source, world, type }  피해를 받음 (Combat.hit). dealt = 실제로 깎인 체력
    PLAYER_DIED: "player.died",     // { player, killer, world }
    TURN_END: "turn.end",           // { turn }                         턴이 끝남
    CARD_USED: "card.used",         // { card, user }                   카드를 씀
    ROOM_ENTERED: "room.entered",   // { node, room }                   지도에서 고른 방에 들어감
    ROOM_CLEARED: "room.cleared",   // { node, room }                   방의 적을 모두 쓰러뜨림 (출구가 열린다)
    RUN_ENDED: "run.ended"          // { won, floor }                   런이 끝남 (보스 처치 또는 쓰러짐)
};

// 이 층의 퀘스트 기록 (런에 하나, 층마다 처음부터). 담당: 퀘스트 에이전트가 채운다.
// 계약 (Run이 이 모양으로 부른다 — 방 배관 에이전트가 Run.js에서 호출한다):
//   QuestLog.reset(floorNo)            새 층이 시작됐다 (받은 퀘스트·진행을 비운다)
//   QuestLog.save() → JSON / QuestLog.load(data)   저장·이어하기
//   QuestLog.onRoomStart(run)          전투방(battle·elite·boss)에 들어갔다 (적이 놓인 직후)
//   QuestLog.onRoomCleared(run)        전투방의 적을 모두 쓰러뜨렸다 (우두머리 방이면 run.node.type === "boss")
// 퀘스트 진행은 이벤트(GameEvent.CARD_USED · DAMAGED · KILLED …)를 스스로 구독해서 센다.
class QuestLog {
    static reset(floorNo) {}

    static save() {
        return null;
    }

    static load(data) {}

    static onRoomStart(run) {}

    static onRoomCleared(run) {}
}

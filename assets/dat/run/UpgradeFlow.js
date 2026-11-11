// 카드 강화 흐름 (모닥불·제단·퀘스트 보상·상인이 같이 쓴다). 담당: UpgradeFlow 에이전트가 채운다.
// 강화 색: red 붉은 · blue 푸른 · yellow 노란 (쉬움), green 초록 · purple 보라 (어려움).
// 계약 (다른 코드가 이 모양으로 부른다):
//   UpgradeFlow.COLORS[key] = { name: "붉은", css: "#e8584a", hard: false }
//   UpgradeFlow.EASY = ["red","blue","yellow"], UpgradeFlow.HARD = ["green","purple"]
//   UpgradeFlow.candidates(player, colors = null) → 그 색(null이면 아무 색) 강화를 지금 받을 수 있는 행동 카드들 (Card[])
//   UpgradeFlow.open({ colors = null, title = "강화", onDone = null })
//       Game.player / Game.deckView로 카드를 고르게 하고(색 제한), 한 카드에 갈래가 여럿이면 강화 하나를 고르게 한 뒤 그 자리에서 바꾼다.
//       바꿨으면 onDone(바뀐 Card), 취소하거나 후보가 없으면 onDone(null). 부르는 쪽은 onDone(card)일 때만 값·기회를 쓴다.
class UpgradeFlow {
    static COLORS = {
        red: { name: "붉은", css: "#e8584a", hard: false },
        blue: { name: "푸른", css: "#58a0f0", hard: false },
        yellow: { name: "노란", css: "#f0d040", hard: false },
        green: { name: "초록", css: "#5cc86c", hard: true },
        purple: { name: "보라", css: "#b078e0", hard: true }
    };
    static EASY = ["red", "blue", "yellow"];
    static HARD = ["green", "purple"];

    static candidates() {
        return [];
    }

    static open(options = {}) {
        MessageLog.add("강화 (아직 준비 중)", "#c8b890");
        if (options.onDone) options.onDone(null);
    }
}

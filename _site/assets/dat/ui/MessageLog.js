// 화면 왼쪽 위에 보이는 최근 메시지
class MessageLog {
    static lines = [];
    static max = 6; // 들고 있는 줄 수. 화면에 몇 줄 보일지는 설정 (logLines)
    static version = 0;

    static add(text, color = "#e8d9b8") {
        text = String(text ?? "").replace(/\[\[(\w+):([^\]]*)\]\]/g, "$2"); // 카드 설명의 색 표시는 벗긴다
        MessageLog.lines.push({ text, color });
        if (MessageLog.lines.length > MessageLog.max) MessageLog.lines.shift();
        MessageLog.version++;
    }
}

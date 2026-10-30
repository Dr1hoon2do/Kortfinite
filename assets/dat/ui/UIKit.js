// 게임 UI를 만들 때 자주 쓰는 조각들. 엔진 UI(RectTransform, UIRect, UIText, UIButton)를 조합한다.
class UIKit {
    static COLORS = {
        panel: "rgba(18, 13, 10, 0.92)",
        border: "#5a4a3a",
        gold: "#e8b840",
        text: "#e8d9b8",
        dim: "#a89878",
        faint: "#6a5a48",
        button: "#3a332d",
        buttonOn: "#6a5a48",
        buttonOff: "#2a231e"
    };

    // 글자 버튼: 바탕 UIRect + UIButton + 가운데 글자. { go, rt, rect, text }
    static button(parentRT, name, label, onTap, options = {}) {
        const go = parentRT.createChild(name);
        const rect = go.addComponent(new UIRect({ color: UIKit.COLORS.button, borderColor: UIKit.COLORS.border, borderWidth: 1 }));
        const ui = go.addComponent(new UIButton({ onTap }));
        const t = go.getComponent(RectTransform).createChild("label");
        t.getComponent(RectTransform).setAnchor(0, 0, 1, 1);
        const text = t.addComponent(new UIText(label, { fontSize: options.fontSize ?? 12, color: UIKit.COLORS.text }));
        return { go, rt: go.getComponent(RectTransform), rect, text, ui };
    }

    // 버튼을 켜고 끈 모양으로 (누를 수 없을 때 흐리게, 눌러도 반응 없음)
    static setEnabled(button, enabled) {
        button.text.color = enabled ? UIKit.COLORS.text : UIKit.COLORS.faint;
        button.ui.enabled = enabled;
    }

    // 글자 (부모 왼쪽 위 기준 x, y, w, h. w가 null이면 오른쪽 여백 x까지 꽉 차게)
    static label(parentRT, name, text, x, y, w, h, options = {}) {
        const go = parentRT.createChild(name);
        UIKit.place(go, x, y, w, h);
        return go.addComponent(new UIText(text, { fontSize: 12, color: UIKit.COLORS.text, align: "left", verticalAlign: "top", ...options }));
    }

    // 부모 왼쪽 위 기준으로 x, y, w, h (UI 단위). w가 null이면 좌우 여백 x로 꽉 차게
    static place(go, x, y, w, h) {
        const rt = go.getComponent(RectTransform);
        if (w === null) {
            rt.setAnchor(0, 0, 1, 0);
            rt.setOffsets(x, y, x, -(y + h));
        } else {
            rt.setAnchor(0, 0, 0, 0);
            rt.setOffsets(x, y, -(x + w), -(y + h));
        }
        return rt;
    }

    // 카드 그림 하나 (시트의 16x16 칸)
    static icon(parentRT, name, def, x, y, size) {
        const go = parentRT.createChild(name);
        UIKit.place(go, x, y, size, size);
        go.addComponent(new UIRect({ color: "#3a332d", borderColor: "#1e1610", borderWidth: 1 }));
        go.addComponent(new UIImage(Resource.image(def.sprite), { region: { x: def.frame * 16, y: 0, width: 16, height: 16 } }));
        return go;
    }

    // 점 위치가 사각형 안인가 (화면 좌표)
    // p: 포인터 좌표 (CSS px). pixelRatio는 엔진이 맞춘다
    // 창이 열릴 때 살짝 나타나게 (그룹 투명도 0 → 1). 누르기는 바로 된다
    static fadeIn(go, duration = 0.12) {
        const rt = go.getComponent(RectTransform);
        if (!rt) return;
        Tween.killTweensOf(rt);
        rt.alpha = 0;
        Tween.to(rt, { alpha: 1 }, duration, { ease: "outQuad", unscaled: true, owner: go });
    }

    static contains(rt, p) {
        return rt.containsPoint(p.x, p.y);
    }
}

// 끌어서 옮기는 UI (창 손잡이). onMove(dx, dy): UI 단위 이동량. 살짝 누르기만 하면 onTap
class UIDrag extends UIElement {
    constructor(options = {}) {
        super();
        this.onMove = options.onMove ?? null;
        this.onTap = options.onTap ?? null;
        this._last = null;
        this._moved = 0;
    }

    onPointerDown(pointer) {
        this._last = pointer.position.clone();
        this._moved = 0;
    }

    onDrag(pointer) {
        if (!this._last) return;
        const rt = this.getComponent(RectTransform);
        const k = Input.pixelRatio / (rt && rt.uiRoot ? rt.uiRoot.scale : 1);
        const dx = (pointer.position.x - this._last.x) * k;
        const dy = (pointer.position.y - this._last.y) * k;
        this._last = pointer.position.clone();
        this._moved += Math.abs(dx) + Math.abs(dy);
        if (this.onMove && (dx || dy)) this.onMove(dx, dy);
    }

    onPointerUp() {
        this._last = null;
    }

    onClick() {
        if (this._moved < 6 && this.onTap) this.onTap();
    }
}

// UI 층 (최상위 UI의 RectTransform.sortOrder). 큰 값이 위에 그려지고 먼저 눌린다
const UILayer = {
    HUD: 0,        // 체력바, 메시지, 오른쪽 위 버튼, 디버그 / 버튼
    HAND: 10,      // 아래 패와 그 위 설명 칸
    TARGET: 20,    // 칸 지정 안내줄, [보상 받기] 버튼
    PANEL: 50,     // 오른쪽 패널 (상태)
    MODAL: 100     // 화면을 막는 창. 열 때마다 1씩 올라가서 나중에 연 창이 위에 온다
};

// 화면을 막는 창(대화, 거래, 메뉴)이 떠 있는지. 떠 있는 동안 플레이어는 움직이지 않는다.
// 창은 화면 전체를 덮는 반투명 막 + 가운데 상자로 만든다. 막을 누르면 닫힌다 (onBackdrop).
class Modal {
    static openCount = 0;
    static seq = 0; // 연 순서 (나중에 연 창이 위)

    static get isOpen() {
        return Modal.openCount > 0;
    }

    // engine.createUI로 막과 상자를 만든다. 반환: { root, box(RectTransform) }
    static create(engine, name, width, height, onBackdrop) {
        const root = engine.createUI(name);
        const rrt = root.getComponent(RectTransform);
        rrt.setAnchor(0, 0, 1, 1);
        rrt.setOffsets(0, 0, 0, 0);
        root.addComponent(new UIRect({ color: "rgba(0, 0, 0, 0.45)" }));
        root.addComponent(new UIButton({ onTap: () => onBackdrop && onBackdrop() }));

        const box = rrt.createChild("box");
        const brt = box.getComponent(RectTransform);
        brt.setAnchor(0.5, 0.5, 0.5, 0.5);
        brt.setSizeAndPosition(width, height, 0, 0);
        box.addComponent(new UIRect({ color: UIKit.COLORS.panel, borderColor: UIKit.COLORS.gold, borderWidth: 1 }));
        box.addComponent(new UIElement()); // 상자 안을 눌러도 막으로 새지 않게
        root.setActive(false);
        return { root, box: brt };
    }

    // 상자 크기를 화면에 맞춘다 (UI 단위)
    static fit(engine, boxRT, width, height, margin = 12) {
        const scale = engine.uiRoot.scale;
        const w = Math.min(width, engine.width / scale - margin * 2);
        const h = Math.min(height, engine.height / scale - margin * 2);
        boxRT.setSizeAndPosition(w, h, 0, 0);
        return { width: w, height: h };
    }

    static show(go, value) {
        if (go.isActive === value) return;
        if (value) go.getComponent(RectTransform).sortOrder = UILayer.MODAL + ++Modal.seq;
        go.setActive(value);
        Modal.openCount += value ? 1 : -1;
        if (value) UIKit.fadeIn(go);
    }
}

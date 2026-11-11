// 바닥 물건 곁에 가면 그 물건 정보를 보여 주는 칸. 담당: 정보 칸 에이전트가 채운다.
// 계약: new PickupInfo({ engine, player, world, run }) — 컴포넌트, 매 프레임 플레이어 바로 옆(상하좌우)의 Pickup(entity/Pickups.js)을 찾아 보여 준다.
class PickupInfo extends Component {
    constructor(options) {
        super();
        this.engine = options.engine;
        this.player = options.player;
        this.run = options.run;
    }
}

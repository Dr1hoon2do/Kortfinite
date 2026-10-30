# assets/dat — 게임 스크립트

Kortfinite는 덱빌딩 턴제 그리드 로그라이크다. 지도(그물망)에서 방을 골라 15층을 내려가 우두머리를 쓰러뜨린다.
방은 입구 → 공간 → 출구이고, 방 안에서 **카드로** 움직이고 싸운다. 플레이어의 모든 행동은 카드다.

모든 클래스는 전역이다. 불러오는 순서는 `assets/main.js`의 `Load.Scripts` 목록이 정한다. 새 파일을 만들면 그 목록에 경로를 추가한다.

## 데이터와 코드의 분리

카드·적·재료·태그의 **내용**은 카드 공방(Kortfinite-Workshop)에서 짜고, **동작**은 코드에 짠다.

```
카드 공방 ──내보내기(data.json)──▶ tools/import_data.py ──▶ data/GameData.js   (이름·비용·설명·태그·강화·스탯·드랍)
                                                            data/CardImpl.js    (CARDS[id] 카드 동작, VARIANTS[id][key] 강화 동작)
                                                            data/EnemyImpl.js   (EnemyMoves.SPECS[id] 적 행동)
```

- `GameContent.load()`가 GameData의 카드를 `CardDef`로 등록한다. 동작(`CARDS[id]`)이 없는 카드는 경고만 하고 건너뛴다.
- 설명글의 "공격력 60%" 같은 말은 `GameContent.render`가 지금 능력치로 바꿔 숫자를 보여 준다.
- 새 카드/적이 데이터에 생기면 `python3 tools/import_data.py 내보낸파일.json`이 동작이 없는 id를 알려 준다.
- `DATA.md`는 GameData에서 자동으로 만든 표다 (`python3 tools/gen_data_md.py`).
- `kind: "basic"` 카드는 시작 덱(3장씩), `reward`는 보상·상점 풀, 강화(upgrades)는 모닥불에서 재료를 내고 바꾼다.
- 한 카드에 비용 종류가 여럿 적혀 있으면 **그중 하나**를 카드 한 장마다 정해 낸다 (`Card.cost`, `data.pay`). 모닥불에서 다시 굴릴 수 있다.

## 폴더

| 폴더 | 무엇 | 파일 |
| --- | --- | --- |
| `system/` | 도우미, 게임 이벤트 이름, 저장, 설정, 시작 화면, 디버그 명령 | Text(조사 `josa`), GameEvents, SaveSystem(`RunStore`), Settings, TitleScreen, DebugConsole |
| `data/` | 공방 데이터와 그 동작 | GameData, CardImpl(`CardOps`·`CARDS`·`VARIANTS`·`GameContent`), EnemyImpl(`EnemyMoves.SPECS`) |
| `run/` | 런: 지도·방·보상 | RunMap(그물망 지도, `Rng`), RoomGen(`RoomPlan` 방 설계도, `Rewards`), Run(방 들어가기·나가기·정리·저장·카메라) |
| `world/` | 방의 타일·청크, 그리기, 길찾기 | TileDef, Chunk, ChunkManager, ChunkRenderer, Pathfinder |
| `entity/` | 방 안에 있는 것 | Entity, Stats, AI, EnemyAI(적 의도·`EnemyMoves`·`IntentOverlay`), EntityOverlay, Props(입구·출구·모닥불·상자), Monster, Allies(소환수·설치물), Merchant |
| `player/` | 플레이어 | Player |
| `rules/` | 턴, 전투, 상태 이상, 연출 | TurnManager, Combat, Status, Animation |
| `card/` | 카드 체계 | CardText, CardDef, CardEffects, Card(`Card`·`CardSystem`: 행동 패/인벤토리 패/덱/묘지), CardKit, Gear(장비), Spell(주문), Gem(젬), DrawRule |
| `card/defs/` | 카드가 같이 쓰는 도우미 | ActionCards(이동·줄 계산) |
| `ui/` | HUD, 공통 부품, 입력 | UIKit, SidePanel, CardView, CardInspector, PlayerHud, MessageLog, HandBar, MapScreen, WorldInput, TileTargeting |
| `ui/panel/` | 오른쪽 위 버튼으로 여는 창 | StatusPanel |
| `ui/dialog/` | 화면 가운데 뜨는 창 | RewardDialog, ShopDialog, RestDialog, DeckViewer, GemDialog, EndScreen, Codex |

## 규칙 요약

- **턴**: 카드 쓰기·상호작용·적 없는 방에서 걷기는 턴이 안 든다. 뽑기(덱에서 1장)와 대기만 1턴. 턴이 지나면 적이 한 번씩 행동하고, 기력이 가득 차며, 방어도·쉼이 1 줄어든다 (`rules/TurnManager.js`).
- **적의 의도**: 적은 턴이 끝날 때 다음 턴에 할 일(`intent`)을 정해 머리 위에 보여 준다. 맞는 칸은 `IntentOverlay`가 땅에 그린다.
- **피해**: 공격력(또는 방어력) × %. 방어력은 피해를 줄이지 않는다. 방어도만 피해를 막는다 (`rules/Combat.js`).
- **시드**: 모든 무작위는 런 시드에서 나온다. 방 안 무작위는 `room.rng`, 덱 섞기는 `player.cards.rng`. `Math.random` 대신 이것을 쓴다.
- **장비**: 부위(slot)마다 한 장. 장착하면 능력치가 오르고, `grants`의 행동 카드가 덱에 섞여 들어온다. 해제하면 빠졌다가 다시 장착하면 있던 자리로 돌아온다 (`card/Gear.js`).
- **주문·젬**: `Spell`·`Gem` 체계는 코드에 있으나 지금 공방 데이터에는 주문 카드가 없다.

## 어디를 고치면 되는지

| 하고 싶은 일 | 어디 |
| --- | --- |
| 카드 동작·강화 동작 | `data/CardImpl.js` — `CARDS[id]`, `VARIANTS[id][key]`. 보조 함수는 `CardOps` |
| 적 행동 | `data/EnemyImpl.js` — `EnemyMoves.SPECS[id]`(`rotations`+`actions` 또는 `brain`). 새 의도 종류는 `entity/EnemyAI.js` |
| 상태 이상 종류·수치 | `rules/Status.js`의 `Status.DEFS`, 피해 보정 `Status.modify` |
| 지도 모양·방 비율 | `run/RunMap.js` (`ROWS`, `WIDTH`, `BRANCH`, `FIXED`, `FAIR`, `TYPES`) |
| 방 크기·층별 무리·정예·우두머리 | `run/RoomGen.js` (`RoomPlan.STYLE`, `BUDGET`, `MAX_ENEMIES`) |
| 보상·상점 값 | `run/RoomGen.js`의 `Rewards`, `run/Run.js`의 `REMOVE_BASE` |
| 시작 덱·패 크기 | `GameContent.load`가 `basic` 카드로 정함, 패 크기 `CardSystem.ACTION_HAND`·`INV_HAND` |
| 기본 능력치 | `player/Player.js` 위쪽 상수 |
| 소환수 | `entity/Allies.js`의 `Ally.KINDS` |
| 방 안 상호작용 물건 | `entity/Props.js`에 `Prop` 상속 + `interact(ctx)` + `EntityTypes.register` |
| 카드 설명글 색·용어 풀이 | `card/CardText.js` (`[[키:글자]]`, `TERMS`는 데이터 태그 설명에서 만든다) |
| 저장 형식 | 바꾸면 `system/SaveSystem.js`의 `RunStore.VERSION`을 올린다 (다른 형식은 지워진다) |
| 디버그 명령 | `system/DebugConsole.js`의 `DebugConsole.register(이름, { args, help, run })` |

## 게임 이벤트

엔진의 전역 버스 `Events`로 알린다. 이름은 `system/GameEvents.js`의 `GameEvent`.

`KILLED` 처치 · `DAMAGED` 피해 · `PLAYER_DIED` · `TURN_END` · `CARD_USED` · `ROOM_ENTERED` · `ROOM_CLEARED` · `RUN_ENDED`

새 기능(업적, 통계, 유물형 장비 등)은 알리는 곳을 고치지 말고 듣는 쪽만 추가한다.

## 엔진 도구

자세한 건 `KuntoGame/API.md`. `Tween.to`, `ParticleSystem.emit`, `RectTransform.alpha`/`UIKit.fadeIn`, `Camera.main.shake`, `Debug.set`(F3).

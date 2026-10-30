async function main() {
  Load.assetBasePath = "assets/images/";
  await Load.Images([
    ["player", "entities/player.png"],
    ["rat", "entities/rat.png"],
    ["wolf", "entities/wolf.png"],
    ["spider", "entities/spider.png"],
    ["slime", "entities/slime.png"],
    ["skeleton", "entities/skeleton.png"],
    ["goblin", "entities/goblin.png"],
    ["ogre", "entities/ogre.png"],
    ["stone_golem", "entities/stone_golem.png"],
    ["mini_stone_golem", "entities/mini_stone_golem.png"],
    ["villager_merchant", "entities/villager_merchant.png"],
    ["chest", "entities/chest.png"],
    ["campfire", "entities/campfire.png"],
    ["stairs_down", "entities/stairs_down.png"],
    ["exit_locked", "entities/exit_locked.png"],
    ["ladder_up", "entities/ladder_up.png"],
    ["dungeon_floor", "tiles/dungeon_floor.png"],
    ["dungeon_wall", "tiles/dungeon_wall.png"],
    ["cave_floor", "tiles/cave_floor.png"],
    ["cave_wall", "tiles/cave_wall.png"],
    ["planks", "tiles/planks.png"],
    ["grass", "tiles/grass.png"],
    ["buttons", "ui/buttons.png"],
    ["map_icons", "ui/map_icons.png"],
    ["turret", "entities/turret.png"],
    ["totem", "entities/totem.png"],
    ["scarecrow", "entities/scarecrow.png"],
    ["barrier", "entities/barrier.png"],
    ["mine", "entities/mine.png"],
    ["field", "entities/field.png"],
    ["card_glyphs", "card_glyphs.png"],
    ["cards", "cards.png"]
  ]);
  console.log("Images Loaded");
  Load.basePath = "assets/dat/";
  await Load.Scripts([
                      // system: 어디서나 쓰는 도우미
                      "system/Text.js", "system/GameEvents.js", "ui/MessageLog.js",
                      // world: 타일·청크 (엔티티보다 먼저)
                      "world/TileDef.js", "world/Chunk.js",
                      "entity/Entity.js", "world/ChunkManager.js", "world/ChunkRenderer.js", "world/Pathfinder.js",
                      // rules: 연출·턴·전투
                      "rules/Animation.js", "rules/TurnManager.js",
                      "entity/Stats.js", "entity/AI.js", "rules/Combat.js", "rules/Status.js", "entity/EntityOverlay.js",
                      // entity: 방 안의 것들
                      "entity/Props.js", "entity/EnemyAI.js", "entity/Monster.js", "entity/Allies.js", "entity/Merchant.js",
                      // card: 정의 체계 → 효과 → 카드 정의들 → 체계별 등록 (장비·주문·젬)
                      "card/CardText.js", "card/CardDef.js", "card/CardEffects.js", "card/defs/ActionCards.js", "card/Card.js", "card/CardKit.js",
                      "card/Gear.js", "card/Spell.js", "card/Gem.js", "card/DrawRule.js",
                      // data: 카드 공방에서 내보낸 카드·적 (GameData) + 그 동작 (CardImpl · EnemyImpl)
                      "data/GameData.js", "data/CardImpl.js", "data/EquipImpl.js", "data/EnemyImpl.js",
                      // run: 지도 · 방 · 런
                      "run/RunMap.js", "run/RoomGen.js", "run/Run.js",
                      // ui
                      "ui/UIKit.js", "ui/CardView.js", "ui/CardInspector.js", "ui/SidePanel.js", "ui/panel/StatusPanel.js",
                      "ui/TileTargeting.js", "ui/WorldInput.js", "ui/PlayerHud.js", "ui/HandBar.js", "ui/MapScreen.js",
                      "ui/dialog/GemDialog.js", "ui/dialog/DeckViewer.js", "ui/dialog/RewardDialog.js", "ui/dialog/ShopDialog.js",
                      "ui/dialog/RestDialog.js", "ui/dialog/EquipDialog.js", "ui/dialog/EndScreen.js", "ui/dialog/Codex.js",
                      // system
                      "system/Settings.js", "system/SaveSystem.js", "system/TitleScreen.js", "system/DebugConsole.js",
                      // player
                      "player/Player.js"]);
  console.log("Scripts Loaded");
  GameContent.load(); // 공방 카드 등록
  EquipContent.load();  // 공방 장비 등록 (아이콘 시트에 같이 들어간다)
  EnemyData.load();   // 공방 적 등록
  CardKit.buildIcons(); // 카드 아이콘 시트 "kicons"
  Debug.opacity = Settings.get("debugAlpha"); // 시작 화면부터 설정대로 (기본 0%: 숨김)

  const App = new Engine({ canvas: "#game" });
  App.camera.zoom = 1;
  App.start();
  window.App = App;
  console.log("started");

  // 시작 화면: 이어하기 / 새 런
  const title = new GameObject("title");
  title.addComponent(new TitleScreen({ engine: App, onPlay: (meta) => startGame(App, meta) }));
  App.add(title);
}

// 오른쪽 위 둥근 버튼 하나 (slot: 오른쪽부터 0, 1, 2 …, icon: buttons.png 칸)
function cornerButton(App, name, slot, icon, onTap, action = null) {
  const size = SidePanel.BUTTON;
  const go = App.createUI(name);
  const rt = go.getComponent(RectTransform);
  rt.setAnchor(1, 0, 1, 0);
  const p = SidePanel.buttonPos(App, slot);
  rt.setSizeAndPosition(size, size, p.x, p.y);
  go.addComponent(new UIImage(Resource.image("buttons"), { region: { x: icon * 16, y: 0, width: 16, height: 16 } }));
  go.addComponent(new UIButton({ onTap, action, pressedRegion: { x: icon * 16, y: 16, width: 16, height: 16 } }));
  return go;
}

// meta: { seed, debug, save }
function startGame(App, meta) {
  MessageLog.lines = [];

  // 행동 패 4장 · 인벤토리 패 4장 (장비로 늘어난다). 새 런은 시작 덱(기본이동 3, 기본공격 3)을 덱에 든다
  const player = new Player(0, 0, { cards: { rules: [] } });
  if (!meta.save) player.cards.giveStarter();
  const playerObject = new GameObject("player");
  playerObject.addComponent(player);
  App.add(playerObject);

  const queue = new AnimQueue();
  const follow = App.camera.gameObject.addComponent(new CameraFollow({ target: player.transform, follow: false }));

  // 런: 지도 · 방 · 저장
  const run = new Run({ engine: App, player, queue, follow, meta, save: meta.save });
  const runObject = new GameObject("run");
  runObject.addComponent(run);
  App.add(runObject);
  const world = run.view; // 지금 방으로 이어지는 창구. 아래 모든 world는 이것

  const turns = new TurnManager({ world, player, queue, run });
  const turnObject = new GameObject("turns");
  turnObject.addComponent(queue);
  turnObject.addComponent(turns);
  App.add(turnObject);

  Input.dragThreshold = 10;
  Settings.on("animSpeed", (v) => (queue.speed = v));
  Settings.on("shake", (v) => (Camera.shakeEnabled = v));
  Settings.on("debugAlpha", (v) => (Debug.opacity = v));
  Debug.corner = "top-right";
  Debug.offset = { x: 8, y: 64 };
  Events.on(GameEvent.TURN_END, ({ turn }) => {
    if (!Debug.enabled) return;
    Debug.set("턴", turn);
    Debug.set("방", run.node ? run.node.id : "-");
    Debug.set("엔티티", run.room ? run.room.actors.size : 0);
  }, { owner: turns });

  // 적의 예고 (다음 턴에 맞는 칸)를 땅에 그린다
  const intents = new GameObject("intents");
  intents.addComponent(new IntentOverlay(run));
  App.add(intents);
  // 장판 (독·화상 바닥)
  const fields = new GameObject("fields");
  fields.addComponent(new HazardOverlay(run));
  App.add(fields);

  const ui = new GameObject("ui");
  const targeting = ui.addComponent(new TileTargeting({ engine: App, world, player }));
  ui.addComponent(new PlayerHud({ engine: App, player, world, run }));
  ui.addComponent(new WorldInput({ engine: App, world, player, camera: follow, targeting, run, minZoom: 0.5 }));
  const gems = ui.addComponent(new GemDialog({ engine: App, player }));
  const deckView = ui.addComponent(new DeckViewer({ engine: App, player, gems }));
  CardPicker.viewer = deckView;
  const hand = ui.addComponent(new HandBar({ engine: App, player, world, targeting, gems, deckView }));
  ui.addComponent(new StatusPanel({ engine: App, player, turns, run }));
  // 오른쪽 위 버튼 (왼쪽부터): 내 카드 · 상태 · 지도 · 메뉴
  cornerButton(App, "mapToggle", 1, 15, () => run.ui.map.toggleView());
  Input.defineButton("deck", ["KeyD"]);
  cornerButton(App, "deckToggle", 3, 4, () => deckView.openOwned());
  ui.addComponent(new SettingsPanel({
    engine: App, slot: 0, seed: run.seed,
    onExit: () => location.reload()
  }));
  const reward = ui.addComponent(new RewardDialog({ engine: App, player }));
  const shop = ui.addComponent(new ShopDialog({ engine: App, player, run, deckView }));
  const rest = ui.addComponent(new RestDialog({ engine: App, player, deckView }));
  const equip = ui.addComponent(new EquipDialog({ engine: App, player }));
  const map = ui.addComponent(new MapScreen({ engine: App, run, deckView, equipDialog: equip }));
  const end = ui.addComponent(new EndScreen({ engine: App, player }));
  ui.addComponent(new CardInspector({ engine: App }));
  // 디버그 명령 (새 런을 만들 때 켠 런만): "/" 키나 오른쪽 가운데 버튼
  const debugConsole = meta.debug ? ui.addComponent(new DebugConsole({ engine: App, player, world, run, turns })) : null;
  // 덱 보기 키 (D)
  ui.addComponent(new (class extends Component {
    update() {
      if (Input.getButtonDown("deck") && !Modal.isOpen) deckView.openOwned();
    }
  })());
  App.add(ui);
  run.ui = { map, reward, shop, rest, end };

  window.Game = { run, world, player, turns, queue, targeting, hand, deckView, gems, reward, shop, rest, equip, map, end, debugConsole, follow, meta };
  MessageLog.add(meta.save ? "이어서 한다" : "새 런을 시작한다. 지도에서 첫 방을 고르자", "#e8b840");
  MessageLog.add("카드를 써서 움직이고 싸운다 (쓰기는 턴이 안 든다). 뽑기·대기만 1턴", "#c8b890");
  // UI가 다 만들어진 다음 프레임에 Run이 시작한다 (지도를 열거나, 못 끝낸 방으로)
}

main();

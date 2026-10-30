# Kortfinite

KuntoGame(HTML canvas2d 게임 라이브러리) 위에서 만드는 턴제 그리드 전투 덱빌딩 로그라이크.

- 실행: 정적 파일이라 `index.html`을 웹 서버로 열면 된다 (예: `python3 -m http.server`).
- `KuntoGame/` — 엔진 (`KuntoGame/API.md`)
- `assets/dat/` — 게임 스크립트 (`assets/dat/README.md`)
- `DATA.md` — 카드·적·재료·태그 데이터 표 (자동 생성)
- `tools/import_data.py` — 카드 공방 내보내기 → `GameData.js`
- `tools/gen_data_md.py` — `GameData.js` → `DATA.md`

카드·적 데이터는 [Kortfinite-Workshop](https://github.com/dr1hoon2do/kortfinite-workshop)에서 짠다.

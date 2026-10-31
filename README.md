# Kortfinite

KuntoGame(HTML canvas2d 게임 라이브러리) 위에서 만드는 턴제 그리드 전투 덱빌딩 로그라이크.

- 실행: 정적 파일이라 `index.html`(또는 같은 내용의 `gamepage.html`)을 웹 서버로 열면 된다 (예: `python3 -m http.server`). 스크립트를 하나씩 불러오는 판이라 고치면서 보기 좋다.
- 배포(GitHub Pages): `tools/build_bundle.py`가 스크립트 94개와 이미지를 `index.html` 하나로 묶어서 올린다 (요청 1번으로 뜬다). 원본은 배포 주소의 `/gamepage.html`에서 그대로 볼 수 있다.
- `KuntoGame/` — 엔진 (`KuntoGame/API.md`)
- `assets/dat/` — 게임 스크립트 (`assets/dat/README.md`)
- `DATA.md` — 카드·적·재료·태그 데이터 표 (자동 생성)
- `tools/import_data.py` — 카드 공방 내보내기 → `GameData.js`
- `tools/gen_data_md.py` — `GameData.js` → `DATA.md`

카드·적 데이터는 [Kortfinite-Workshop](https://github.com/dr1hoon2do/kortfinite-workshop)에서 짠다.

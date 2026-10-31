#!/usr/bin/env python3
"""게임을 파일 하나로 묶는다 (GitHub Pages 배포용).
index.html의 스크립트 로더(init.js)가 하던 일 — 엔진 파일, 게임 스크립트, 이미지를 하나씩 불러오는 것 — 을
미리 해 두어서, 요청 하나로 게임이 뜬다. 스크립트는 한 <script>에 순서대로 붙이고 이미지는 data: 주소로 넣는다.

쓰는 법: python3 tools/build_bundle.py [나갈 폴더=_site]
  나갈 폴더/index.html    — 묶음 (이게 게임 주소의 첫 화면)
  나갈 폴더/gamepage.html — 원본 (로더로 파일을 하나씩 불러온다. 디버그·비교용) + KuntoGame/ assets/
원본 index.html·gamepage.html은 그대로 두고, 나갈 폴더만 만든다."""
import base64, mimetypes, pathlib, re, shutil, sys

root = pathlib.Path(__file__).resolve().parent.parent
out = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "_site")
if not out.is_absolute():
    out = root / out
read = lambda p: (root / p).read_text(encoding="utf-8")

# 1) 불러오는 순서: init.js의 엔진 목록, main.js의 게임 스크립트 목록
init = read("KuntoGame/init.js")
engine = re.findall(r"'([\w/]+\.js)'", re.search(r"const ENGINE_FILES = \[(.*?)\];", init, re.S).group(1))
main_js = read("assets/main.js")
scripts_block = re.search(r"await Load\.Scripts\(\[(.*?)\]\);", main_js, re.S)
game = re.findall(r'"([\w/]+\.js)"', scripts_block.group(1))
files = [("KuntoGame/core/Load.js", read("KuntoGame/core/Load.js")), ("KuntoGame/config.js", read("KuntoGame/config.js"))]
files += [("KuntoGame/" + f, read("KuntoGame/" + f)) for f in engine]
files += [("assets/dat/" + f, read("assets/dat/" + f)) for f in game]
# main.js: 스크립트를 불러오는 부분은 이미 합쳤으니 뺀다
files.append(("assets/main.js", main_js.replace(scripts_block.group(0), "/* 스크립트는 build_bundle.py가 이미 합쳤다 */")))

# 2) 이미지: Load.Images([[키, 경로]])의 파일을 data: 주소로
images = {}
for rel in re.findall(r'\["\w+", "([\w/]+\.png)"\]', main_js):
    p = root / "assets/images" / rel
    images["assets/images/" + rel] = "data:image/png;base64," + base64.b64encode(p.read_bytes()).decode()
assets_js = "window.__ASSETS = " + "{" + ",".join('"%s":"%s"' % kv for kv in images.items()) + "};\n" \
    "(function () { const orig = Load._resolve; Load._resolve = (p, b) => { const f = orig(p, b); return window.__ASSETS[f] || f; }; })();\n"
# Load.js 바로 뒤에 넣는다 (이미지를 불러오기 전이면 된다)
files.insert(1, ("(이미지)", assets_js))

bundle = "\n".join(f"/* ===== {name} ===== */\n{src}" for name, src in files).replace("</script", "<\\/script")

# 3) index.html: 로더 줄을 묶음으로 바꾼다
page = read("index.html")
loader = re.search(r"[ \t]*<!--[^>]*-->\n[ \t]*<script>window\.BUILD_ID.*?</script>\n[ \t]*<script src=\"KuntoGame/init\.js[^\"]*\"></script>", page, re.S)
assert loader, "index.html에서 로더 줄을 못 찾았다"
page = page.replace(loader.group(0), "  <script>\n" + bundle + "\n  </script>").replace("<title>Pen</title>", "<title>Kortfinite</title>")

if out.exists():
    shutil.rmtree(out)
out.mkdir(parents=True)
(out / "index.html").write_text(page, encoding="utf-8")
shutil.copy(root / "gamepage.html", out / "gamepage.html")
shutil.copytree(root / "KuntoGame", out / "KuntoGame")
shutil.copytree(root / "assets", out / "assets")
(out / ".nojekyll").write_text("")
print("묶음 %s: 스크립트 %d개 + 이미지 %d장 → index.html %.0f KB" % (out, len(files) - 1, len(images), len(page.encode()) / 1024))

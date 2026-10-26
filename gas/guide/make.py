# ガイドのページに、貼り付けるファイルの中身を入れる（JSONにして、</script で切れないようにする）
import json, pathlib
d = pathlib.Path(__file__).parent
dist = d.parent / "dist"
t = (d / "template.html").read_text()
files = {n: (dist / f).read_text() for n, f in [("Code","Code.gs"),("Index","Index.html"),("App1","App1.html"),("App2","App2.html")]}
blob = json.dumps(files, ensure_ascii=False).replace("</", "<\\/")
out = t.replace("__FILES__", '<script type="application/json" id="files">' + blob + '</script>')
(d / "guide.html").write_text(out)
print(len(out.encode()))

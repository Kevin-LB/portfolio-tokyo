"""
Sous-ensemble de Zen Kaku Gothic New : seulement les caractères que le site
utilise (enseignes, distributeurs, étages, japonais de l'interface), plus
l'ASCII. Résultat : deux petits WOFF2 dans public/fonts/ au lieu de centaines
de sous-ensembles Unicode.

À relancer après avoir ajouté du japonais dans le code :
    python3 -m venv .venv && .venv/bin/pip install fonttools brotli
    .venv/bin/python scripts/subset-jp.py <dossier des TTF sources>
Sources (licence OFL) : github.com/google/fonts, ofl/zenkakugothicnew.
"""
import pathlib, re, sys
from fontTools import subset

root = pathlib.Path(__file__).resolve().parent.parent
src_dir = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else root / ".fonts-src"
text = ""
for p in (root / "src").rglob("*.ts"):
    text += p.read_text(encoding="utf-8")
jp = set(ch for ch in text if re.match(r"[　-ヿ㐀-鿿＀-￯]", ch))
chars = "".join(sorted(jp)) + "".join(chr(c) for c in range(0x20, 0x7f)) + "·—’“”«»¥éèàçêÉÀ"
print(len(jp), "caractères japonais :", "".join(sorted(jp)))
for weight, name in ((700, "Bold"), (900, "Black")):
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = ["*"]
    opts.name_IDs = ["*"]
    font = subset.load_font(str(src_dir / f"ZenKakuGothicNew-{name}.ttf"), opts)
    s = subset.Subsetter(opts)
    s.populate(text=chars)
    s.subset(font)
    out = root / "public" / "fonts" / f"zen-kaku-gothic-new-{weight}-subset.woff2"
    subset.save_font(font, str(out), opts)
    print(out.name, out.stat().st_size, "octets")

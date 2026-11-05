#!/usr/bin/env python3
"""Builds docs/design/mock.html (self-contained: fonts inlined as base64).
Usage: python3 build-mock.py <fonts_dir_with_fontsource_extracts>"""
import base64, sys, pathlib
fd = pathlib.Path(sys.argv[1])
def f(pkg, name):
    p = next(fd.glob(f"fontsource-{pkg}-*/package/files/{name}.woff2"))
    return base64.b64encode(p.read_bytes()).decode()
faces = [
 ("Big Shoulders Display",800,"big-shoulders-display","big-shoulders-display-latin-800-normal"),
 ("Big Shoulders Display",600,"big-shoulders-display","big-shoulders-display-latin-600-normal"),
 ("Big Shoulders Stencil Display",800,"big-shoulders-stencil-display","big-shoulders-stencil-display-latin-800-normal"),
 ("Atkinson Hyperlegible Next",400,"atkinson-hyperlegible-next","atkinson-hyperlegible-next-latin-400-normal"),
 ("Atkinson Hyperlegible Next",600,"atkinson-hyperlegible-next","atkinson-hyperlegible-next-latin-600-normal"),
 ("Atkinson Hyperlegible Next",700,"atkinson-hyperlegible-next","atkinson-hyperlegible-next-latin-700-normal"),
 ("IBM Plex Mono",400,"ibm-plex-mono","ibm-plex-mono-latin-400-normal"),
 ("IBM Plex Mono",500,"ibm-plex-mono","ibm-plex-mono-latin-500-normal"),
]
css = "".join(f"@font-face{{font-family:'{n}';font-weight:{w};font-style:normal;font-display:swap;src:url(data:font/woff2;base64,{f(p,fn)}) format('woff2')}}\n" for n,w,p,fn in faces)
tpl = (pathlib.Path(__file__).parent/"mock.template.html").read_text()
out = tpl.replace("/*FONTS*/", css)
(pathlib.Path(__file__).parent.parent/"mock.html").write_text(out)
print("ok", len(out)//1024, "KB")

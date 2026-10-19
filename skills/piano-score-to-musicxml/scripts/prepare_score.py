#!/usr/bin/env python3
"""Rasterize every PDF/image page; no music recognition or network calls."""
import argparse
import hashlib
import json
from pathlib import Path

import pymupdf as fitz


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def prepare(inputs, output, dpi=220):
    output = Path(output).resolve()
    if (output / "manifest.json").exists():
        raise ValueError("manifest.json already exists; choose a new output directory")
    output.mkdir(parents=True, exist_ok=True)
    pages, sources = [], []
    for item in inputs:
        path = Path(item).resolve(strict=True)
        sources.append({"file": str(path), "sha256": sha(path)})
        with fitz.open(path) as doc:
            if doc.needs_pass:
                raise ValueError(f"Encrypted input requires an unlocked copy: {path.name}")
            for index in range(len(doc)):
                # Images opened by MuPDF become one-page documents too.
                pix = doc[index].get_pixmap(dpi=dpi, alpha=False)
                number = len(pages) + 1
                filename = f"page-{number:03d}.png"
                target = output / filename
                if target.exists():
                    raise ValueError(f"Refusing to overwrite {target}")
                pix.save(target)
                pages.append({"page": number, "file": filename, "sha256": sha(target),
                              "width": pix.width, "height": pix.height,
                              "source": len(sources), "sourcePage": index + 1})
    if not pages:
        raise ValueError("No pages in input")
    manifest = {"schema": "piano-score-pages/v1", "dpi": dpi,
                "sources": sources, "pages": pages}
    (output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("inputs", nargs="+", help="Ordered PDFs/images; never glob-sort page numbers lexically")
    parser.add_argument("--out", required=True)
    parser.add_argument("--dpi", type=int, default=220, choices=range(150, 401))
    args = parser.parse_args()
    result = prepare(args.inputs, args.out, args.dpi)
    print(json.dumps({"pages": len(result["pages"]), "manifest": str(Path(args.out).resolve() / "manifest.json")}, ensure_ascii=False))


if __name__ == "__main__":
    main()

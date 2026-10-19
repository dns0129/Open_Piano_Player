#!/usr/bin/env python3
"""Input handling tests; these do not measure visual recognition accuracy."""
import hashlib
import tempfile
import unittest
from pathlib import Path

import pymupdf as fitz
from prepare_score import prepare


class PreparePagesTest(unittest.TestCase):
    def test_all_pdf_pages_including_blank_and_explicit_image_order(self):
        with tempfile.TemporaryDirectory() as work:
            root = Path(work)
            pdf = root / "three-pages.pdf"
            with fitz.open() as doc:
                for index in range(3):
                    page = doc.new_page(width=300, height=400)
                    if index != 1:
                        page.insert_text((30, 30), f"Piano synthetic page {index + 1}")
                        for staff in range(2):
                            for line in range(5):
                                y = 100 + staff * 80 + line * 8
                                page.draw_line((30, y), (270, y))
                doc.save(pdf)
            pages = prepare([pdf], root / "pages", 150)
            self.assertEqual(len(pages["pages"]), 3)
            self.assertEqual([p["sourcePage"] for p in pages["pages"]], [1, 2, 3])
            for p in pages["pages"]:
                image = root / "pages" / p["file"]
                self.assertEqual(p["sha256"], hashlib.sha256(image.read_bytes()).hexdigest())
                self.assertEqual(p["width"], 625)
            with self.assertRaisesRegex(ValueError, "already exists"):
                prepare([pdf], root / "pages", 150)
            images = [root / "pages" / pages["pages"][i]["file"] for i in [2, 0]]
            ordered = prepare(images, root / "images", 150)
            self.assertEqual(len(ordered["pages"]), 2)
            self.assertEqual([s["file"] for s in ordered["sources"]], [str(i.resolve()) for i in images])


if __name__ == "__main__":
    unittest.main()

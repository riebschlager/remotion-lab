"""Regenerate the font fixtures used by the asset tests.

    python3 -m venv .venv && .venv/bin/pip install fonttools
    .venv/bin/python tests/fixtures/fonts/make-fonts.py

Each font holds one visible glyph, "A", drawn as a solid block from the
baseline to the top of the em square, so a rendered "A" is a rectangle whose
width can be measured in pixels.

  LabBlock-VF.ttf          "Lab Block", variable: wght 100..900 (default 400).
                           The block is 100..900 units wide to match.
  LabStatic-Regular.ttf    "Lab Static" 400 normal, block 500 wide.
  LabStatic-BoldItalic.ttf "Lab Static" 700 italic, block 800 wide.
"""
from pathlib import Path
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib.tables.TupleVariation import TupleVariation

OUT = Path(__file__).parent
EM = 1000


def block(width):
    pen = TTGlyphPen(None)
    if width:
        pen.moveTo((0, 0)); pen.lineTo((0, EM)); pen.lineTo((width, EM)); pen.lineTo((width, 0)); pen.closePath()
    return pen.glyph()


def build(family, style, width, weight, italic=False, variable=False):
    fb = FontBuilder(EM, isTTF=True)
    fb.setupGlyphOrder(['.notdef', 'space', 'A'])
    fb.setupCharacterMap({0x20: 'space', 0x41: 'A'})
    fb.setupGlyf({'.notdef': block(0), 'space': block(0), 'A': block(width)})
    fb.setupHorizontalMetrics({'.notdef': (EM, 0), 'space': (EM, 0), 'A': (EM, 0)})
    fb.setupHorizontalHeader(ascent=EM, descent=0)
    fb.setupNameTable({'familyName': family, 'styleName': style})
    fb.setupOS2(sTypoAscender=EM, sTypoDescender=0, usWinAscent=EM, usWinDescent=0,
                usWeightClass=weight, fsSelection=(0x01 if italic else 0) | (0x20 if weight >= 700 else 0) or 0x40)
    fb.setupPost(italicAngle=-12 if italic else 0)
    fb.setupHead(macStyle=(0x02 if italic else 0) | (0x01 if weight >= 700 else 0))
    if variable:
        fb.setupFvar([('wght', 100, 400, 900, 'Weight')], [dict(location={'wght': 100}, stylename='Thin'), dict(location={'wght': 400}, stylename='Regular'),
                      dict(location={'wght': 900}, stylename='Black')])
        # Four outline points then four phantom points; move the two right-hand points.
        def delta(dx):
            return [(0, 0), (0, 0), (dx, 0), (dx, 0), (0, 0), (0, 0), (0, 0), (0, 0)]
        fb.setupGvar({'.notdef': [], 'space': [], 'A': [
            TupleVariation({'wght': (-1.0, -1.0, 0.0)}, delta(100 - width)),
            TupleVariation({'wght': (0.0, 1.0, 1.0)}, delta(900 - width)),
        ]})
    return fb


build('Lab Block', 'Regular', 400, 400, variable=True).save(OUT / 'LabBlock-VF.ttf')
build('Lab Static', 'Regular', 500, 400).save(OUT / 'LabStatic-Regular.ttf')
build('Lab Static', 'Bold Italic', 800, 700, italic=True).save(OUT / 'LabStatic-BoldItalic.ttf')

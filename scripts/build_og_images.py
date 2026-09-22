#!/usr/bin/env python3
"""scripts/build_og_images.py — one social-card image per page (owner 2026-09-21, from a Facebook post
preview of kirchner.ink/research/stac-8-203-38 that showed the site portrait: "unique thumbnails for each
particular page" — the STAC page its first membrane, the HLS page its first folio, an article its first page).

Writes public/og/<key>.jpg, 1200×630; a page picks its card up by key at build (src/lib/og.server.ts →
openGraph.images / twitter.images) and a page whose card is missing keeps today's tags (no image).

  research-<archiveId>.jpg            the archive's first leaf — a band of the manuscript, from the page's own
                                      published image (the holder's licence covers the page; the card is a crop)
  research-<archiveId>-<leafId>.jpg   every leaf, the same way
  work-<slug>.jpg                     a work's first page: the review render (content/review/<slug>.json → pdf.file)
                                      for a book, else the work's own PDF (works.json → pdf), else a rendered title
                                      page in the site's serif on its paper

MANUAL-RUN ONLY (Pillow, poppler's pdftoppm, the fonts on this Mac): `npm run og:build`, review public/og/,
commit. Idempotent: every card is rewritten from its source each run; nothing on the page is read at build
except the file's presence. The palette is read from app/globals.css (:root, the light theme — a card is
theme-independent) so this file is byte-identical on kirchner.ink and kirchner.cv (which has archives only).
"""
import json, re, subprocess, sys, tempfile
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'og'
W, H = 1200, 630

def palette():
    """the light theme's tokens from app/globals.css — --c-paper (the card ground), --c-card (a rendered page),
       --c-rule, --c-ink, --c-muted, --c-accent; the site's own values, never a second copy of them"""
    defaults = {'paper': (244, 241, 234), 'card': (251, 250, 246), 'rule': (216, 210, 196), 'ink': (27, 37, 64), 'muted': (95, 102, 115), 'accent': (176, 141, 87)}
    try:
        css = (ROOT / 'app' / 'globals.css').read_text()
        root = css[css.index(':root'):]
        root = root[:root.index('}')]
        for k in defaults:
            m = re.search(rf'--c-{k}:\s*(\d+)\s+(\d+)\s+(\d+)', root)
            if m: defaults[k] = tuple(int(x) for x in m.groups())
    except (OSError, ValueError):
        pass
    return defaults
P = palette()

def font(style, size):
    """the site's serif — Iowan Old Style (the first face of the site's font stack) from the Mac's collection,
       Georgia when it is missing; style = roman | bold | italic"""
    iowan = Path('/System/Library/Fonts/Supplemental/Iowan Old Style.ttc')
    if iowan.exists():
        return ImageFont.truetype(str(iowan), size, index={'roman': 0, 'bold': 1, 'italic': 2}[style])
    name = {'roman': 'Georgia.ttf', 'bold': 'Georgia Bold.ttf', 'italic': 'Georgia Italic.ttf'}[style]
    return ImageFont.truetype(f'/System/Library/Fonts/Supplemental/{name}', size)

def site_name():
    try: return json.loads((ROOT / 'content' / 'cv.json').read_text()).get('name') or 'Joseph Kirchner'
    except (OSError, ValueError): return 'Joseph Kirchner'

def save(im, key):
    OUT.mkdir(parents=True, exist_ok=True)
    p = OUT / f'{key}.jpg'
    im.convert('RGB').save(p, 'JPEG', quality=84, optimize=True, progressive=True)
    return p

def leaf_band(src):
    """a 1200×630 band of the manuscript: the leaf at 1200 wide, the band starting 12% down so the mount /
       dark backing at the top edge does not fill the card; a leaf shorter than the band sits on the paper"""
    im = Image.open(src).convert('RGB')
    im = im.resize((W, round(im.height * W / im.width)), Image.LANCZOS)
    if im.height < H:
        card = Image.new('RGB', (W, H), P['paper']); card.paste(im, (0, (H - im.height) // 2)); return card
    top = min(round(im.height * 0.12), im.height - H)
    return im.crop((0, top, W, top + H))

def shadowed(card, box):
    x, y, pw, ph = box
    shadow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rectangle((x + 6, y + 8, x + pw + 6, y + ph + 8), fill=(*P['ink'], 70))
    return Image.alpha_composite(card.convert('RGBA'), shadow.filter(ImageFilter.GaussianBlur(10))).convert('RGB')

def letterbox(page_png):
    """the page fitted to the card's height on the site's paper, a hairline rule and a soft navy shadow"""
    page = Image.open(page_png).convert('RGB')
    ph = H - 40; pw = round(page.width * ph / page.height)
    if pw > W - 40: pw = W - 40; ph = round(page.height * pw / page.width)
    page = page.resize((pw, ph), Image.LANCZOS)
    x, y = (W - pw) // 2, (H - ph) // 2
    card = shadowed(Image.new('RGB', (W, H), P['paper']), (x, y, pw, ph))
    card.paste(page, (x, y))
    ImageDraw.Draw(card).rectangle((x, y, x + pw - 1, y + ph - 1), outline=P['rule'], width=1)
    return card

def pdf_first_page(pdf_path):
    tmp = Path(tempfile.mkdtemp())
    subprocess.run(['pdftoppm', '-f', '1', '-l', '1', '-r', '110', '-png', str(pdf_path), str(tmp / 'p')], check=True, capture_output=True)
    outs = sorted(tmp.glob('p*.png'))
    if not outs: raise RuntimeError(f'pdftoppm wrote nothing for {pdf_path}')
    return outs[0]

def wrap(draw, text, fnt, width):
    words, lines, cur = text.split(), [], ''
    for w in words:
        t = (cur + ' ' + w).strip()
        if draw.textlength(t, font=fnt) <= width: cur = t
        else: lines.append(cur); cur = w
    if cur: lines.append(cur)
    return lines

def title_card(eyebrow, title, byline, site):
    """a rendered first page for a work with no PDF: eyebrow (the collection) · title · byline · site name"""
    ph = H - 40; pw = round(ph * 8.5 / 11); x, y = (W - pw) // 2, 20
    card = shadowed(Image.new('RGB', (W, H), P['paper']), (x, y, pw, ph))
    d = ImageDraw.Draw(card)
    d.rectangle((x, y, x + pw - 1, y + ph - 1), fill=P['card'], outline=P['rule'], width=1)
    f_eye, f_title, f_by, f_site = font('roman', 17), font('bold', 30), font('italic', 19), font('roman', 16)
    inner = pw - 80; cx = x + pw / 2; cy = y + 88
    eye_lines = wrap(d, eyebrow.upper(), f_eye, inner)
    if len(eye_lines) > 2: f_eye = font('roman', 15); eye_lines = wrap(d, eyebrow.upper(), f_eye, inner)[:3]
    for line in eye_lines: d.text((cx, cy), line, font=f_eye, fill=P['muted'], anchor='mm'); cy += 24
    d.line((cx - 60, cy + 10, cx + 60, cy + 10), fill=P['accent'], width=1); cy += 44
    lines = wrap(d, title, f_title, inner)
    if len(lines) > 6: f_title = font('bold', 25); lines = wrap(d, title, f_title, inner)[:7]
    for line in lines: d.text((cx, cy), line, font=f_title, fill=P['ink'], anchor='mm'); cy += f_title.size + 10
    cy += 30
    d.text((cx, cy), byline, font=f_by, fill=P['ink'], anchor='mm')
    d.text((cx, y + ph - 44), site, font=f_site, fill=P['muted'], anchor='mm')
    return card

def main():
    made = []
    # archives — every leaf, and the archive itself as its first leaf (published images only: a placeholder is no face for a page)
    for mf in sorted((ROOT / 'public' / 'uploads' / 'research').glob('*/manifest.json')):
        m = json.loads(mf.read_text())
        aid = m['archive']['id']
        if not m.get('images', {}).get('published'): continue
        for i, leaf in enumerate(m['leaves']):
            band = leaf_band(mf.parent / (leaf.get('web') or leaf['image']))
            made.append(save(band, f'research-{aid}-{leaf["id"]}'))
            if i == 0: made.append(save(band, f'research-{aid}'))
    # works (kirchner.ink; kirchner.cv has none) — a book's review render, else the work's PDF, else a title page
    wj = ROOT / 'content' / 'works.json'
    if wj.exists():
        data = json.loads(wj.read_text())
        colls = data.get('collections') or {}
        coll_title = (lambda s: (colls.get(s) or {}).get('title', s)) if isinstance(colls, dict) else (lambda s: next((c.get('title', s) for c in colls if c.get('slug') == s), s))
        site = site_name()
        for w in data.get('works', []):
            key = f'work-{w["slug"]}'
            review = ROOT / 'content' / 'review' / f'{w["slug"]}.json'
            pdf = None
            if review.exists():
                r = json.loads(review.read_text())
                if r.get('pdf', {}).get('file'): pdf = ROOT / 'public' / r['pdf']['file'].lstrip('/')
            if pdf is None and w.get('pdf'): pdf = ROOT / 'public' / w['pdf'].lstrip('/')
            if pdf is not None and pdf.exists(): made.append(save(letterbox(pdf_first_page(pdf)), key))
            else: made.append(save(title_card(coll_title(w.get('collection', '')), w['title'], site, site), key))
    print(f'wrote {len(made)} card(s) to {OUT.relative_to(ROOT)}/')
    for p in made: print(f'   {p.name}  {p.stat().st_size // 1024} KB')

if __name__ == '__main__':
    try: main()
    except subprocess.CalledProcessError as e:
        print('FATAL:', e, e.stderr.decode(errors='replace')[:500], file=sys.stderr); sys.exit(1)

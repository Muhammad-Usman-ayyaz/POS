"""One-off generator for the PWA app icons (Lagoon palette leaf mark).
Run once from frontend/: python scripts/gen_pwa_icons.py
"""
from PIL import Image, ImageDraw

TEAL = (23, 107, 135, 255)      # Inked Lapis
LEAF = (245, 251, 250, 255)     # near-white, matches --erp-on-primary-container


def quad_bezier(p0, p1, p2, steps=40):
    pts = []
    for i in range(steps + 1):
        t = i / steps
        x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t ** 2 * p2[0]
        y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t ** 2 * p2[1]
        pts.append((x, y))
    return pts


def make_icon(size, maskable=False):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Rounded-square background. Maskable icons need extra safe-zone padding (~20%) since the OS
    # may crop to a circle/squircle.
    pad = int(size * (0.14 if maskable else 0.06))
    radius = int(size * (0.22 if maskable else 0.20))
    draw.rounded_rectangle([pad, pad, size - pad, size - pad], radius=radius, fill=TEAL)

    # Leaf mark: a vesica shape (two mirrored bezier curves) echoing the sidebar's leaf glyph.
    cx = size / 2
    top = (cx, size * 0.28)
    bottom = (cx, size * 0.74)
    half_w = size * 0.15
    mid_y = size * 0.51

    right_edge = quad_bezier(top, (cx + half_w, mid_y), bottom)
    left_edge = quad_bezier(bottom, (cx - half_w, mid_y), top)
    draw.polygon(right_edge + left_edge, fill=LEAF)

    # Center vein.
    draw.line([top, bottom], fill=TEAL, width=max(2, size // 90))

    return img


if __name__ == '__main__':
    out_dir = 'public'
    make_icon(192).save(f'{out_dir}/icon-192.png')
    make_icon(512).save(f'{out_dir}/icon-512.png')
    make_icon(512, maskable=True).save(f'{out_dir}/icon-512-maskable.png')
    print('Wrote icon-192.png, icon-512.png, icon-512-maskable.png to public/')

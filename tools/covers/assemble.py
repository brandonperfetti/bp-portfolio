#!/usr/bin/env python3
"""Compose self-contained cover SVGs: shared shell (ground, glow, grid,
vignette, grain) + per-post motif extracted from the cover-NN.html files.
Output: cover-NN.svg — a single portable file Cloudinary can rasterize."""
import re, sys

noise = open('noise.b64').read().strip()

# per-post accent glows: (color rgba stops, cx, cy) in userSpace
GLOWS = {
    '54': [('rgba(13,128,106,0.30)', 1188, 460, 1400, 900),
           ('rgba(13,128,106,0.10)', 512, 920, 1000, 700)],
    '55': [('rgba(109,40,217,0.26)', 1228, 518, 1400, 900),
           ('rgba(109,40,217,0.10)', 573, 898, 1000, 700)],
    '53': [('rgba(180,83,9,0.26)', 1188, 461, 1400, 900),
           ('rgba(180,83,9,0.10)', 532, 922, 1000, 700)],
    '52': [('rgba(3,105,161,0.28)', 1065, 530, 1400, 900),
           ('rgba(3,105,161,0.10)', 492, 945, 1000, 700)],
    '51': [('rgba(190,18,60,0.24)', 1270, 507, 1400, 900),
           ('rgba(190,18,60,0.10)', 451, 899, 1000, 700)],
    # batch 1 backfill
    '14': [('rgba(13,128,106,0.28)', 1024, 530, 1400, 900),
           ('rgba(13,128,106,0.10)', 512, 922, 1000, 700)],
    '17': [('rgba(162,28,175,0.26)', 1065, 553, 1400, 900),
           ('rgba(162,28,175,0.10)', 1597, 230, 1000, 700)],
    '26': [('rgba(109,40,217,0.26)', 1126, 553, 1400, 900),
           ('rgba(109,40,217,0.10)', 451, 288, 1000, 700)],
    '42': [('rgba(15,118,110,0.30)', 1270, 553, 1400, 900),
           ('rgba(15,118,110,0.10)', 410, 346, 1000, 700)],
    '35': [('rgba(180,83,9,0.26)', 1024, 530, 1400, 900),
           ('rgba(180,83,9,0.10)', 1638, 898, 1000, 700)],
    '41': [('rgba(3,105,161,0.30)', 1065, 576, 1400, 900),
           ('rgba(3,105,161,0.10)', 512, 230, 1000, 700)],
    '5':  [('rgba(190,18,60,0.24)', 1126, 576, 1400, 900),
           ('rgba(190,18,60,0.10)', 410, 864, 1000, 700)],
    # batch 2 backfill
    '16': [('rgba(13,128,106,0.28)', 1024, 576, 1400, 900),
           ('rgba(13,128,106,0.10)', 1679, 253, 1000, 700)],
    '40': [('rgba(13,128,106,0.28)', 1147, 530, 1400, 900),
           ('rgba(13,128,106,0.10)', 369, 899, 1000, 700)],
    '2':  [('rgba(180,83,9,0.26)', 1065, 576, 1400, 900),
           ('rgba(180,83,9,0.10)', 451, 253, 1000, 700)],
    '20': [('rgba(162,28,175,0.26)', 1126, 553, 1400, 900),
           ('rgba(162,28,175,0.10)', 410, 864, 1000, 700)],
    '29': [('rgba(3,105,161,0.30)', 1024, 576, 1400, 900),
           ('rgba(3,105,161,0.10)', 1638, 288, 1000, 700)],
    '10': [('rgba(190,18,60,0.24)', 1024, 599, 1400, 900),
           ('rgba(190,18,60,0.10)', 1597, 230, 1000, 700)],
    '9':  [('rgba(67,56,202,0.30)', 1065, 530, 1400, 900),
           ('rgba(67,56,202,0.12)', 451, 899, 1000, 700)],
}

def shell(post, motif):
    glows = GLOWS[post]
    glow_defs, glow_rects = [], []
    for i, (color, cx, cy, rx, ry) in enumerate(glows):
        gid = f'shellglow{i}'
        glow_defs.append(f'''
    <radialGradient id="{gid}" gradientUnits="userSpaceOnUse"
        cx="{cx}" cy="{cy}" r="{rx}"
        gradientTransform="translate(0,{cy*(1-ry/rx):.1f}) scale(1,{ry/rx:.4f})">
      <stop offset="0" stop-color="{color}"/>
      <stop offset="0.65" stop-color="rgba(0,0,0,0)"/>
    </radialGradient>''')
        glow_rects.append(f'  <rect width="2048" height="1152" fill="url(#{gid})"/>')
    return f'''<svg width="2048" height="1152" viewBox="0 0 2048 1152" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>{''.join(glow_defs)}
    <pattern id="shellgrid" width="64" height="64" patternUnits="userSpaceOnUse">
      <path d="M 64 0 H 0 V 64" fill="none" stroke="rgba(255,255,255,0.035)" stroke-width="1"/>
    </pattern>
    <radialGradient id="shellgridfade" gradientUnits="userSpaceOnUse"
        cx="1024" cy="518" r="1500" gradientTransform="translate(0,190) scale(1,0.6333)">
      <stop offset="0.4" stop-color="white"/>
      <stop offset="0.85" stop-color="black"/>
    </radialGradient>
    <mask id="shellgridmask">
      <rect width="2048" height="1152" fill="url(#shellgridfade)"/>
    </mask>
    <radialGradient id="shellvignette" gradientUnits="userSpaceOnUse"
        cx="1024" cy="576" r="1600" gradientTransform="translate(0,216) scale(1,0.625)">
      <stop offset="0.55" stop-color="rgba(0,0,0,0)"/>
      <stop offset="1" stop-color="rgba(0,0,0,0.55)"/>
    </radialGradient>
    <filter id="shellgrain">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/>
      <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.05 0"/>
    </filter>
  </defs>
  <rect width="2048" height="1152" fill="#09090b"/>
{chr(10).join(glow_rects)}
  <rect width="2048" height="1152" fill="url(#shellgrid)" mask="url(#shellgridmask)"/>
{motif}
  <rect width="2048" height="1152" fill="url(#shellvignette)"/>
  <rect width="2048" height="1152" filter="url(#shellgrain)"/>
</svg>
'''

for post in sys.argv[1:]:
    html = open(f'cover-{post}.html').read()
    # \s+ between attrs: prettier splits the svg tag across lines
    m = re.search(r'<svg\s+class="motif".*?>(.*)</svg>\s*</div>', html, re.S)
    if not m:
        sys.exit(f'motif not found in cover-{post}.html')
    svg = shell(post, m.group(1))
    open(f'cover-{post}.svg', 'w').write(svg)
    print(f'cover-{post}.svg: {len(svg)} bytes')

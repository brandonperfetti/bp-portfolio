#!/usr/bin/env python3
"""Minify assembled cover SVGs and emit base64 for Cloudinary data-URI upload.
Validates XML well-formedness (Cloudinary rejects malformed SVG, e.g.
duplicate attributes, with an opaque "Resource is invalid")."""
import re, sys, base64
import xml.etree.ElementTree as ET

for post in sys.argv[1:]:
    s = open(f'cover-{post}.svg').read()
    s = re.sub(r'<!--.*?-->', '', s, flags=re.S)
    s = re.sub(r'>\s+<', '><', s)
    s = re.sub(r'\s{2,}', ' ', s).strip()
    ET.fromstring(s)  # raises on malformed XML
    open(f'cover-{post}.min.svg', 'w').write(s)
    b64 = base64.b64encode(s.encode()).decode()
    open(f'cover-{post}.min.b64', 'w').write(b64)
    print(f'cover-{post}: {len(s)} bytes svg, {len(b64)} b64 — valid XML')

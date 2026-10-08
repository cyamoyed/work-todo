from PIL import Image, ImageDraw
import os

S = 1024
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

pad = 64
radius = 180
bg = (47, 107, 84, 255)  # #2f6b54
d.rounded_rectangle([pad, pad, S - pad, S - pad], radius=radius, fill=bg)

white = (255, 255, 255, 255)
w = 72
pts = [(S * 0.28, S * 0.52), (S * 0.45, S * 0.68), (S * 0.74, S * 0.34)]

def thick_line(a, b, width):
    d.line([a, b], fill=white, width=width)
    r = width // 2
    for p in (a, b):
        d.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=white)

thick_line(pts[0], pts[1], w)
thick_line(pts[1], pts[2], w)

out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "icon-source.png")
img.save(out)
print("saved", out, img.size)

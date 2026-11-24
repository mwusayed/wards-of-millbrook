# Contact sheet from animation frames: python3 dev/sheet.py <frames dir> <out.jpg> [columns]
import os, sys
from PIL import Image, ImageDraw
src, out = sys.argv[1], sys.argv[2]
cols = int(sys.argv[3]) if len(sys.argv) > 3 else 11
files = sorted(f for f in os.listdir(src) if f.endswith('.png'))
ims = [Image.open(os.path.join(src, f)).convert('RGB') for f in files]
if not ims: sys.exit('no frames')
w, h = ims[0].size
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (cols * w, rows * h), (20, 18, 14))
d = ImageDraw.Draw(sheet)
for i, (im, f) in enumerate(zip(ims, files)):
    x, y = (i % cols) * w, (i // cols) * h
    sheet.paste(im, (x, y)); d.text((x + 6, y + 6), f[3:-4], fill=(240, 230, 200))
scale = min(1.0, 2000 / sheet.width)
if scale < 1: sheet = sheet.resize((int(sheet.width * scale), int(sheet.height * scale)), Image.LANCZOS)
sheet.save(out, quality=85)
print(out, sheet.size, len(ims))

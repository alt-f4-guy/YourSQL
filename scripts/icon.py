# 새 아이콘 원본을 Mac과 Windows 아이콘로 패키징한다.
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
folder = root / 'assets' / 'icon.iconset'
folder.mkdir(parents=True, exist_ok=True)
# 생성 원본의 투명도를 보존하고 맥용 크기로 변환한다.
canvas = Image.open(root / 'assets' / 'icon-source.png').convert('RGBA').resize((1024, 1024), Image.Resampling.LANCZOS)
canvas.save(root / 'assets' / 'icon.icns', format='ICNS')
canvas.save(root / 'assets' / 'icon.ico', format='ICO', sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)])
for size in (16, 32, 128, 256, 512):
    canvas.resize((size, size), Image.Resampling.LANCZOS).save(folder / f'icon_{size}x{size}.png')
    canvas.resize((size * 2, size * 2), Image.Resampling.LANCZOS).save(folder / f'icon_{size}x{size}@2x.png')

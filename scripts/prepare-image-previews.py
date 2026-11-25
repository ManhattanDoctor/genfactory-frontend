"""Generate storefront WebP previews with Pillow. Run from any working directory."""
import hashlib
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
OUTPUT = PUBLIC / "media" / "previews"
MANIFEST = ROOT / "src" / "lib" / "imagePreviews.json"


def encode(item):
    digest, source = item
    targets = [OUTPUT / f"{digest}-{edge}.webp" for edge in (640, 1920)]
    if all(target.is_file() for target in targets):
        return
    with Image.open(source) as original:
        if getattr(original, "is_animated", False):
            raise ValueError(f"Animated image requires a separate preview: {source}")
        image = ImageOps.exif_transpose(original)
        for edge, target in zip((640, 1920), targets):
            preview = image.copy()
            preview.thumbnail((edge, edge), Image.Resampling.LANCZOS)
            temp = target.with_suffix(".tmp")
            preview.save(temp, "WEBP", quality=84, icc_profile=image.info.get("icc_profile", b""))
            temp.replace(target)


def main():
    OUTPUT.mkdir(exist_ok=True)
    sources = {}
    manifest = {}
    for path in sorted((PUBLIC / "media").rglob("*")):
        if OUTPUT in path.parents or path.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
            continue
        if path.stat().st_size < 512 * 1024:
            continue
        digest = hashlib.sha256(path.read_bytes()).hexdigest()[:20]
        sources[digest] = path
        manifest["/" + path.relative_to(PUBLIC).as_posix()] = digest
    with ThreadPoolExecutor(3) as pool:
        list(pool.map(encode, sources.items()))
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()

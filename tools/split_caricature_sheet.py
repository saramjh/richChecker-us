#!/usr/bin/env python3
"""Split a 10x10 portrait sheet and build an app-ready manifest."""

import argparse
import json
import re
import subprocess
import tempfile
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "assets/crawled/forbes-real-time-billionaires-top-100-complete-repaired"
DEFAULT_SHEET = SOURCE_DIR / "0d1691a0-dcf1-46ae-83af-1854d589d735.png"
DEFAULT_DATA = SOURCE_DIR / "forbes-real-time-billionaires-top-100.json"
OUTPUT_DIR = ROOT / "assets/people/caricature-sheet"


def slugify(value):
    normalized = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", normalized.lower()).strip("-")


def dimensions(path):
    result = subprocess.run(
        ["sips", "-g", "pixelWidth", "-g", "pixelHeight", str(path)],
        check=True, capture_output=True, text=True,
    ).stdout
    width = int(re.search(r"pixelWidth: (\d+)", result).group(1))
    height = int(re.search(r"pixelHeight: (\d+)", result).group(1))
    return width, height


def grid_interiors(path, width, height):
    """Return the ten content intervals between the sheet's gold border runs."""
    with tempfile.NamedTemporaryFile(suffix=".rgb") as raw:
        subprocess.run(
            ["ffmpeg", "-loglevel", "error", "-i", str(path),
             "-f", "rawvideo", "-pix_fmt", "rgb24", "-y", raw.name],
            check=True,
        )
        pixels = raw.read()

    def gold_count(axis, coordinate):
        count = 0
        length = height if axis == "x" else width
        for other in range(length):
            x, y = (coordinate, other) if axis == "x" else (other, coordinate)
            offset = (y * width + x) * 3
            red, green, blue = pixels[offset:offset + 3]
            count += red > 170 and green > 110 and red > blue * 1.5 and green > blue * 1.2
        return count

    def runs(axis, length, cross_length):
        # A grid line spans almost the entire opposite dimension. Portrait
        # highlights are local and therefore remain below this threshold.
        positions = [i for i in range(length) if gold_count(axis, i) > cross_length * 0.75]
        groups = []
        for position in positions:
            if not groups or position > groups[-1][-1] + 1:
                groups.append([position])
            else:
                groups[-1].append(position)
        if len(groups) != 20:
            raise ValueError(f"Expected 20 {axis}-axis gold border runs, found {len(groups)}")
        return [(group[0], group[-1]) for group in groups]

    def interiors(border_runs):
        cells = []
        for index in range(10):
            left = border_runs[0] if index == 0 else border_runs[index * 2]
            right = border_runs[-1] if index == 9 else border_runs[index * 2 + 1]
            cells.append((left[1] + 1, right[0] - 1))
        return cells

    return interiors(runs("x", width, height)), interiors(runs("y", height, width))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--sheet", type=Path, default=DEFAULT_SHEET)
    parser.add_argument("--data", type=Path, default=DEFAULT_DATA)
    args = parser.parse_args()

    source = json.loads(args.data.read_text())
    people = sorted(source["billionaires"], key=lambda person: person["exportOrder"])
    export_orders = [person["exportOrder"] for person in people]
    if len(people) != 100 or export_orders != list(range(1, 101)):
        raise ValueError("Expected exactly one entry for every exportOrder from 1 to 100")

    width, height = dimensions(args.sheet)
    x_cells, y_cells = grid_interiors(args.sheet, width, height)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for old_tile in OUTPUT_DIR.glob("*.png"):
        old_tile.unlink()
    manifest = []
    seen = set()

    for index, person in enumerate(people):
        export_order = person["exportOrder"]
        row, column = divmod(index, 10)
        x0, x1 = x_cells[column]
        y0, y1 = y_cells[row]
        base = slugify(person["name"])
        identifier = base if base not in seen else f"{base}-{export_order}"
        seen.add(identifier)
        output = OUTPUT_DIR / f"{export_order:03d}-{identifier}.png"
        # Keep the source untouched. Re-scale each uneven 125/126 px cell and
        # draw the final border inside the output so every tile is identical.
        video_filter = (
            f"crop={x1-x0+1}:{y1-y0+1}:{x0}:{y0},"
            "scale=640:640:flags=lanczos,"
            "drawbox=x=0:y=0:w=iw:h=ih:color=0xD4AF37:t=8"
        )
        subprocess.run(
            ["ffmpeg", "-loglevel", "error", "-y", "-i", str(args.sheet),
             "-vf", video_filter, "-frames:v", "1", str(output)],
            check=True,
        )
        manifest.append({
            "id": identifier,
            "name": person["name"],
            "title": person["source"],
            "rank": person["rank"],
            "position": person["position"],
            "exportOrder": export_order,
            "netWorth": f"${person['netWorthUSD'] / 1_000_000_000:,.2f}B",
            "netWorthUsd": person["netWorthUSD"],
            "industries": person.get("industries", []),
            "countryOfCitizenship": person.get("countryOfCitizenship"),
            "achievement": f"Known for wealth from {person['source']}.",
            "image": str(output.relative_to(ROOT)),
            "imageStatus": "pending-validation",
            "isIllustration": True,
            "profileUrl": person["profileUrl"],
            "analysisImageAvailable": bool(person.get("imageAvailable")),
            "sourceSnapshot": str(args.data.relative_to(ROOT)),
            "sheetCell": {"index": export_order, "row": row + 1, "column": column + 1},
        })

    output_manifest = ROOT / "data/people.json"
    output_manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(f"Created {len(manifest)} framed tiles and {output_manifest.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

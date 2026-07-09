import json
import shutil

from aion2.tools.env import require_dir

pets = json.load(open('table.pets.json', encoding='utf-8'))
# Pre-monorepo export root (the old layout with UI/ directly under it).
src_dir = require_dir("AION2_LEGACY_EXPORT_ROOT") / "UI/Resource/Texture/Portrait/Portrait_Vehicle"
dest_dir = src_dir.parent / "Portrait_Vehicle_Rename"
dest_dir.mkdir(parents=True, exist_ok=True)

for pet in pets:
    src_filename = pet["icon"] + ".png"
    src_file = src_dir / src_filename
    dest_filename = pet["zh-CN"] + ".png"
    dest_file = dest_dir / dest_filename
    shutil.copy(src_file, dest_file)



import os
from pathlib import Path

TOOLS_ROOT = Path(__file__).resolve().parents[3]   # .../tools
WORKSPACE_ROOT = TOOLS_ROOT.parent                 # .../aion2-map

# Raw UE5 game export. Per-machine path; set RAW_DATA_PATH in tools/.env.
RAW_ROOT = Path(os.environ.get("RAW_DATA_PATH") or "G:/NCSoft/Export/Exports/AION2/Content")
# Sibling frontend repo. Defaults to ../frontend; override via FRONTEND_ROOT if needed.
FRONTEND_ROOT = Path(os.environ.get("FRONTEND_ROOT") or (WORKSPACE_ROOT / "frontend"))
CALIBRATION_OUT = TOOLS_ROOT / "parsed_data" / "calibration"

def worldmap_path(map_name: str) -> Path:
    return RAW_ROOT / "Data" / "WorldMap" / f"{map_name}.json"

def subzone_groups_yaml_path(map_name: str) -> Path:
    # frontend dir is still "regions" until the Phase 2 rename to "subzoneGroups"
    return FRONTEND_ROOT / "public" / "data" / "regions" / f"{map_name}.yaml"

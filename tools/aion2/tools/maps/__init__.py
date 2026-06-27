from pathlib import Path

RAW_ROOT = Path("G:/NCSoft/Export/Exports/AION2/Content")
FRONTEND_ROOT = Path("G:/NCSoft/aion2-map/frontend")
TOOLS_ROOT = Path(__file__).resolve().parents[3]   # .../tools
CALIBRATION_OUT = TOOLS_ROOT / "parsed_data" / "calibration"

def worldmap_path(map_name: str) -> Path:
    return RAW_ROOT / "Data" / "WorldMap" / f"{map_name}.json"

def regions_yaml_path(map_name: str) -> Path:
    return FRONTEND_ROOT / "public" / "data" / "regions" / f"{map_name}.yaml"

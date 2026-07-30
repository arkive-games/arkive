"""The ACCEPTED world->pixel calibration for the Vardoran map.

Derived 2026-07-30 by ``python -m vrising.maps calibrate`` — see that module for
the method. The emit stage reads this file and nothing else; the search's own
``calibration/result.json`` is a review artifact, so re-running the search can
never silently move every marker on the map.

Provenance
----------
scale        0.5 world units per pixel, giving a 3040-unit span over 6080 px.
             Verified 372/372 against the mask rasters in the extract stage, so
             the scale was NOT fitted. It was then confirmed independently for
             the MAP IMAGE by the scale sweep (``calibrate --sweep-scale``,
             0.400-0.600 in 0.005 steps): IoU peaks at exactly 0.500 (0.3821)
             and falls off monotonically either side.
method       composited region silhouettes vs. the map's land mask, offset by
             FFT cross-correlation (argmax correlation == argmax overlap under
             pure translation), then refined at 1/2 scale against a second,
             independent objective: every region's OUTLINE vs. the map's drawn
             ink. Both objectives converge on the same bounds to within 6 px
             out of 6080.
land mask    ``ink`` (local dark-ink density), land fraction 0.418. The flood
             and gradient methods the plan expected both degenerate on this map
             (0.991 and 0.979 land fraction) because the image is an opaque
             parchment sheet with no alpha and no flat void colour.
orientation  pxAxis=X, flipX=False, flipY=True. Separated from the best rival
             orientation (pxAxis=X, flipX=True) by 0.0638 containment
             (0.9374 vs 0.8736); the rival's overlay render is visibly wrong -
             mirrored silhouettes, several boxes sitting on bare parchment.
row order    MASK_ROWS_DOWN=True, separated by 0.1611 outline hit rate
             (0.8132 vs 0.6521) at 1/2 scale. At the coarse 1/8 search scale the
             two row orders are a near-tie (0.0015), which is why the refinement
             pass exists.
containment  0.9165 - 91.65% of all 372 composited silhouette pixels land on
             the map's drawn terrain.
outline hit  0.8132 - 81.32% of all region boundary pixels land on ink the map
             actually drew.
IoU          0.3670 at the accepted bounds. BELOW the plan's 0.75 threshold, and
             unreachably so: the 372 silhouettes are individual sub-areas, not a
             tiling of the landmass, and cover only 40.9% of it. IoU is bounded
             by min(A,B)/max(A,B) = 0.4090 no matter how perfect the alignment,
             so the plan's threshold was mis-specified rather than missed. The
             IoU margin over the runner-up is likewise uninformative (0.0048)
             because the runner-up differs only in mask row order.
eyeball      The three mandated regions - largest-area POI (poi_052), most
             eccentric POI (poi_196), region nearest a corner (terr_127) - were
             measured mechanically by local outline/ink correlation at 1/2 scale
             and are 8 px, 17 px and 10 px from their drawn features at full
             resolution, all inside the 30 px limit. Each was also rendered as a
             zoomed crop and inspected: the silhouette follows the map's own
             boundary line in all three. ``calibration/accepted_overlay.png``
             (1520 px) shows the whole fit.

CALIBRATION_METHOD is "fitted" when the automated search was accepted, and
"by-eye" when the fallback was used (see the plan, Task 8 Step 9). It is
"by-eye" here, deliberately and conservatively: the numbers below came out of
the automated search, not a hand drag, but the plan's stated automated gate
(IoU >= 0.75, margin >= 0.10) was NOT met, so acceptance rests on human review
of the overlay renders plus the substitute statistics recorded above. Downstream
code does not branch on this field - it exists so the next reader knows how much
to trust these numbers. Anyone re-deriving this should re-check the substitute
gates below rather than the IoU one.
"""

from __future__ import annotations

from .transform import Orientation

MAP_ID = "Vardoran"
MAP_PX = 6080
UNITS_PER_PIXEL = 0.5

CALIBRATION_METHOD = "by-eye"
CALIBRATION_DATE = "2026-07-30"
# As measured at the accepted bounds. Recorded even though it is below the
# plan's 0.75 threshold: see the docstring for why that threshold is unreachable.
CALIBRATION_IOU = 0.3670
CALIBRATION_IOU_CEILING = 0.4090
CALIBRATION_MARGIN = 0.0048  # IoU margin over the runner-up; uninformative here
# The statistics acceptance actually rested on.
CALIBRATION_CONTAINMENT = 0.9165
CALIBRATION_OUTLINE_HIT_RATE = 0.8132
CALIBRATION_ORIENTATION_MARGIN = 0.0638  # containment, over the best rival orientation
CALIBRATION_ROW_ORDER_MARGIN = 0.1611    # outline hit rate, over the other row order
# Full-resolution offset of the three mandated spot-check regions, in px.
CALIBRATION_REGION_OFFSETS_PX = {"poi_052": 8, "poi_196": 17, "terr_127": 10}

# World AABB that maps onto the FULL 6080x6080 pixel grid.
# Span is exactly 3040 on both axes = 6080 px * 0.5 units/px.
WORLD_BOUNDS = {
    "min": [-2883.0, -2402.5],
    "max": [157.0, 637.5],
}

ORIENTATION = Orientation("X", False, True)

# Mask raster row order: True means mask row 0 is the box's MAX world-y edge.
MASK_ROWS_DOWN = True


def world_bounds_json() -> dict:
    """``worldBounds`` in the shape ``@gamemap/data-contract`` expects."""
    return {
        "min": {"x": WORLD_BOUNDS["min"][0], "y": WORLD_BOUNDS["min"][1]},
        "max": {"x": WORLD_BOUNDS["max"][0], "y": WORLD_BOUNDS["max"][1]},
    }

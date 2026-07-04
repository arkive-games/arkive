export function makeTransform(bounds, orientation, pixelW, pixelH) {
  const { min, max } = bounds;
  const { pxAxis, flipX, flipY } = orientation;
  const pyAxis = pxAxis === 'X' ? 'Y' : 'X';
  return (world) => {
    let x = ((world[pxAxis] - min[pxAxis]) / (max[pxAxis] - min[pxAxis])) * pixelW;
    let y = ((world[pyAxis] - min[pyAxis]) / (max[pyAxis] - min[pyAxis])) * pixelH;
    if (flipX) x = pixelW - x;
    if (flipY) y = pixelH - y;
    return { x, y };
  };
}

// Inverse of makeTransform: pixel (x, y) -> world { X, Y }. Used to emit raw
// world coordinates for cluster centroids (which are computed in pixel space).
export function makeInverseTransform(bounds, orientation, pixelW, pixelH) {
  const { min, max } = bounds;
  const { pxAxis, flipX, flipY } = orientation;
  const pyAxis = pxAxis === 'X' ? 'Y' : 'X';
  return (px, py) => {
    let fx = px;
    let fy = py;
    if (flipX) fx = pixelW - fx;
    if (flipY) fy = pixelH - fy;
    const world = { X: 0, Y: 0 };
    world[pxAxis] = (fx / pixelW) * (max[pxAxis] - min[pxAxis]) + min[pxAxis];
    world[pyAxis] = (fy / pixelH) * (max[pyAxis] - min[pyAxis]) + min[pyAxis];
    return world;
  };
}

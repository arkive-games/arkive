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

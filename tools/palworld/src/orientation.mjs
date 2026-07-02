// Verified 2026-07-02 via calibrate renders against fast-travel statue layout
// (all 137 MainWorld + 15 WorldTree statues on land; alternatives fail).
// Re-verify if map art changes.
export const ORIENTATIONS = {
  MainWorld: { pxAxis: 'Y', flipX: false, flipY: true },
  WorldTree: { pxAxis: 'Y', flipX: false, flipY: true },
};

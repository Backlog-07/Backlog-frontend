/**
 * Shared carousel math for Scene + App so snap/scrolling matches 3D positions.
 *
 * Spacing targets ~5 items visible: hero + 2 neighbors full, outer pair just inside the frame.
 */

function clamp01(t) {
  return Math.min(1, Math.max(0, t));
}

/** Keep in sync with Scene main-carousel PerspectiveCamera (not preview). */
export const CAROUSEL_CAM_Z = 5.38;
export const CAROUSEL_FOV = 38;

/**
 * World-units between adjacent product centers.
 * Derived from frustum width so the 5th slot (~2 steps off-center) sits near the viewport edge.
 */
export function getCarouselItemWidth() {
  if (typeof window === "undefined") return 1.55;
  const w = window.innerWidth || 1024;
  const h = window.innerHeight || 800;
  const aspect = Math.max(0.52, Math.min(2.35, w / Math.max(320, h)));
  const fovRad = (CAROUSEL_FOV * Math.PI) / 180;
  const halfW = Math.tan(fovRad / 2) * CAROUSEL_CAM_Z * aspect;

  // Responsive spacing: keep central item comfortable and scale for smaller screens.
  const breakpoints = [480, 768, 1024];
  let factor = 0.965;
  if (w <= breakpoints[0]) {
    factor = 0.76;
  } else if (w <= breakpoints[1]) {
    factor = 0.84;
  } else if (w <= breakpoints[2]) {
    factor = 0.92;
  }

  const step = (halfW * factor) / 2;
  return Math.max(1.22, Math.min(2.16, step));
}

/**
 * Pulls low-scale slots slightly toward center so edge-to-edge gaps read closer to
 * inner gaps (uniform center distance alone leaves huge clear bands next to tiny edge items).
 * Track/snap still uses raw x; this is display-only on the rail.
 */
export const CAROUSEL_LATERAL_COMPRESS = 0.14;

/**
 * @param {number} distance — |x| from carousel center in world units
 * @param {number} itemWidth — same value as getCarouselItemWidth()
 */
export function getCarouselItemScale(distance, itemWidth) {
  const s0 = 1.0;
  const s1 = 0.63;
  const s2 = 0.3;
  const d1 = itemWidth;
  const d2 = itemWidth * 2;
  if (distance <= d1) {
    return s0 + (s1 - s0) * clamp01(distance / d1);
  }
  if (distance <= d2) {
    return s1 + (s2 - s1) * clamp01((distance - d1) / d1);
  }
  return Math.max(0.14, s2 - ((distance - d2) / d1) * 0.2);
}

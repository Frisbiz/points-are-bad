export const VIEWPORT_WATCH_INTERVAL_MS = 200;

export function viewportLayoutState(width) {
  const safeWidth = Number.isFinite(Number(width)) && Number(width) > 0 ? Number(width) : 0;
  return {
    width: safeWidth,
    widthCss: `${safeWidth}px`,
    compact: safeWidth <= 900 ? "true" : "false",
    dashboardStack: safeWidth <= 834 ? "true" : "false",
    phone: safeWidth <= 620 ? "true" : "false",
    smallPhone: safeWidth <= 360 ? "true" : "false",
  };
}

export function visibleViewportWidth({ innerWidth, visualViewportWidth, outerWidth }) {
  const layoutWidth = Number(innerWidth);
  const visibleWidth = Number(visualViewportWidth);
  const browserWidth = Number(outerWidth);
  if (!Number.isFinite(layoutWidth) || layoutWidth <= 0) return null;
  return Math.min(
    layoutWidth,
    Number.isFinite(visibleWidth) && visibleWidth > 0 ? visibleWidth : layoutWidth,
    Number.isFinite(browserWidth) && browserWidth > 0 ? browserWidth : layoutWidth,
  );
}

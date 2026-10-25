// Viewer preference only: never use this palette to calculate points or rankings.
export function pickScoreColors(score, { viewerUsername = "", missed = false, theme = "" } = {}) {
  const personal = String(viewerUsername).trim().toLowerCase() === "jigga";
  if (theme === "excel" && !personal) {
    return {
      color: score == null ? "#999" : score === 0 ? "#16a34a" : score < 4 ? "#666" : score === 4 ? "#ca8a04" : "#dc2626",
      background: score == null ? "transparent" : score === 0 ? "#d4edda" : score < 4 ? "transparent" : score === 4 ? "#fef3c7" : "#fee2e2",
    };
  }
  if (score == null) return { color: "var(--text-dim2)", background: "transparent", borderColor: "transparent" };
  const color = missed ? "#6b7280" : score === 0 ? "#22c55e"
    : personal ? (score === 1 ? "var(--text-bright)" : score <= 3 ? "var(--pick-score-yellow)" : "#ef4444")
      : score <= 2 ? "#f59e0b" : "#ef4444";
  const token = color.startsWith("var(");
  return {
    color,
    background: token ? `color-mix(in srgb, ${color} 12%, transparent)` : `${color}20`,
    borderColor: token ? `color-mix(in srgb, ${color} 25%, transparent)` : `${color}40`,
  };
}

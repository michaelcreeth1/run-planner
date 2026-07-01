import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import type { MileageTrend } from "../../types/domain";
import { formatMileageTrendAriaLabel, formatMileageTrendDelta } from "../../lib/formatters";

export function MileageTrendBadge({ compact = false, trend }: { compact?: boolean; trend?: MileageTrend | null }) {
  if (!trend) {
    return null;
  }

  const Icon = trend.direction === "up" ? ArrowUp : trend.direction === "down" ? ArrowDown : Minus;

  return (
    <span
      aria-label={formatMileageTrendAriaLabel(trend)}
      className={`mileage-trend mileage-trend--${trend.direction} ${compact ? "mileage-trend--compact" : ""}`}
      title={formatMileageTrendAriaLabel(trend)}
    >
      <Icon size={compact ? 10 : 12} aria-hidden="true" />
      <span>{formatMileageTrendDelta(trend)}</span>
    </span>
  );
}

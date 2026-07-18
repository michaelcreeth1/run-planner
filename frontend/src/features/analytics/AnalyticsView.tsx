import { BarChart3, RefreshCw, TrendingUp } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { Placeholder } from "../../components/shared/Placeholder";
import type { AnalyticsPlanning, AnalyticsWeekSummary } from "../../types/domain";
import { formatNumber, formatShortDate } from "../../lib/formatters";

export function AnalyticsView({
  analytics,
  futureWeeks,
  isLoading,
  lookbackWeeks,
  onSelectWeek,
  setFutureWeeks,
  setLookbackWeeks
}: {
  analytics: AnalyticsPlanning | null;
  futureWeeks: number;
  isLoading: boolean;
  lookbackWeeks: number;
  onSelectWeek: (weekStartDate: string) => void;
  setFutureWeeks: Dispatch<SetStateAction<number>>;
  setLookbackWeeks: Dispatch<SetStateAction<number>>;
}) {
  if (isLoading && !analytics) {
    return <Placeholder title="Analytics" icon={<RefreshCw size={22} />} />;
  }

  if (!analytics) {
    return (
      <section className="analytics-view analytics-view--empty">
        <div className="analytics-empty-state">
          <BarChart3 size={24} />
          <div>
            <p className="eyebrow">Planning analytics</p>
            <h2>Mileage history needs a backend response.</h2>
            <span>Connect Strava or start the API to draw the weekly mileage chart.</span>
          </div>
        </div>
      </section>
    );
  }

  const plannedWindowWeeks = analytics.weeks.filter((week) => week.weekStartDate >= analytics.anchorWeekStartDate);
  const recentWeeks = analytics.weeks.filter((week) => week.weekStartDate < analytics.anchorWeekStartDate);
  const visibleWeeks = [...recentWeeks, ...plannedWindowWeeks];

  return (
    <section className="analytics-view" aria-label="Mileage analytics">
      <section className="mileage-chart-panel" aria-label="Weekly mileage chart">
        <header className="mileage-chart-header">
        <div>
          <p className="eyebrow">Mileage</p>
          <h1>Weekly mileage trend</h1>
            <span>
              Last {analytics.lookbackWeeks} weeks plus next {analytics.futureWeeks} planned weeks
            </span>
        </div>
        <TrendingUp size={20} />
        <div className="mileage-chart-controls" aria-label="Mileage chart timeframe">
          <SegmentedNumberControl
            label="History"
            options={[8, 12, 16, 24]}
            suffix="w"
            value={lookbackWeeks}
            onChange={setLookbackWeeks}
          />
          <SegmentedNumberControl
            label="Planned"
            options={[4, 8, 12]}
            suffix="w"
            value={futureWeeks}
            onChange={setFutureWeeks}
          />
      </div>
        </header>

        <MileageLineChart
          anchorWeekStartDate={analytics.anchorWeekStartDate}
          baselineMileage={analytics.loadBand.baselineMileage}
          onSelectWeek={onSelectWeek}
          weeks={visibleWeeks}
        />
      </section>
    </section>
  );
}

function SegmentedNumberControl({
  label,
  onChange,
  options,
  suffix,
  value
}: {
  label: string;
  onChange: Dispatch<SetStateAction<number>>;
  options: number[];
  suffix: string;
  value: number;
}) {
  return (
    <div className="analytics-segmented-control">
      <span>{label}</span>
      <div>
        {options.map((option) => (
          <button
            className={option === value ? "active" : ""}
            key={option}
            type="button"
            onClick={() => onChange(option)}
          >
            {option}
            {suffix}
          </button>
        ))}
      </div>
    </div>
  );
}

function MileageLineChart({
  anchorWeekStartDate,
  baselineMileage,
  onSelectWeek,
  weeks
}: {
  anchorWeekStartDate: string;
  baselineMileage: number | null;
  onSelectWeek: (weekStartDate: string) => void;
  weeks: AnalyticsWeekSummary[];
}) {
  const width = 960;
  const height = 360;
  const padding = { bottom: 42, left: 54, right: 28, top: 26 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxMileage = Math.max(
    10,
    baselineMileage ?? 0,
    ...weeks.map((week) => Math.max(week.actualMileage, week.plannedMileage, week.targetMileage ?? 0))
  );
  const yMax = Math.ceil(maxMileage / 10) * 10;
  const actualPoints = weeks
    .filter((week) => week.weekStartDate <= anchorWeekStartDate && week.actualMileage > 0)
    .map((week) => ({
      ...chartPoint(week.weekStartDate, week.actualMileage, weeks, yMax, chartWidth, chartHeight, padding),
      mileage: week.actualMileage
    }));
  const plannedPoints = weeks
    .filter((week) => week.weekStartDate >= anchorWeekStartDate && week.plannedMileage > 0)
    .map((week) => ({
      ...chartPoint(week.weekStartDate, week.plannedMileage, weeks, yMax, chartWidth, chartHeight, padding),
      mileage: week.plannedMileage
    }));
  const targetPoints = weeks
    .filter((week) => week.weekStartDate >= anchorWeekStartDate && week.targetMileage !== null)
    .map((week) => ({
      ...chartPoint(week.weekStartDate, week.targetMileage ?? 0, weeks, yMax, chartWidth, chartHeight, padding),
      mileage: week.targetMileage ?? 0
    }));
  const interactivePoints = [
    ...actualPoints.map((point) => ({ ...point, kind: "actual" as const })),
    ...plannedPoints.map((point) => ({ ...point, kind: "planned" as const })),
    ...targetPoints.map((point) => ({ ...point, kind: "target" as const }))
  ];
  const anchorIndex = Math.max(0, weeks.findIndex((week) => week.weekStartDate === anchorWeekStartDate));
  const anchorX = padding.left + (weeks.length <= 1 ? 0 : (anchorIndex / (weeks.length - 1)) * chartWidth);
  const yTicks = [0, yMax / 2, yMax];
  const xTicks = weeks.filter((_, index) => index === 0 || index === weeks.length - 1 || weeks[index].weekStartDate === anchorWeekStartDate);
  const latestActual = [...weeks].reverse().find((week) => week.actualMileage > 0);
  const nextPlanned = weeks.find((week) => week.weekStartDate >= anchorWeekStartDate && week.plannedMileage > 0);
  const nextTarget = weeks.find((week) => week.weekStartDate >= anchorWeekStartDate && week.targetMileage !== null);

  return (
    <div className="mileage-line-chart">
      <div className="mileage-line-chart-summary">
        <button
          type="button"
          disabled={!latestActual}
          onClick={() => latestActual && onSelectWeek(latestActual.weekStartDate)}
        >
          <span>Latest actual</span>
          <strong>{latestActual ? `${formatNumber(latestActual.actualMileage)} mi` : "-"}</strong>
        </button>
        <button
          type="button"
          disabled={!nextPlanned}
          onClick={() => nextPlanned && onSelectWeek(nextPlanned.weekStartDate)}
        >
          <span>{nextPlanned?.weekStartDate === anchorWeekStartDate ? "This week planned" : "Next planned"}</span>
          <strong>{nextPlanned ? `${formatNumber(nextPlanned.plannedMileage)} mi` : "-"}</strong>
        </button>
        <button
          type="button"
          disabled={!nextTarget}
          onClick={() => nextTarget && onSelectWeek(nextTarget.weekStartDate)}
        >
          <span>{nextTarget?.weekStartDate === anchorWeekStartDate ? "This week target" : "Next target"}</span>
          <strong>{nextTarget ? `${formatNumber(nextTarget.targetMileage ?? 0)} mi` : "-"}</strong>
        </button>
        <div>
          <span>4-week baseline</span>
          <strong>{baselineMileage !== null ? `${formatNumber(baselineMileage)} mi` : "-"}</strong>
        </div>
      </div>

      <div className="mileage-chart-graphic">
        <svg aria-hidden="true" focusable="false" viewBox={`0 0 ${width} ${height}`}>
          <rect className="mileage-chart-plot" x={padding.left} y={padding.top} width={chartWidth} height={chartHeight} rx="8" />
        {yTicks.map((tick) => {
          const y = mileageY(tick, yMax, chartHeight, padding);
          return (
            <g key={tick}>
              <line className="mileage-chart-grid" x1={padding.left} x2={width - padding.right} y1={y} y2={y} />
              <text className="mileage-chart-y-label" x={padding.left - 12} y={y + 4}>{formatNumber(tick)}</text>
            </g>
          );
        })}
        {baselineMileage !== null ? (
          <line
            className="mileage-chart-baseline"
            x1={padding.left}
            x2={width - padding.right}
            y1={mileageY(baselineMileage, yMax, chartHeight, padding)}
            y2={mileageY(baselineMileage, yMax, chartHeight, padding)}
          />
        ) : null}
        <line className="mileage-chart-anchor" x1={anchorX} x2={anchorX} y1={padding.top} y2={height - padding.bottom} />
        <polyline className="mileage-line mileage-line--actual" points={pointsAttribute(actualPoints)} />
        <polyline className="mileage-line mileage-line--planned" points={pointsAttribute(plannedPoints)} />
        <polyline className="mileage-line mileage-line--target" points={pointsAttribute(targetPoints)} />
        {actualPoints.map((point) => (
          <ChartPoint key={`actual-${point.weekStartDate}`} kind="actual" point={point} />
        ))}
        {plannedPoints.map((point) => (
          <ChartPoint key={`planned-${point.weekStartDate}`} kind="planned" point={point} />
        ))}
        {targetPoints.map((point) => (
          <ChartPoint key={`target-${point.weekStartDate}`} kind="target" point={point} />
        ))}
        {xTicks.map((week) => {
          const point = chartPoint(week.weekStartDate, 0, weeks, yMax, chartWidth, chartHeight, padding);
          return (
            <text className="mileage-chart-x-label" key={week.weekStartDate} x={point.x} y={height - 14}>
              {week.weekStartDate === anchorWeekStartDate ? "Now" : formatShortDate(week.weekStartDate)}
            </text>
          );
        })}
        </svg>
        {interactivePoints.map((point) => (
          <button
            aria-label={`Open ${point.kind} mileage of ${formatNumber(point.mileage)} miles for week of ${formatShortDate(point.weekStartDate)}`}
            className={`mileage-point-control mileage-point-control--${point.kind}`}
            key={`${point.kind}-${point.weekStartDate}`}
            onClick={() => onSelectWeek(point.weekStartDate)}
            style={{ left: `${(point.x / width) * 100}%`, top: `${(point.y / height) * 100}%` }}
            type="button"
          />
        ))}
      </div>

      <div className="mileage-chart-legend" aria-label="Mileage chart legend">
        <span><i className="actual" /> Actual</span>
        <span><i className="planned" /> Planned</span>
        <span><i className="target" /> Plan target</span>
        <span><i className="baseline" /> Baseline</span>
      </div>
    </div>
  );
}

function ChartPoint({
  kind,
  point
}: {
  kind: "actual" | "planned" | "target";
  point: { weekStartDate: string; x: number; y: number };
}) {
  return (
    <g>
      <circle className={`mileage-point mileage-point--${kind}`} cx={point.x} cy={point.y} r="4" />
    </g>
  );
}

function chartPoint(
  weekStartDate: string,
  mileage: number,
  weeks: AnalyticsWeekSummary[],
  yMax: number,
  chartWidth: number,
  chartHeight: number,
  padding: { bottom: number; left: number; right: number; top: number }
) {
  const index = Math.max(0, weeks.findIndex((week) => week.weekStartDate === weekStartDate));
  const x = padding.left + (weeks.length <= 1 ? 0 : (index / (weeks.length - 1)) * chartWidth);
  return {
    weekStartDate,
    x,
    y: mileageY(mileage, yMax, chartHeight, padding)
  };
}

function mileageY(
  mileage: number,
  yMax: number,
  chartHeight: number,
  padding: { top: number }
) {
  return padding.top + chartHeight - (mileage / yMax) * chartHeight;
}

function pointsAttribute(points: Array<{ x: number; y: number }>) {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

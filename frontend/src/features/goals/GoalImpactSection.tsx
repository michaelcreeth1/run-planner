import { ChevronLeft, ChevronRight, Grid3x3 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { fetchJson } from "../../lib/api";
import { addDays, parseDate, startOfWeek, todayDateString } from "../../lib/dates";
import { formatCompactWeekRange } from "../../lib/formatters";
import type { PlanWeekSummary, TrainingWeek } from "../../types/domain";
import type { PlanRule, RuleEvaluation, RuleStatus } from "./ruleEvaluation";
import { buildPlanRules, evaluateRulesForWeek, ruleStatusLabels, summarizeRuleMatrix } from "./ruleEvaluation";
import { useRuleContext } from "./useRuleContext";

const legendStatuses: RuleStatus[] = ["pass", "warning", "fail", "pending", "override"];
const attentionStatuses = new Set<RuleStatus>(["warning", "fail", "pending"]);
// Pending weeks match every rule, so the row filter only tracks real violations.
const filterStatuses = new Set<RuleStatus>(["warning", "fail"]);

const historyOptions = [0, 4, 8, 12];
const DEFAULT_HISTORY_WEEKS = 8;
// Without a plan the matrix still shows the near future so upcoming weeks read as pending.
const FUTURE_WEEKS_WITHOUT_PLAN = 4;

const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "short" });

type MatrixColumn = {
  weekStart: string;
  weekEnd: string;
  summary: PlanWeekSummary | null;
  planWeekNumber: number | null;
  evaluations: RuleEvaluation[];
};

type CellTooltip = {
  evaluation: RuleEvaluation;
  weekLabel: string;
  left: number;
  top: number;
};

export function GoalImpactSection({ onSelectWeek }: { onSelectWeek: (weekStartDate: string) => void }) {
  const { plan, defaultGoals, isLoading: contextLoading, error: contextError } = useRuleContext();
  const [historyWeeks, setHistoryWeeks] = useState(DEFAULT_HISTORY_WEEKS);
  const [weeks, setWeeks] = useState<Record<string, TrainingWeek>>({});
  const [weeksError, setWeeksError] = useState<string | null>(null);
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<CellTooltip | null>(null);
  const [selectedCell, setSelectedCell] = useState<{ evaluation: RuleEvaluation; weekLabel: string; weekStart: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const weekHeaderRefs = useRef(new Map<string, HTMLElement>());
  const [focusedWeek, setFocusedWeek] = useState(() => startOfWeek(new Date()));
  const [centerRequest, setCenterRequest] = useState(0);
  const requestedStartsRef = useRef(new Set<string>());
  const currentWeekStart = useMemo(() => startOfWeek(new Date()), []);

  const weekStarts = useMemo(() => {
    if (contextLoading) {
      return [];
    }
    const planStarts = plan?.weekSummaries.map((summary) => summary.weekStartDate) ?? [];
    const anchor = planStarts[0] ?? currentWeekStart;
    const history = Array.from({ length: historyWeeks }, (_, index) => addDays(anchor, -7 * (historyWeeks - index)));
    const forward = planStarts.length
      ? planStarts
      : Array.from({ length: FUTURE_WEEKS_WITHOUT_PLAN + 1 }, (_, index) => addDays(anchor, 7 * index));
    return Array.from(new Set([...history, ...forward, currentWeekStart])).sort();
  }, [contextLoading, plan, currentWeekStart, historyWeeks]);

  useEffect(() => {
    const missing = weekStarts.filter((start) => !requestedStartsRef.current.has(start));
    if (!missing.length) {
      return;
    }
    missing.forEach((start) => requestedStartsRef.current.add(start));
    Promise.all(missing.map((start) => fetchJson<TrainingWeek>(`/api/weeks/${start}`)))
      .then((loadedWeeks) => {
        setWeeks((current) => ({
          ...current,
          ...Object.fromEntries(loadedWeeks.map((week) => [week.weekStartDate, week]))
        }));
        setWeeksError(null);
      })
      .catch((error) => {
        missing.forEach((start) => requestedStartsRef.current.delete(start));
        setWeeksError(error instanceof Error ? error.message : "Could not load the timeframe's weeks.");
      });
  }, [weekStarts]);

  const rules = useMemo(() => buildPlanRules({ defaultGoals, plan }), [defaultGoals, plan]);
  const allLoaded = weekStarts.length > 0 && weekStarts.every((start) => weeks[start]);

  const matrix = useMemo(() => {
    if (!allLoaded) {
      return null;
    }
    const today = todayDateString();
    const summariesByStart = new Map(plan?.weekSummaries.map((summary) => [summary.weekStartDate, summary]) ?? []);
    const planNumberByStart = new Map(
      plan?.weekSummaries.map((summary, index) => [summary.weekStartDate, index + 1]) ?? []
    );
    const mesocyclesById = new Map(plan?.mesocycles.map((mesocycle) => [mesocycle.id, mesocycle]) ?? []);
    const columns: MatrixColumn[] = weekStarts.map((weekStart) => {
      const week = weeks[weekStart];
      const summary = summariesByStart.get(weekStart) ?? null;
      const mesocycle = summary?.mesocycleId ? mesocyclesById.get(summary.mesocycleId) ?? null : null;
      return {
        weekStart,
        weekEnd: week.weekEndDate,
        summary,
        planWeekNumber: planNumberByStart.get(weekStart) ?? null,
        evaluations: evaluateRulesForWeek(rules, { week, summary, mesocycle }, today)
      };
    });
    return { columns, today };
  }, [allLoaded, plan, weekStarts, weeks, rules]);

  useEffect(() => {
    const scroller = scrollRef.current;
    const header = weekHeaderRefs.current.get(focusedWeek);
    if (!scroller || !header) return;
    const left = header.getBoundingClientRect().left - scroller.getBoundingClientRect().left + scroller.scrollLeft;
    const labelWidth = scroller.querySelector<HTMLElement>(".goal-impact-corner")?.offsetWidth ?? 208;
    scroller.scrollTo?.({
      left: Math.max(0, left - labelWidth - (scroller.clientWidth - labelWidth) / 2 + header.offsetWidth / 2),
      behavior: "instant"
    });
  }, [matrix, focusedWeek, centerRequest]);

  function focusWeek(weekStart: string) {
    setFocusedWeek(weekStart);
    setCenterRequest((current) => current + 1);
    setSelectedCell(null);
    setTooltip(null);
  }

  const summary = useMemo(
    () => (matrix ? summarizeRuleMatrix(matrix.columns.flatMap((column) => column.evaluations)) : null),
    [matrix]
  );

  // Weeks where the selected rule needs attention; null means no filter active.
  const affectedWeekStarts = useMemo(() => {
    if (!matrix || !selectedRuleId) {
      return null;
    }
    const affected = new Set(
      matrix.columns
        .filter((column) =>
          column.evaluations.some(
            (evaluation) => evaluation.ruleId === selectedRuleId && filterStatuses.has(evaluation.status)
          )
        )
        .map((column) => column.weekStart)
    );
    return affected.size > 0 ? affected : null;
  }, [matrix, selectedRuleId]);

  const error = contextError ?? weeksError;
  const isLoading = contextLoading || (!allLoaded && !error);

  return (
    <section className="settings-card goal-impact-card">
      <header className="settings-card-header goals-section-header">
        <div>
          <h2>Goal impact</h2>
        </div>
        <div className="goal-impact-controls">
          <nav className="goal-impact-week-nav" aria-label="Browse goal impact weeks">
            <button type="button" className="icon-button" aria-label="Previous week" title="Previous week" disabled={weekStarts.indexOf(focusedWeek) <= 0} onClick={() => focusWeek(weekStarts[weekStarts.indexOf(focusedWeek) - 1])}><ChevronLeft size={14} /></button>
            <button type="button" className="text-action" title={formatCompactWeekRange(currentWeekStart, addDays(currentWeekStart, 6))} onClick={() => focusWeek(currentWeekStart)}>Current week</button>
            <button type="button" className="icon-button" aria-label="Next week" title="Next week" disabled={weekStarts.indexOf(focusedWeek) >= weekStarts.length - 1} onClick={() => focusWeek(weekStarts[weekStarts.indexOf(focusedWeek) + 1])}><ChevronRight size={14} /></button>
          </nav>
        <div className="analytics-segmented-control goal-impact-history-control" aria-label="Matrix timeframe">
          <span>History</span>
          <div>
            {historyOptions.map((option) => (
              <button
                key={option}
                type="button"
                className={option === historyWeeks ? "active" : ""}
                onClick={() => setHistoryWeeks(option)}
              >
                {option}w
              </button>
            ))}
          </div>
        </div>
        </div>
      </header>

      {error ? <div className="settings-note settings-note--danger">{error}</div> : null}
      {!error && isLoading ? <div className="settings-note">Checking the timeframe against your goals…</div> : null}
      {!error && !isLoading && !plan ? (
        <div className="goals-empty-state goals-empty-state--compact">
          <Grid3x3 size={17} />
          <div>
            <strong>No active plan</strong>
            <span>Showing recent weeks only. Create a training plan to see goal coverage ahead.</span>
          </div>
        </div>
      ) : null}

      {!error && matrix && summary && matrix.columns.length > 0 ? (
        <>
          <p className="goal-impact-summary">
            Meeting all checks <strong>{summary.healthyWeeks} / {summary.evaluatedWeeks}</strong> evaluated week{summary.evaluatedWeeks === 1 ? "" : "s"}
            <span> · {summary.warningWeeks} warning{summary.warningWeeks === 1 ? "" : "s"}</span>
            <span> · {summary.failureWeeks} failing week{summary.failureWeeks === 1 ? "" : "s"}</span>
            <span> · {summary.pendingWeeks} pending</span>
          </p>

          <div className="goal-impact-scroll" ref={scrollRef}>
            <div
              className="goal-impact-grid"
              role="grid"
              aria-label="Goal status per week"
              style={{ gridTemplateColumns: `minmax(172px, 208px) repeat(${matrix.columns.length}, minmax(20px, 1fr))`, minWidth: Math.max(540, 208 + matrix.columns.length * 24) }}
            >
              <span className="goal-impact-corner" role="columnheader" aria-label="Goal" />
              {matrix.columns.map((column, index) => {
                const isCurrent = column.weekStart <= matrix.today && matrix.today <= column.weekEnd;
                const monthLabel = monthLabelFor(column.weekStart, matrix.columns[index - 1]?.weekStart ?? null);
                return (
                  <span
                    key={column.weekStart}
                    ref={(node) => { if (node) weekHeaderRefs.current.set(column.weekStart, node); else weekHeaderRefs.current.delete(column.weekStart); }}
                    role="columnheader"
                    className={`goal-impact-week-label${isCurrent ? " goal-impact-week-label--current" : ""}${
                      affectedWeekStarts && !affectedWeekStarts.has(column.weekStart)
                        ? " goal-impact-week-label--dimmed"
                        : ""
                    }`}
                    title={formatCompactWeekRange(column.weekStart, column.weekEnd)}
                  >
                    {monthLabel ?? (isCurrent ? "•" : "")}
                  </span>
                );
              })}

              <span className="goal-impact-plan-caption" role="rowheader">
                Plan
              </span>
              {matrix.columns.map((column) => {
                const active = column.summary !== null;
                const title = active
                  ? [plan?.name, column.summary?.mesocycleName, `Plan week ${column.planWeekNumber}`]
                      .filter(Boolean)
                      .join(" · ")
                  : "No plan this week";
                return (
                  <span
                    key={column.weekStart}
                    role="gridcell"
                    className={`goal-impact-plan-cell${
                      active ? ` goal-impact-plan-cell--active plan-phase--${column.summary?.mesocyclePhase ?? "base"}` : ""
                    }`}
                    title={title}
                    aria-label={title}
                  />
                );
              })}

              {rules.map((rule) => (
                <RuleRow
                  key={rule.id}
                  affectedWeekStarts={affectedWeekStarts}
                  columns={matrix.columns}
                  isSelected={selectedRuleId === rule.id}
                  isDimmed={selectedRuleId !== null && selectedRuleId !== rule.id}
                  rule={rule}
                  onSelectRule={() => setSelectedRuleId((current) => (current === rule.id ? null : rule.id))}
                  onSelectCell={setSelectedCell}
                  onShowTooltip={setTooltip}
                  onHideTooltip={() => setTooltip(null)}
                />
              ))}
            </div>
          </div>

          {selectedCell ? <div className="goal-impact-cell-detail" role="region" aria-label="Selected goal explanation" aria-live="polite">
            <strong>{selectedCell.evaluation.ruleLabel} · {ruleStatusLabels[selectedCell.evaluation.status]}</strong>
            <small>{selectedCell.weekLabel} · {selectedCell.evaluation.originLabel}</small>
            <p>{selectedCell.evaluation.reason}</p>
            {selectedCell.evaluation.metrics ? <small>{selectedCell.evaluation.metrics}</small> : null}
            <div><button type="button" className="text-action" onClick={() => onSelectWeek(selectedCell.weekStart)}>View week</button>
            <button type="button" className="text-action" onClick={() => setSelectedCell(null)}>Close explanation</button></div>
          </div> : null}
          <footer className="goal-impact-legend" aria-hidden="true">
            {legendStatuses.map((status) => (
              <span key={status} className="goal-impact-legend-item">
                <span className={`goal-impact-cell goal-impact-cell--legend goal-impact-cell--${status}`} />
                {ruleStatusLabels[status]}
              </span>
            ))}
            <span className="goal-impact-legend-item">
              <span className="goal-impact-plan-cell goal-impact-plan-cell--active goal-impact-plan-cell--legend plan-phase--base" />
              Plan active
            </span>
          </footer>
        </>
      ) : null}

      {tooltip ? <CellPopover tooltip={tooltip} /> : null}
    </section>
  );
}

function RuleRow({
  affectedWeekStarts,
  columns,
  isDimmed,
  isSelected,
  onHideTooltip,
  onSelectRule,
  onSelectCell,
  onShowTooltip,
  rule
}: {
  affectedWeekStarts: Set<string> | null;
  columns: MatrixColumn[];
  isDimmed: boolean;
  isSelected: boolean;
  onHideTooltip: () => void;
  onSelectRule: () => void;
  onSelectCell: (cell: { evaluation: RuleEvaluation; weekLabel: string; weekStart: string }) => void;
  onShowTooltip: (tooltip: CellTooltip) => void;
  rule: PlanRule;
}) {
  return (
    <>
      <button
        type="button"
        role="rowheader"
        className={`goal-impact-rule-label${isSelected ? " goal-impact-rule-label--selected" : ""}${
          isDimmed ? " goal-impact-rule-label--dimmed" : ""
        }`}
        title={isSelected ? "Clear highlight" : `Highlight weeks affected by "${rule.label}"`}
        aria-pressed={isSelected}
        onClick={onSelectRule}
      >
        {rule.label}
      </button>
      {columns.map((column) => {
        const evaluation = column.evaluations.find((candidate) => candidate.ruleId === rule.id);
        if (!evaluation) {
          return <span key={column.weekStart} className="goal-impact-cell goal-impact-cell--not_applicable" />;
        }
        const range = formatCompactWeekRange(column.weekStart, column.weekEnd);
        const weekLabel = column.planWeekNumber ? `Plan week ${column.planWeekNumber} · ${range}` : range;
        const dimCell = affectedWeekStarts !== null && !affectedWeekStarts.has(column.weekStart);
        return (
          <button
            key={column.weekStart}
            type="button"
            role="gridcell"
            className={`goal-impact-cell goal-impact-cell--${evaluation.status}${dimCell ? " goal-impact-cell--dimmed" : ""}`}
            aria-label={`${rule.label}, ${weekLabel}: ${ruleStatusLabels[evaluation.status]}. ${evaluation.reason}`}
            onMouseEnter={(event) => onShowTooltip(buildTooltip(evaluation, weekLabel, event.currentTarget))}
            onFocus={(event) => onShowTooltip(buildTooltip(evaluation, weekLabel, event.currentTarget))}
            onMouseLeave={onHideTooltip}
            onBlur={onHideTooltip}
            onClick={() => { onHideTooltip(); onSelectCell({ evaluation, weekLabel, weekStart: column.weekStart }); }}
          />
        );
      })}
    </>
  );
}

function monthLabelFor(weekStart: string, previousWeekStart: string | null) {
  const month = parseDate(weekStart).getMonth();
  if (previousWeekStart === null || parseDate(previousWeekStart).getMonth() !== month) {
    return monthFormatter.format(parseDate(weekStart));
  }
  return null;
}

function buildTooltip(evaluation: RuleEvaluation, weekLabel: string, cell: HTMLElement): CellTooltip {
  const rect = cell.getBoundingClientRect();
  const halfWidth = Math.min(280, window.innerWidth - 32) / 2;
  return {
    evaluation,
    weekLabel,
    left: Math.min(window.innerWidth - halfWidth - 16, Math.max(halfWidth + 16, rect.left + rect.width / 2)),
    top: rect.top - 8
  };
}

function CellPopover({ tooltip }: { tooltip: CellTooltip }) {
  const { evaluation, weekLabel } = tooltip;
  return (
    <div className="goal-impact-popover" role="tooltip" style={{ left: tooltip.left, top: tooltip.top }}>
      <div className="goal-impact-popover-header">
        <strong>{evaluation.ruleLabel}</strong>
        <span className={`goal-impact-status-pill goal-impact-status-pill--${evaluation.status}`}>
          {ruleStatusLabels[evaluation.status]}
        </span>
      </div>
      <span className="goal-impact-popover-week">{weekLabel}</span>
      <small>{evaluation.originLabel}</small>
      <p>{evaluation.reason}</p>
      {evaluation.metrics ? <small>{evaluation.metrics}</small> : null}
      {attentionStatuses.has(evaluation.status) ? <small className="goal-impact-popover-hint">Select to see details and open the week.</small> : null}
    </div>
  );
}

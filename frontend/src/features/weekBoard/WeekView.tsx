import { ArrowRightLeft, CalendarClock, Check, ChevronRight, Circle, Copy, Edit3, Ellipsis, ExternalLink, Minus, Plus, Trash2, X } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { TrainingTimeRail } from "../../components/time-rail/TrainingTimeRail";
import { MileageTrendBadge } from "../../components/shared/MileageTrendBadge";
import { WeekChecksCard } from "../../components/week/WeekChecksCard";
import { WeekCommandCenter } from "../../components/week/WeekCommandCenter";
import { WeekContextStrip } from "../../components/week/WeekContextStrip";
import { WeekReviewHandoff } from "../../components/week/WeekReviewHandoff";
import { buildWeekCommandCenterViewModel } from "../weekGoals/buildWeekCommandCenterViewModel";
import { buildWeekContextStrip } from "./buildWeekContextStrip";
import type { TrainingTimelineIndex } from "../../hooks/useTrainingTimeline";
import type { ActualActivity, PerformedSession, TrainingPlan, TrainingWeek, WeekGoal, Workout } from "../../types/domain";
import { addDays, startOfWeek } from "../../lib/dates";
import { useModalDialog } from "../../hooks/useModalDialog";
import {
  formatCompactWeekRange,
  formatCompactWeekRangeFromStart,
  formatHardDays,
  formatLongRun,
  formatMileageTrendAriaLabel,
  formatDayNumber,
  formatNumber,
  formatPace,
  formatShortDate,
  formatTime,
  formatWeekRangeFromStart,
  formatWeekday,
  formatWeekdayShort,
  formatWorkoutMeta,
  getCollapsedMileageTrend,
  labelForWorkoutType
} from "../../lib/formatters";

export function WeekView({
  activePlan,
  canLoadNewerWeeks,
  canLoadOlderWeeks,
  currentWeekStart,
  isLoading,
  onJumpToThisWeek,
  onLoadNewerWeeks,
  onLoadOlderWeeks,
  onDismissReviewHandoff,
  onOpenPlan,
  onPlanNextWeek,
  onSelectTimeWeek,
  onSelectWeek,
  onSkipReview,
  selectedWeekStart,
  reviewHandoff,
  timelineIndex,
  today,
  week,
  weekStack,
  weekStarts,
  onCreate,
  onEdit,
  onEditPerformedSession,
  onDelete,
  onDuplicate,
  onDuplicateToDate,
  onMove,
  onSwap,
  onCreateGoal,
  onCopyPriorWeek,
  onDeriveWeekGoals,
  onEditGoal,
  onOpenPlanWeek,
  onSync,
  copyingPriorWeekId
}: {
  activePlan: TrainingPlan | null;
  canLoadNewerWeeks: boolean;
  canLoadOlderWeeks: boolean;
  currentWeekStart: string;
  isLoading: boolean;
  onJumpToThisWeek: () => void;
  onLoadNewerWeeks: () => void;
  onLoadOlderWeeks: () => void;
  onDismissReviewHandoff: () => void;
  onOpenPlan: () => void;
  onPlanNextWeek: (weekStartDate: string) => void;
  onSelectTimeWeek: (weekStart: string) => void;
  onSelectWeek: (weekStart: string) => void;
  onSkipReview: (weekId: string) => void;
  selectedWeekStart: string;
  reviewHandoff: { nextWeekStart: string; reviewedWeekStart: string; wasEmpty: boolean } | null;
  timelineIndex: TrainingTimelineIndex;
  today: string;
  week: TrainingWeek | null;
  weekStack: Record<string, TrainingWeek>;
  weekStarts: string[];
  onCreate: (plannedDate: string) => void;
  onEdit: (workout: Workout, performedSession?: PerformedSession | null) => void;
  onEditPerformedSession?: (session: PerformedSession) => void;
  onDelete: (workout: Workout) => void;
  onDuplicate: (workout: Workout) => void;
  onDuplicateToDate: (workout: Workout, plannedDate: string) => void;
  onMove: (workout: Workout, plannedDate: string) => void;
  onSwap: (workout: Workout, otherWorkout: Workout) => void;
  onCreateGoal: (week: TrainingWeek) => void;
  onCopyPriorWeek: (week: TrainingWeek) => void;
  onDeriveWeekGoals: (week: TrainingWeek) => void;
  onEditGoal: (goal: WeekGoal) => void;
  onOpenPlanWeek: (week: TrainingWeek) => void;
  onSync: () => void;
  copyingPriorWeekId: string | null;
}) {
  const newerWeeksSentinelRef = useRef<HTMLDivElement | null>(null);
  const olderWeeksSentinelRef = useRef<HTMLDivElement | null>(null);
  const timelineRef = useRef<HTMLElement | null>(null);
  const [workoutDetail, setWorkoutDetail] = useState<{ workout: Workout; session: PerformedSession | null } | null>(null);
  const [scheduleAction, setScheduleAction] = useState<{ kind: "move" | "copy"; workout: Workout } | null>(null);
  const contextStrip = buildWeekContextStrip({
    plan: activePlan,
    currentWeek: weekStack[currentWeekStart] ?? null,
    currentWeekStart,
    today
  });
  const selectedWeekIsVisible = weekStarts.includes(selectedWeekStart);
  const selectedWeekIsLoaded = Boolean(weekStack[selectedWeekStart]);

  useLayoutEffect(() => {
    const timeline = timelineRef.current;
    if (!timeline || !selectedWeekIsVisible) {
      return;
    }

    const selectedRow = Array.from(timeline.querySelectorAll<HTMLElement>("[data-week-start]")).find(
      (row) => row.dataset.weekStart === selectedWeekStart
    );
    if (!selectedRow) {
      return;
    }

    // Replacing the expanded row changes the timeline height. Position immediately
    // so a smooth scroll cannot be interrupted by history loading or scroll anchoring.
    scrollExpandedWeekIntoView(selectedRow, "auto");
    // Settle after the app has restored any prepended history in its layout effect.
    const frame = window.requestAnimationFrame(() => {
      scrollExpandedWeekIntoView(selectedRow, "auto");
    });
    return () => window.cancelAnimationFrame(frame);
  }, [contextStrip?.kind, selectedWeekIsLoaded, selectedWeekIsVisible, selectedWeekStart]);

  useEffect(() => {
    const sentinel = olderWeeksSentinelRef.current;
    const root = sentinel?.closest("main");
    if (!sentinel || !(root instanceof HTMLElement) || !canLoadOlderWeeks || !selectedWeekIsLoaded || isLoading) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onLoadOlderWeeks();
        }
      },
      {
        root: window.matchMedia("(max-width: 860px)").matches ? null : root,
        rootMargin: "0px",
        threshold: 0
      }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [canLoadOlderWeeks, isLoading, onLoadOlderWeeks, selectedWeekIsLoaded]);

  useEffect(() => {
    const sentinel = newerWeeksSentinelRef.current;
    const root = sentinel?.closest("main");
    if (!sentinel || !(root instanceof HTMLElement) || !canLoadNewerWeeks || !selectedWeekIsLoaded || isLoading) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onLoadNewerWeeks();
        }
      },
      {
        root: window.matchMedia("(max-width: 860px)").matches ? null : root,
        rootMargin: "0px 0px 520px",
        threshold: 0
      }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [canLoadNewerWeeks, isLoading, onLoadNewerWeeks, selectedWeekIsLoaded]);

  return (
    <>
      <WeekContextStrip
        viewModel={contextStrip}
        onJumpToToday={() => {
          const target = timelineRef.current?.querySelector<HTMLElement>(".day-column--today")
            ?? timelineRef.current?.querySelector<HTMLElement>(".week-row--expanded");
          if (selectedWeekStart === currentWeekStart && target) {
            scrollExpandedWeekIntoView(target, "smooth");
          } else {
            onJumpToThisWeek();
          }
        }}
        onOpenPlan={onOpenPlan}
      />
      {reviewHandoff && reviewHandoff.reviewedWeekStart === week?.weekStartDate ? (
        <WeekReviewHandoff
          nextWeekStart={reviewHandoff.nextWeekStart}
          onDismiss={onDismissReviewHandoff}
          onPlanNextWeek={onPlanNextWeek}
          wasEmpty={reviewHandoff.wasEmpty}
        />
      ) : null}
      <section className="week-stack-layout" aria-busy={isLoading}>
        <section className="week-timeline" aria-label="Training week timeline" ref={timelineRef}>
        <div className="week-stack-sentinel" aria-hidden="true" ref={olderWeeksSentinelRef} />
        {weekStarts.map((start) => (
          <WeekRow
            activePlan={activePlan}
            key={start}
            isExpanded={start === selectedWeekStart}
            isLoading={isLoading && start === selectedWeekStart}
            onCreate={onCreate}
            onDelete={onDelete}
            onDuplicate={onDuplicate}
            onEdit={onEdit}
            onOpenWorkout={(workout, session) => setWorkoutDetail({ workout, session: session ?? null })}
            onEditPerformedSession={onEditPerformedSession}
            onCreateGoal={onCreateGoal}
            onCopyPriorWeek={onCopyPriorWeek}
            onDeriveWeekGoals={onDeriveWeekGoals}
            onEditGoal={onEditGoal}
            onOpenPlanWeek={onOpenPlanWeek}
            onSkipReview={onSkipReview}
            onSync={onSync}
            onScheduleAction={(kind, workout) => setScheduleAction({ kind, workout })}
            isCopyingPriorWeek={(start === selectedWeekStart ? week : weekStack[start])?.id === copyingPriorWeekId}
            onSelectWeek={onSelectWeek}
            selectedWeekStart={selectedWeekStart}
            previousWeek={weekStack[addDays(start, -7)]}
            today={today}
            week={start === selectedWeekStart ? week : weekStack[start]}
            weekStart={start}
          />
        ))}
        <div className="week-stack-sentinel" aria-hidden="true" ref={newerWeeksSentinelRef} />
        </section>

        <TrainingTimeRail
          index={timelineIndex}
          onJumpToThisWeek={onJumpToThisWeek}
          onSelectWeek={onSelectTimeWeek}
        />
      </section>
      {workoutDetail ? (
        <WorkoutDetailDialog
          readOnly={week?.weekState === "past"}
          session={workoutDetail.session}
          workout={workoutDetail.workout}
          onClose={() => setWorkoutDetail(null)}
          onEdit={() => {
            setWorkoutDetail(null);
            if (workoutDetail.session) {
              onEdit(workoutDetail.workout, workoutDetail.session);
            } else {
              onEdit(workoutDetail.workout);
            }
          }}
        />
      ) : null}
      {scheduleAction ? (
        <ScheduleWorkoutDialog
          action={scheduleAction.kind}
          candidates={(week?.workouts ?? []).filter(
            (candidate) => candidate.id !== scheduleAction.workout.id && candidate.sport !== "rest"
          )}
          workout={scheduleAction.workout}
          onClose={() => setScheduleAction(null)}
          onCopy={(plannedDate) => {
            onDuplicateToDate(scheduleAction.workout, plannedDate);
            setScheduleAction(null);
          }}
          onMove={(plannedDate) => {
            onMove(scheduleAction.workout, plannedDate);
            setScheduleAction(null);
          }}
          onSwap={(otherWorkout) => {
            onSwap(scheduleAction.workout, otherWorkout);
            setScheduleAction(null);
          }}
        />
      ) : null}
    </>
  );
}

function WeekRow({
  activePlan,
  isExpanded,
  isLoading,
  onCreate,
  onDelete,
  onDuplicate,
  onEdit,
  onOpenWorkout,
  onEditPerformedSession,
  onCreateGoal,
  onCopyPriorWeek,
  onDeriveWeekGoals,
  onEditGoal,
  onOpenPlanWeek,
  onSkipReview,
  onSync,
  onScheduleAction,
  isCopyingPriorWeek,
  onSelectWeek,
  selectedWeekStart,
  previousWeek,
  today,
  week,
  weekStart
}: {
  activePlan: TrainingPlan | null;
  isExpanded: boolean;
  isLoading: boolean;
  onCreate: (plannedDate: string) => void;
  onDelete: (workout: Workout) => void;
  onDuplicate: (workout: Workout) => void;
  onEdit: (workout: Workout, performedSession?: PerformedSession | null) => void;
  onOpenWorkout: (workout: Workout, performedSession?: PerformedSession | null) => void;
  onEditPerformedSession?: (session: PerformedSession) => void;
  onCreateGoal: (week: TrainingWeek) => void;
  onCopyPriorWeek: (week: TrainingWeek) => void;
  onDeriveWeekGoals: (week: TrainingWeek) => void;
  onEditGoal: (goal: WeekGoal) => void;
  onOpenPlanWeek: (week: TrainingWeek) => void;
  onSkipReview: (weekId: string) => void;
  onSync: () => void;
  onScheduleAction: (kind: "move" | "copy", workout: Workout) => void;
  isCopyingPriorWeek: boolean;
  onSelectWeek: (weekStart: string) => void;
  selectedWeekStart: string;
  previousWeek?: TrainingWeek;
  today: string;
  week?: TrainingWeek | null;
  weekStart: string;
}) {
  const isPast = weekStart < selectedWeekStart;
  const tone: CollapsedWeekTone = week?.weekState === "current" ? "current" : isPast ? "past" : "future";

  return (
    <div
      className={`week-row ${isExpanded ? "week-row--expanded" : ""}`}
      data-week-start={weekStart}
      data-testid="week-row"
    >
      <div className="week-row-content">
        {isExpanded ? (
          <ExpandedWeekBoard
            days={Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))}
            isLoading={!week}
            onCreate={onCreate}
            onDelete={onDelete}
            onDuplicate={onDuplicate}
            onEdit={onEdit}
            onOpenWorkout={onOpenWorkout}
            onEditPerformedSession={onEditPerformedSession}
            onCreateGoal={onCreateGoal}
            onCopyPriorWeek={onCopyPriorWeek}
            onDeriveWeekGoals={onDeriveWeekGoals}
            onEditGoal={onEditGoal}
            onOpenPlanWeek={onOpenPlanWeek}
            onSkipReview={onSkipReview}
            onSync={onSync}
            onScheduleAction={onScheduleAction}
            isCopyingPriorWeek={isCopyingPriorWeek}
            today={today}
            week={week ?? null}
            weekStart={weekStart}
          />
        ) : (
          <CollapsedWeekCard
            activePlan={activePlan}
            onSelectWeek={onSelectWeek}
            previousWeek={previousWeek}
            tone={tone}
            week={week ?? undefined}
            weekStart={weekStart}
          />
        )}
      </div>
    </div>
  );
}

type CollapsedWeekTone = "past" | "current" | "future";

function CollapsedWeekCard({
  activePlan,
  onSelectWeek,
  previousWeek,
  tone,
  week,
  weekStart
}: {
  activePlan: TrainingPlan | null;
  onSelectWeek: (weekStart: string) => void;
  previousWeek?: TrainingWeek;
  tone: CollapsedWeekTone;
  week?: TrainingWeek;
  weekStart: string;
}) {
  const range = week ? formatCompactWeekRange(week.weekStartDate, week.weekEndDate) : formatCompactWeekRangeFromStart(weekStart);
  const mileageSummary = formatCollapsedMileageSummary(week, weekStart, tone, activePlan);
  const mileageTrend = getCollapsedMileageTrend(week, previousWeek);
  const detail = formatCollapsedWeekDetail(week);
  const dayBadges = collapsedWeekDayBadges(week, weekStart);
  const dailySummary = dayBadges.map((badge) => `${formatWeekday(badge.date)} ${badge.label}`).join(", ");
  const trendSummary = mileageTrend ? `, ${formatMileageTrendAriaLabel(mileageTrend)}` : "";

  return (
    <button
      className={`week-preview-card ${tone}`}
      data-testid="week-preview-card"
      data-week-start={weekStart}
      type="button"
      aria-label={`Go to week ${range}, ${dailySummary}, ${mileageSummary}${trendSummary}, ${detail}`}
      onClick={() => onSelectWeek(weekStart)}
    >
      <span className="week-peek-range">{range}</span>
      <span className="week-peek-days" aria-hidden="true">
        {dayBadges.map((badge) => (
          <span className={`week-peek-day-badge ${badge.kind}`} key={badge.date} title={badge.title}>
            {badge.label}
          </span>
        ))}
      </span>
      <small className="week-peek-summary">
        <span>{mileageSummary}</span>
        <MileageTrendBadge compact trend={mileageTrend} />
      </small>
      <ChevronRight className="week-peek-icon" size={16} aria-hidden="true" />
    </button>
  );
}

function ExpandedWeekBoard({
  days,
  isLoading,
  week,
  weekStart,
  onCreate,
  onEdit,
  onEditPerformedSession,
  onDelete,
  onDuplicate,
  onCreateGoal,
  onCopyPriorWeek,
  onDeriveWeekGoals,
  onEditGoal,
  onOpenWorkout,
  onOpenPlanWeek,
  onSkipReview,
  onSync,
  onScheduleAction,
  isCopyingPriorWeek,
  today,
}: {
  days: string[];
  isLoading?: boolean;
  week: TrainingWeek | null;
  weekStart: string;
  onCreate: (plannedDate: string) => void;
  onEdit: (workout: Workout, performedSession?: PerformedSession | null) => void;
  onEditPerformedSession?: (session: PerformedSession) => void;
  onDelete: (workout: Workout) => void;
  onDuplicate: (workout: Workout) => void;
  onCreateGoal: (week: TrainingWeek) => void;
  onCopyPriorWeek: (week: TrainingWeek) => void;
  onDeriveWeekGoals: (week: TrainingWeek) => void;
  onEditGoal: (goal: WeekGoal) => void;
  onOpenWorkout: (workout: Workout, performedSession?: PerformedSession | null) => void;
  onOpenPlanWeek: (week: TrainingWeek) => void;
  onSkipReview: (weekId: string) => void;
  onSync: () => void;
  onScheduleAction: (kind: "move" | "copy", workout: Workout) => void;
  isCopyingPriorWeek: boolean;
  today: string;
}) {
  const workouts = week?.workouts ?? [];
  const actualActivities = week?.actualActivities ?? [];

  if (isLoading) {
    return (
      <div
        className="expanded-week-board expanded-week-board--loading"
        aria-label={`Loading ${formatWeekRangeFromStart(weekStart)}`}
      >
        <section className="week-command-center" aria-label="Loading week command center">
          <header className="week-command-header">
            <div className="week-command-title">
              <div className="week-command-meta">
                <p className="eyebrow">Training week</p>
                <span className="week-command-mode">Loading week</span>
              </div>
              <h1>{formatWeekRangeFromStart(weekStart)}</h1>
            </div>
          </header>
          <ExpandedWeekSkeletonOverview />
        </section>
        <ExpandedWeekSkeleton days={days} />
      </div>
    );
  }

  return (
    <WeekSlate
      actualActivities={actualActivities}
      days={days}
      onCopyPriorWeek={onCopyPriorWeek}
      onCreate={onCreate}
      onCreateGoal={onCreateGoal}
      onDelete={onDelete}
      onDeriveWeekGoals={onDeriveWeekGoals}
      onDuplicate={onDuplicate}
      onEdit={onEdit}
      onOpenWorkout={onOpenWorkout}
      onEditPerformedSession={onEditPerformedSession}
      onEditGoal={onEditGoal}
      onOpenPlanWeek={onOpenPlanWeek}
      onSkipReview={onSkipReview}
      onSync={onSync}
      onScheduleAction={onScheduleAction}
      today={today}
      week={week}
      workouts={workouts}
    />
  );
}

function WeekSlate({
  actualActivities,
  days,
  onCopyPriorWeek,
  onCreate,
  onCreateGoal,
  onDelete,
  onDeriveWeekGoals,
  onDuplicate,
  onEdit,
  onEditPerformedSession,
  onEditGoal,
  onOpenWorkout,
  onOpenPlanWeek,
  onSkipReview,
  onSync,
  onScheduleAction,
  today,
  week,
  workouts
}: {
  actualActivities: ActualActivity[];
  days: string[];
  onCopyPriorWeek: (week: TrainingWeek) => void;
  onCreate: (plannedDate: string) => void;
  onCreateGoal: (week: TrainingWeek) => void;
  onDelete: (workout: Workout) => void;
  onDeriveWeekGoals: (week: TrainingWeek) => void;
  onDuplicate: (workout: Workout) => void;
  onEdit: (workout: Workout, performedSession?: PerformedSession | null) => void;
  onEditPerformedSession?: (session: PerformedSession) => void;
  onEditGoal: (goal: WeekGoal) => void;
  onOpenWorkout: (workout: Workout, performedSession?: PerformedSession | null) => void;
  onOpenPlanWeek: (week: TrainingWeek) => void;
  onSkipReview: (weekId: string) => void;
  onSync: () => void;
  onScheduleAction: (kind: "move" | "copy", workout: Workout) => void;
  today: string;
  week: TrainingWeek | null | undefined;
  workouts: Workout[];
}) {
  if (!week) {
    return <div className="expanded-week-board" />;
  }

  const viewModel = buildWeekCommandCenterViewModel({ week, today });
  const performedSessions = (week.performedSessions ?? []).filter(
    (session) => session.recordings.length > 0
  );

  return (
    <section className={`expanded-week-board week-slate week-slate--${viewModel.mode}`} aria-label="Selected training week">
      <WeekCommandCenter
        viewModel={viewModel}
        onAction={(actionId) =>
          handleWeekCommandAction(actionId, {
            onCopyPriorWeek,
            onCreateGoal,
            onDeriveWeekGoals,
            onEditGoal,
            onOpenPlanWeek,
            onSkipReview,
            onSync,
            week
          })
        }
      />

      {!viewModel.isUnplanned ? (
        <WeekChecksCard week={week} onEditWorkout={onEdit} onOpenPlanWeek={onOpenPlanWeek} />
      ) : null}

      {!viewModel.isUnplanned ? (
        <WeekSchedule
          actualActivities={actualActivities}
          days={days}
          onCreate={onCreate}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          onEdit={onEdit}
          onOpenWorkout={onOpenWorkout}
          onEditPerformedSession={onEditPerformedSession}
          performedSessions={performedSessions}
          onScheduleAction={onScheduleAction}
          today={today}
          readOnly={week.weekState === "past"}
          workouts={workouts}
        />
      ) : null}
    </section>
  );
}

function WorkoutDetailDialog({
  onClose,
  onEdit,
  readOnly,
  session,
  workout
}: {
  onClose: () => void;
  onEdit: () => void;
  readOnly: boolean;
  session: PerformedSession | null;
  workout: Workout;
}) {
  const dialogRef = useRef<HTMLElement | null>(null);
  useModalDialog({ dialogRef, onDismiss: onClose });
  const blocks = workout.prescription?.blocks ?? [];

  return (
    <div className="editor-backdrop">
      <aside
        aria-label={`${workout.title} workout details`}
        aria-modal="true"
        className="editor-panel workout-detail-panel"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header>
          <div>
            <span>{formatWeekday(workout.plannedDate)} · {formatShortDate(workout.plannedDate)}</span>
            <h2>{workout.title}</h2>
          </div>
          <button aria-label="Close workout details" type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="workout-detail-body">
          <div className="workout-detail-summary">
            <strong>{sessionMetrics(workout)}</strong>
            <span>{labelForWorkoutType(workout.workoutType)}</span>
            <span>{session ? outcomeLabel(session.outcome) : "Planned"}</span>
          </div>
          {workout.purpose ? (
            <section>
              <h3>Purpose</h3>
              <p>{workout.purpose}</p>
            </section>
          ) : null}
          <section>
            <h3>Instructions</h3>
            <p className="workout-detail-instructions">
              {workout.instructions || "No additional instructions for this session."}
            </p>
          </section>
          {blocks.length ? (
            <section>
              <h3>Workout structure</h3>
              <ol className="workout-detail-blocks">
                {blocks.map((block, index) => (
                  <li key={block.id ?? `${block.kind}-${index}`}>{formatPrescriptionBlock(block)}</li>
                ))}
              </ol>
            </section>
          ) : null}
          {session ? (
            <section>
              <h3>Completed work</h3>
              <p>{sessionStatsLabel(session)} · {outcomeLabel(session.outcome)}</p>
            </section>
          ) : null}
        </div>
        <footer className="workout-detail-actions">
          <button type="button" onClick={onClose}>Close</button>
          {!readOnly ? (
            <button className="primary" type="button" onClick={onEdit}>
              <Edit3 size={16} aria-hidden="true" />
              Edit
            </button>
          ) : null}
        </footer>
      </aside>
    </div>
  );
}

function ScheduleWorkoutDialog({
  action,
  candidates,
  onClose,
  onCopy,
  onMove,
  onSwap,
  workout
}: {
  action: "move" | "copy";
  candidates: Workout[];
  onClose: () => void;
  onCopy: (plannedDate: string) => void;
  onMove: (plannedDate: string) => void;
  onSwap: (workout: Workout) => void;
  workout: Workout;
}) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const [plannedDate, setPlannedDate] = useState(workout.plannedDate);
  const [swapId, setSwapId] = useState(candidates[0]?.id ?? "");
  useModalDialog({ dialogRef, onDismiss: onClose });

  return (
    <div className="editor-backdrop">
      <aside
        aria-label={action === "copy" ? "Copy workout to date" : "Move or swap workout"}
        aria-modal="true"
        className="editor-panel schedule-workout-panel"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header>
          <div>
            <span>{workout.title}</span>
            <h2>{action === "copy" ? "Copy to a date" : "Move or swap"}</h2>
          </div>
          <button aria-label="Close schedule action" type="button" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="schedule-workout-body">
          <label>
            <span>{action === "copy" ? "Copy date" : "Move date"}</span>
            <input type="date" value={plannedDate} onChange={(event) => setPlannedDate(event.target.value)} />
          </label>
          <button
            className="primary"
            disabled={!plannedDate || (action === "move" && plannedDate === workout.plannedDate)}
            type="button"
            onClick={() => action === "copy" ? onCopy(plannedDate) : onMove(plannedDate)}
          >
            {action === "copy" ? "Copy workout" : "Move workout"}
          </button>
          {action === "move" && candidates.length ? (
            <div className="schedule-swap-control">
              <span>Or swap days with</span>
              <select aria-label="Workout to swap with" value={swapId} onChange={(event) => setSwapId(event.target.value)}>
                {candidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {formatWeekday(candidate.plannedDate)} · {candidate.title}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => {
                const candidate = candidates.find((item) => item.id === swapId);
                if (candidate) onSwap(candidate);
              }}>
                <ArrowRightLeft size={15} aria-hidden="true" />
                Swap days
              </button>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function formatPrescriptionBlock(block: NonNullable<Workout["prescription"]>["blocks"][number]): string {
  if (block.kind === "repeat") {
    const steps = block.steps.map(formatPrescriptionBlock).join("; ");
    return `${block.repetitions} × ${steps}${block.recoveryAfterFinal ? " · recovery after final rep" : ""}`;
  }
  const role = block.role === "warmup" ? "Warm-up" : block.role === "cooldown" ? "Cool-down" : `${block.role[0].toUpperCase()}${block.role.slice(1)}`;
  const extent = block.extent === "distance"
    ? formatPrescriptionDistance(block.distanceMeters ?? 0, block.displayUnit)
    : block.extent === "duration"
      ? `${formatNumber((block.durationSeconds ?? 0) / 60)} min`
      : "Open";
  const guidance = block.primaryTarget?.guidance || block.notes;
  return `${extent} ${role}${guidance ? ` · ${guidance}` : ""}`;
}

function formatPrescriptionDistance(meters: number, unit?: string | null) {
  if (unit === "km") return `${formatNumber(meters / 1000)} km`;
  if (unit === "m") return `${formatNumber(meters)} m`;
  return `${formatNumber(meters / 1609.344)} mi`;
}

function WeekSchedule({
  actualActivities,
  days,
  onCreate,
  onDelete,
  onDuplicate,
  onEdit,
  onOpenWorkout,
  onEditPerformedSession,
  performedSessions,
  onScheduleAction,
  readOnly,
  today,
  workouts
}: {
  actualActivities: ActualActivity[];
  days: string[];
  onCreate: (plannedDate: string) => void;
  onDelete: (workout: Workout) => void;
  onDuplicate: (workout: Workout) => void;
  onEdit: (workout: Workout, performedSession?: PerformedSession | null) => void;
  onOpenWorkout: (workout: Workout, performedSession?: PerformedSession | null) => void;
  onEditPerformedSession?: (session: PerformedSession) => void;
  performedSessions: PerformedSession[];
  onScheduleAction: (kind: "move" | "copy", workout: Workout) => void;
  readOnly: boolean;
  today: string;
  workouts: Workout[];
}) {
  return (
    <section className="week-schedule-panel" aria-label="Weekly schedule">
      <header>
        <h2>Schedule</h2>
        {!days.includes(today) ? <span className="schedule-range">{formatCompactWeekRange(days[0], days[6])}</span> : null}
      </header>
      <div className="week-board">
        {days.map((dateValue) => {
          const dayWorkouts = workouts.filter((workout) => workout.plannedDate === dateValue);
          const dayActuals = actualActivities.filter((activity) => activity.activityDate === dateValue);
          const hasDaySession = performedSessions.some(
            (session) =>
              session.occurredAt.slice(0, 10) === dateValue ||
              dayWorkouts.some((workout) => workout.id === session.plannedWorkoutId)
          );
          const isEmpty = dayWorkouts.length === 0 && dayActuals.length === 0 && !hasDaySession;
          const isToday = dateValue === today;
          const isCompactDay =
            !isToday &&
            dayActuals.length === 0 &&
            !hasDaySession &&
            dayWorkouts.every(
              (workout) => workout.sport === "rest" || workout.intensityCategory === "rest"
            );
          const entries = buildDayEntries(
            dateValue,
            dayWorkouts,
            dayActuals,
            performedSessions,
            actualActivities,
            workouts
          );
          return (
            <article
              className={`day-column ${dayColumnClass(dayWorkouts, dayActuals, isEmpty, isToday)}${
                isCompactDay ? " day-column--compact" : ""
              }`}
              key={dateValue}
              aria-label={`${isToday ? "Today, " : ""}${formatWeekday(dateValue)}, ${formatShortDate(dateValue)}`}
            >
              <header>
                <div>
                  <span>{formatWeekdayShort(dateValue)}</span>
                  <strong>{formatDayNumber(dateValue)}</strong>
                  {isToday ? <small>Today</small> : null}
                </div>
              </header>
              <div className="workout-stack">
                {entries.map((entry) =>
                  entry.kind === "unplanned" ? (
                    <PerformedSessionItem
                      activities={entry.activities}
                      key={`session-${entry.session.id}`}
                      onEdit={onEditPerformedSession}
                      session={entry.session}
                    />
                  ) : entry.kind === "raw" ? (
                    <ActualActivityItem activity={entry.actual} key={`actual-${entry.actual.id}`} />
                  ) : (
                    <WorkoutItem
                      key={entry.workout.id}
                      workout={entry.workout}
                      activities={entry.activities}
                      hasPendingMatch={entry.hasPendingMatch}
                      session={entry.session}
                      today={today}
                      onDelete={onDelete}
                      onDuplicate={onDuplicate}
                      onEdit={onEdit}
                      onOpen={onOpenWorkout}
                      onScheduleAction={onScheduleAction}
                      readOnly={readOnly}
                    />
                  )
                )}
                {isEmpty && dateValue < today ? (
                  <span aria-label="No session planned" className="empty-day-action empty-day-action--static">—</span>
                ) : null}
                {dateValue >= today && !readOnly ? (
                  <div className={`day-actions${!isToday && !isEmpty ? " day-actions--quiet" : ""}`}>
                    <button
                      aria-label={`Add session to ${formatWeekday(dateValue)}`}
                      className={`day-add-session${isEmpty ? " day-add-session--empty" : ""}`}
                      type="button"
                      onClick={() => onCreate(dateValue)}
                    >
                      <Plus aria-hidden="true" size={15} />
                      <span>Plan</span>
                    </button>
                  </div>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function handleWeekCommandAction(
  actionId: string,
  {
    onCopyPriorWeek,
    onCreateGoal,
    onDeriveWeekGoals,
    onEditGoal,
    onOpenPlanWeek,
    onSkipReview,
    onSync,
    week
  }: {
    onCopyPriorWeek: (week: TrainingWeek) => void;
    onCreateGoal: (week: TrainingWeek) => void;
    onDeriveWeekGoals: (week: TrainingWeek) => void;
    onEditGoal: (goal: WeekGoal) => void;
    onOpenPlanWeek: (week: TrainingWeek) => void;
    onSkipReview: (weekId: string) => void;
    onSync: () => void;
    week: TrainingWeek;
  }
) {
  if (actionId === "skip_review") {
    onSkipReview(week.id);
    return;
  }
  if (["plan_week", "edit_plan", "adjust_rest", "review_week", "edit_goals"].includes(actionId)) {
    onOpenPlanWeek(week);
    return;
  }
  if (actionId === "copy_prior") {
    onCopyPriorWeek(week);
    return;
  }
  if (actionId === "set_goals") {
    if (week.goals.length) {
      onCreateGoal(week);
    } else {
      onDeriveWeekGoals(week);
    }
    return;
  }
  if (actionId === "sync") {
    onSync();
  }
}

function ExpandedWeekSkeletonOverview() {
  return (
    <>
      <div className="week-command-intent" aria-hidden="true">
        <div className="command-skeleton-block" />
        <div className="command-skeleton-block" />
      </div>
      <div className="week-command-stats" aria-hidden="true">
        {["Target", "Schedule", "Quality", "Long run"].map((label) => (
          <div className="week-command-stat command-skeleton-block" key={label} />
        ))}
      </div>
    </>
  );
}

function ExpandedWeekSkeleton({ days }: { days: string[] }) {
  return (
    <>
      <section className="week-board" aria-label="Loading weekly planning board">
        {days.map((dateValue) => (
          <article className="day-column day-column--skeleton" key={dateValue}>
            <header>
              <div>
                <strong>{formatWeekday(dateValue)}</strong>
                <span>{formatShortDate(dateValue)}</span>
              </div>
            </header>
            <div className="workout-stack">
              <div className="skeleton-card" />
            </div>
            <footer>&nbsp;</footer>
          </article>
        ))}
      </section>
    </>
  );
}

type DayEntry =
  | { kind: "planned"; workout: Workout; session: PerformedSession | null; activities: ActualActivity[]; hasPendingMatch: boolean }
  | { kind: "unplanned"; session: PerformedSession; activities: ActualActivity[] }
  | { kind: "raw"; actual: ActualActivity };

function buildDayEntries(
  dateValue: string,
  dayWorkouts: Workout[],
  dayActuals: ActualActivity[],
  sessions: PerformedSession[],
  activities: ActualActivity[],
  workouts: Workout[]
): DayEntry[] {
  const activityById = new Map(activities.map((activity) => [activity.id, activity]));
  const workoutIds = new Set(workouts.map((workout) => workout.id));
  const sessionForWorkout = new Map(
    sessions
      .filter((session) => session.association === "associated" && session.plannedWorkoutId)
      .map((session) => [session.plannedWorkoutId as string, session])
  );
  const activitiesForSession = (session: PerformedSession) =>
    session.recordings
      .map((recording) => activityById.get(recording.stravaActivityId))
      .filter((activity): activity is ActualActivity => Boolean(activity));
  const unplannedSessions = sessions.filter(
    (session) =>
      session.occurredAt.slice(0, 10) === dateValue &&
      (session.association !== "associated" || !session.plannedWorkoutId || !workoutIds.has(session.plannedWorkoutId))
  );
  const groupedActivityIds = new Set(
    sessions.flatMap((session) => session.recordings.map((recording) => recording.stravaActivityId))
  );
  return [
    ...unplannedSessions.map((session) => ({
      kind: "unplanned" as const,
      session,
      activities: activitiesForSession(session)
    })),
    ...dayActuals
      .filter((activity) => !groupedActivityIds.has(activity.id))
      .map((actual) => ({ kind: "raw" as const, actual })),
    ...dayWorkouts.map((workout) => ({
      kind: "planned" as const,
      workout,
      session: sessionForWorkout.get(workout.id) ?? null,
      hasPendingMatch: unplannedSessions.some(
        (session) => session.outcome === "unresolved" && session.sport === workout.sport
      ),
      activities: sessionForWorkout.has(workout.id)
        ? activitiesForSession(sessionForWorkout.get(workout.id) as PerformedSession)
        : []
    }))
  ];
}

type WorkoutState = "done" | "planned" | "missed" | "review";

function workoutState(
  workout: Workout,
  session: PerformedSession | null,
  hasPendingMatch: boolean,
  today: string
): WorkoutState {
  if (session?.outcome === "unresolved") {
    return "review";
  }
  if (hasPendingMatch) {
    return "review";
  }
  if (session?.outcome === "skipped" || session?.outcome === "missed") {
    return "missed";
  }
  if (session) {
    return "done";
  }
  if (workout.sport === "rest" || workout.intensityCategory === "rest") {
    return "planned";
  }
  if (workout.plannedDate < today || workout.status === "missed" || workout.status === "skipped_intentionally") {
    return "missed";
  }
  return "planned";
}

function sessionStatsLabel(session: PerformedSession) {
  const miles = (session.totalDistanceMeters ?? 0) / 1609.344;
  const pieces: string[] = [];
  if (miles > 0) pieces.push(`${formatNumber(miles)} mi`);
  if (session.totalDurationSeconds) {
    const pace = session.sport === "run" && miles > 0
      ? formatPace(session.totalDurationSeconds, miles)
      : "-";
    pieces.push(pace === "-" ? `${formatNumber(session.totalDurationSeconds / 60)} min` : pace);
  }
  return pieces.join(" · ") || outcomeLabel(session.outcome);
}

function actualStatsLabel(activity: ActualActivity) {
  const pace = formatPace(activity.movingTime, activity.distanceMiles);
  const pieces = [`${formatNumber(activity.distanceMiles)} mi`];
  if (pace !== "-") {
    pieces.push(pace);
  }
  return pieces.join(" · ");
}

function sessionMetrics(workout: Workout) {
  if (workout.plannedDuration && !workout.plannedDistance && !workout.plannedPace) {
    return `${formatNumber(workout.plannedDuration / 60)} min`;
  }
  return formatWorkoutMeta(workout);
}

function ActualActivityItem({ activity }: { activity: ActualActivity }) {
  const detail = [
    "unplanned",
    activity.averageHeartrate ? `${Math.round(activity.averageHeartrate)} bpm` : formatTime(activity.startDateLocal)
  ].join(" · ");
  return (
    <div className="actual-item">
      <div className="workout-title-row">
        <span className="workout-type-dot" title="Strava activity" aria-hidden="true" />
        <strong>{activity.name}</strong>
      </div>
      <p className="workout-status-line workout-status-line--done">
        <Check size={12} strokeWidth={2.75} aria-hidden="true" />
        <span>{actualStatsLabel(activity)}</span>
      </p>
      <small>{detail}</small>
      <SessionActions label={`Actions for ${activity.name}`}>
        <button type="button" title="View activity on Strava" onClick={() => openStravaActivity(activity)}>
          <ExternalLink size={15} />
          View on Strava
        </button>
      </SessionActions>
    </div>
  );
}

function PerformedSessionItem({
  activities,
  onEdit,
  session
}: {
  activities: ActualActivity[];
  onEdit?: (session: PerformedSession) => void;
  session: PerformedSession;
}) {
  const title = activities.length > 0
    ? activities.map((activity) => activity.name).join(" + ")
    : `Strava ${session.sport.replaceAll("_", " ")}`;
  const needsReview = session.outcome === "unresolved" || session.evidenceChanged;
  return (
    <div className={`actual-item performed-session-item${needsReview ? " needs-review" : ""}`}>
      <div className="workout-title-row">
        <span className="workout-type-dot" title="Completed session" aria-hidden="true" />
        <strong>{title}</strong>
      </div>
      <p className={`workout-status-line workout-status-line--${needsReview ? "review" : "done"}`}>
        {needsReview ? <Circle size={12} aria-hidden="true" /> : <Check size={12} strokeWidth={2.75} aria-hidden="true" />}
        <span>{sessionStatsLabel(session)}</span>
      </p>
      <small>{needsReview ? "Review match" : outcomeLabel(session.outcome)}</small>
      <SessionActions label={`Actions for ${title}`}>
        {onEdit ? (
          <button type="button" title="Edit Strava match" onClick={() => onEdit(session)}>
            <Edit3 size={15} />
            Edit match
          </button>
        ) : null}
        {activities[0] ? (
          <button type="button" title="View activity on Strava" onClick={() => openStravaActivity(activities[0])}>
            <ExternalLink size={15} />
            View on Strava
          </button>
        ) : null}
      </SessionActions>
    </div>
  );
}

function WorkoutItem({
  workout,
  activities,
  hasPendingMatch,
  session,
  today,
  onEdit,
  onOpen,
  onDelete,
  onDuplicate,
  onScheduleAction,
  readOnly
}: {
  workout: Workout;
  activities: ActualActivity[];
  hasPendingMatch: boolean;
  session: PerformedSession | null;
  today: string;
  onEdit: (workout: Workout, performedSession?: PerformedSession | null) => void;
  onOpen: (workout: Workout, performedSession?: PerformedSession | null) => void;
  onDelete: (workout: Workout) => void;
  onDuplicate: (workout: Workout) => void;
  onScheduleAction: (kind: "move" | "copy", workout: Workout) => void;
  readOnly: boolean;
}) {
  const state = workoutState(workout, session, hasPendingMatch, today);
  const isRest = workout.sport === "rest" || workout.intensityCategory === "rest";
  const plannedMeta = sessionMetrics(workout);
  const hasPlannedMetrics = plannedMeta !== "Rest" && plannedMeta !== workout.status.replaceAll("_", " ");

  let statusLine: string;
  if (session) {
    statusLine = sessionStatsLabel(session);
  } else if (state === "review") {
    statusLine = "Awaiting match";
  } else if (state === "done") {
    statusLine = hasPlannedMetrics ? plannedMeta : "done";
  } else {
    statusLine = plannedMeta;
  }

  const detailPieces: string[] = [];
  const showPlanComparison =
    state === "review" ||
    Boolean(session && !["as_planned", "moved"].includes(session.outcome));
  if (showPlanComparison && hasPlannedMetrics && plannedMeta !== statusLine) {
    detailPieces.push(`Plan ${plannedMeta}`);
  }
  const detail = detailPieces.join(" · ");

  const stateLabel = isRest
    ? null
    : session
      ? session.outcome === "as_planned"
        ? null
        : outcomeLabel(session.outcome)
      : state === "review"
        ? "Review"
        : state === "missed"
          ? workout.status === "skipped_intentionally" ? "Skipped" : "Missed"
          : null;

  const StatusIcon = isRest ? null : state === "done" ? Check : state === "missed" ? Minus : Circle;
  const primaryContent = (
    <>
      <span className="workout-heading">
        <span className="workout-title-row">
          <span className="workout-type-dot" title={labelForWorkoutType(workout.workoutType)} aria-hidden="true" />
          <strong>{workout.title}</strong>
        </span>
        {stateLabel ? (
          <span className={`workout-state-label workout-state-label--${state}`}>{stateLabel}</span>
        ) : null}
      </span>
      <span className="workout-metrics">
        <span className={`workout-status-line workout-status-line--${state}`}>
          {StatusIcon ? <StatusIcon size={12} strokeWidth={2.75} aria-hidden="true" /> : null}
          <span>{statusLine}</span>
        </span>
        {detail ? <small>{detail}</small> : null}
      </span>
    </>
  );

  return (
    <div className={`workout-item workout-item--${state}${readOnly ? " workout-item--read-only" : ""} ${workout.intensityCategory} ${workout.workoutType.replaceAll("_", "-")}`}>
      <button
        type="button"
        className="workout-primary-action"
        aria-label={`View ${workout.title}`}
        onClick={() => onOpen(workout, session)}
      >
        {primaryContent}
      </button>
      {session || !readOnly ? (
        <SessionActions label={`Actions for ${workout.title}`}>
          {activities[0] ? (
            <button type="button" title="View activity on Strava" onClick={() => openStravaActivity(activities[0])}>
              <ExternalLink size={15} />
              View on Strava
            </button>
          ) : null}
          {session || !readOnly ? (
            <button
              type="button"
              title={session ? "Edit completed session" : "Adjust distance or duration"}
              onClick={() => session ? onEdit(workout, session) : onEdit(workout)}
            >
              <Edit3 size={15} />
              {session ? "Edit session" : "Adjust distance or duration"}
            </button>
          ) : null}
          {!readOnly ? (
            <>
              {!session ? (
                <button type="button" title="Move or swap workout" onClick={() => onScheduleAction("move", workout)}>
                  <ArrowRightLeft size={15} />
                  Move or swap
                </button>
              ) : null}
              <button type="button" title="Copy workout to another date" onClick={() => onScheduleAction("copy", workout)}>
                <CalendarClock size={15} />
                Copy to date
              </button>
              <button type="button" title="Duplicate workout" onClick={() => onDuplicate(workout)}>
                <Copy size={15} />
                Duplicate
              </button>
              <button className="session-action-delete" type="button" title="Delete workout" onClick={() => onDelete(workout)}>
                <Trash2 size={15} />
                Delete
              </button>
            </>
          ) : null}
        </SessionActions>
      ) : null}
    </div>
  );
}

function outcomeLabel(outcome: PerformedSession["outcome"]) {
  const labels: Record<PerformedSession["outcome"], string> = {
    unresolved: "Review",
    unplanned: "Unplanned",
    as_planned: "Done",
    modified: "Modified",
    partial: "Partial",
    replaced: "Replaced",
    skipped: "Skipped",
    missed: "Missed",
    moved: "Moved"
  };
  return labels[outcome];
}

function SessionActions({ label, children }: { label: string; children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelId = useId();

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="session-actions" ref={rootRef} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setIsOpen(false);
    }}>
      <button
        className="session-actions-trigger"
        type="button"
        ref={triggerRef}
        aria-label={label}
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        onClick={() => setIsOpen((open) => !open)}
      >
        <Ellipsis size={18} />
      </button>
      {isOpen ? (
        <div className="session-actions-panel" id={panelId} onClick={(event) => {
          if (event.target instanceof Element && event.target.closest("button")) {
            setIsOpen(false);
            triggerRef.current?.focus();
          }
        }}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

function sumDistance(workouts: Workout[]) {
  return workouts.reduce(
    (sum, workout) => (workout.sport === "run" ? sum + (workout.plannedDistance ?? 0) : sum),
    0
  );
}

function sumActualDistance(activities: ActualActivity[]) {
  return activities.reduce((sum, activity) => sum + activity.distanceMiles, 0);
}

function dayColumnClass(workouts: Workout[], activities: ActualActivity[], isEmpty: boolean, isToday: boolean) {
  const classes: string[] = [];
  if (isToday) {
    classes.push("day-column--today");
  }
  const firstWorkout = workouts.find((workout) => workout.sport !== "rest") ?? workouts[0];
  if (firstWorkout) {
    classes.push(`day-column--${firstWorkout.intensityCategory}`, firstWorkout.workoutType.replaceAll("_", "-"));
  } else if (activities.length > 0) {
    classes.push("day-column--actual");
  } else if (isEmpty) {
    classes.push("day-column--empty");
  }
  return classes.join(" ");
}

function collapsedWeekDayBadges(week: TrainingWeek | undefined, weekStart: string) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(weekStart, index);
    const sessions = week?.performedSessions ?? [];
    const groupedActivityIds = new Set(
      sessions.flatMap((session) => session.recordings.map((recording) => recording.stravaActivityId))
    );
    const daySessions = sessions.filter(
      (session) => session.occurredAt.slice(0, 10) === date && isPerformedWorkSession(session)
    );
    const dayActuals = week?.actualActivities.filter(
      (activity) => activity.activityDate === date && !groupedActivityIds.has(activity.id)
    ) ?? [];
    const dayWorkouts = week?.workouts.filter((workout) => workout.plannedDate === date) ?? [];
    const actualMiles = sumActualDistance(dayActuals) + daySessions.reduce(
      (total, session) => total + (session.sport === "run" ? (session.totalDistanceMeters ?? 0) / 1609.344 : 0),
      0
    );
    const plannedMiles = sumDistance(dayWorkouts);
    const weekday = formatWeekday(date);
    const dateLabel = formatShortDate(date);

    if (!week) {
      return {
        date,
        kind: "loading",
        label: "...",
        title: `${weekday} ${dateLabel}: loading`
      };
    }

    const completedCount = dayActuals.length + daySessions.length;
    if (completedCount > 0) {
      return {
        date,
        kind: "actual",
        label: actualMiles > 0 ? `${formatNumber(actualMiles)} mi` : "done",
        title: `${weekday} ${dateLabel}: ${completedCount} completed session${completedCount === 1 ? "" : "s"}`
      };
    }

    if (plannedMiles > 0) {
      return {
        date,
        kind: "planned",
        label: `${formatNumber(plannedMiles)} mi`,
        title: `${weekday} ${dateLabel}: ${formatNumber(plannedMiles)} planned miles`
      };
    }

    if (dayWorkouts.some((workout) => workout.sport === "rest" || workout.intensityCategory === "rest")) {
      return {
        date,
        kind: "rest",
        label: "rest",
        title: `${weekday} ${dateLabel}: rest planned`
      };
    }

    return {
      date,
      kind: "empty",
      label: "—",
      title: `${weekday} ${dateLabel}: no session planned`
    };
  });
}

function formatCollapsedMileageSummary(
  week: TrainingWeek | undefined,
  weekStart: string,
  tone: CollapsedWeekTone,
  activePlan: TrainingPlan | null
) {
  if (!week) {
    return "loading";
  }

  const planned = week.plannedMileage;
  const actual = week.actualMileage;
  const isCurrentWeek = weekStart === startOfWeek(new Date());

  if (actual > 0 && planned > 0) {
    return `${formatNumber(actual)} / ${formatNumber(planned)} mi`;
  }

  if (actual > 0) {
    return isCurrentWeek ? `${formatNumber(actual)} mi · unplanned` : `${formatNumber(actual)} mi`;
  }

  if (planned > 0) {
    return `${formatNumber(planned)} mi planned`;
  }

  const target = week.targetMileage ?? activePlan?.weekSummaries.find((summary) => summary.weekStartDate === weekStart)?.targetMileage;
  const planWeek = activePlan?.weekSummaries.find((summary) => summary.weekStartDate === weekStart);
  const targetLabel = target !== null && target !== undefined ? ` · target ${formatNumber(target)} mi` : "";
  const phaseLabel = planWeek?.mesocycleName && planWeek.weekIndexInMesocycle
    ? ` · ${planWeek.mesocycleName} W${planWeek.weekIndexInMesocycle}`
    : "";
  return `Not planned yet${targetLabel}${phaseLabel}`;
}

function formatCollapsedWeekDetail(week: TrainingWeek | undefined) {
  if (!week) {
    return "loading";
  }

  const hasPlannedWork = week.plannedMileage > 0 || week.workouts.length > 0;
  const hasActualWork = week.actualMileage > 0 || week.actualActivities.length > 0 || (week.performedSessions?.some(isPerformedWorkSession) ?? false);

  if (!hasPlannedWork && !hasActualWork) {
    return "not planned yet";
  }

  const planLabel = hasPlannedWork ? formatHardDays(week.hardDays) : "no plan";
  return `${planLabel} · ${formatLongRun(week.longRunDistance)}`;
}

function isPerformedWorkSession(session: PerformedSession) {
  return (
    !["skipped", "missed"].includes(session.outcome) &&
    session.recordings.length > 0
  );
}

function openStravaActivity(activity: ActualActivity) {
  window.open(stravaActivityUrl(activity.stravaActivityId), "_blank", "noopener,noreferrer");
}

function stravaActivityUrl(stravaActivityId: string) {
  return `https://www.strava.com/activities/${encodeURIComponent(stravaActivityId)}`;
}

function scrollExpandedWeekIntoView(element: HTMLElement, behavior: ScrollBehavior) {
  const container = element.closest("main");
  if (!(container instanceof HTMLElement)) {
    return;
  }

  const rect = element.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const header = container.querySelector<HTMLElement>(":scope > .app-header");
  const context = container.querySelector<HTMLElement>(":scope > .week-context-strip");
  const isMobile = window.matchMedia("(max-width: 860px)").matches;
  const contextHeight = context && getComputedStyle(context).position === "sticky" ? context.offsetHeight : 0;
  const stickyOffset = (header?.offsetHeight ?? 0) + contextHeight + 20;
  const resolvedBehavior = prefersReducedMotion() ? "auto" : behavior;

  if (isMobile) {
    window.scrollTo({
      top: Math.max(0, window.scrollY + rect.top - stickyOffset),
      behavior: resolvedBehavior
    });
    return;
  }

  const targetTop = container.scrollTop + rect.top - containerRect.top - stickyOffset;

  container.scrollTo({
    top: Math.max(0, targetTop),
    behavior: resolvedBehavior
  });
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

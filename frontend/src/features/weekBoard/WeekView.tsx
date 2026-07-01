import { ChevronRight, Copy, Edit3, ExternalLink, Plus, Trash2 } from "lucide-react";
import { useEffect, useLayoutEffect, useRef } from "react";
import { TrainingTimeRail } from "../../components/time-rail/TrainingTimeRail";
import { MileageTrendBadge } from "../../components/shared/MileageTrendBadge";
import { WeekCommandCenter } from "../../components/week/WeekCommandCenter";
import { buildWeekCommandCenterViewModel } from "../weekGoals/buildWeekCommandCenterViewModel";
import type { TrainingTimelineIndex } from "../../hooks/useTrainingTimeline";
import type { ActualActivity, TrainingWeek, WeekGoal, Workout } from "../../types/domain";
import { addDays, startOfWeek, todayDateString } from "../../lib/dates";
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
  canLoadNewerWeeks,
  canLoadOlderWeeks,
  isLoading,
  onJumpToThisWeek,
  onLoadNewerWeeks,
  onLoadOlderWeeks,
  onSelectTimeWeek,
  onSelectWeek,
  selectedWeekStart,
  timelineIndex,
  week,
  weekStack,
  weekStarts,
  onCreate,
  onEdit,
  onDelete,
  onDuplicate,
  onCreateGoal,
  onCopyPriorWeek,
  onDeriveWeekGoals,
  onEditGoal,
  onOpenPlanWeek,
  onSync,
  copyingPriorWeekId
}: {
  canLoadNewerWeeks: boolean;
  canLoadOlderWeeks: boolean;
  isLoading: boolean;
  onJumpToThisWeek: () => void;
  onLoadNewerWeeks: () => void;
  onLoadOlderWeeks: () => void;
  onSelectTimeWeek: (weekStart: string) => void;
  onSelectWeek: (weekStart: string) => void;
  selectedWeekStart: string;
  timelineIndex: TrainingTimelineIndex;
  week: TrainingWeek | null;
  weekStack: Record<string, TrainingWeek>;
  weekStarts: string[];
  onCreate: (plannedDate: string) => void;
  onEdit: (workout: Workout) => void;
  onDelete: (workout: Workout) => void;
  onDuplicate: (workout: Workout) => void;
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

  useEffect(() => {
    const sentinel = olderWeeksSentinelRef.current;
    const root = sentinel?.closest("main");
    if (!sentinel || !(root instanceof HTMLElement) || !canLoadOlderWeeks) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onLoadOlderWeeks();
        }
      },
      {
        root,
        rootMargin: "520px 0px 0px",
        threshold: 0
      }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [canLoadOlderWeeks, onLoadOlderWeeks]);

  useEffect(() => {
    const sentinel = newerWeeksSentinelRef.current;
    const root = sentinel?.closest("main");
    if (!sentinel || !(root instanceof HTMLElement) || !canLoadNewerWeeks) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onLoadNewerWeeks();
        }
      },
      {
        root,
        rootMargin: "0px 0px 520px",
        threshold: 0
      }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [canLoadNewerWeeks, onLoadNewerWeeks]);

  return (
    <section className="week-stack-layout" aria-busy={isLoading}>
      <section className="week-timeline" aria-label="Training week timeline">
        <div className="week-stack-sentinel" aria-hidden="true" ref={olderWeeksSentinelRef} />
        {weekStarts.map((start) => (
          <WeekRow
            key={start}
            isExpanded={start === selectedWeekStart}
            isLoading={isLoading && start === selectedWeekStart}
            onCreate={onCreate}
            onDelete={onDelete}
            onDuplicate={onDuplicate}
            onEdit={onEdit}
            onCreateGoal={onCreateGoal}
            onCopyPriorWeek={onCopyPriorWeek}
            onDeriveWeekGoals={onDeriveWeekGoals}
            onEditGoal={onEditGoal}
            onOpenPlanWeek={onOpenPlanWeek}
            onSync={onSync}
            isCopyingPriorWeek={(start === selectedWeekStart ? week : weekStack[start])?.id === copyingPriorWeekId}
            onSelectWeek={onSelectWeek}
            selectedWeekStart={selectedWeekStart}
            previousWeek={weekStack[addDays(start, -7)]}
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
  );
}

function WeekRow({
  isExpanded,
  isLoading,
  onCreate,
  onDelete,
  onDuplicate,
  onEdit,
  onCreateGoal,
  onCopyPriorWeek,
  onDeriveWeekGoals,
  onEditGoal,
  onOpenPlanWeek,
  onSync,
  isCopyingPriorWeek,
  onSelectWeek,
  selectedWeekStart,
  previousWeek,
  week,
  weekStart
}: {
  isExpanded: boolean;
  isLoading: boolean;
  onCreate: (plannedDate: string) => void;
  onDelete: (workout: Workout) => void;
  onDuplicate: (workout: Workout) => void;
  onEdit: (workout: Workout) => void;
  onCreateGoal: (week: TrainingWeek) => void;
  onCopyPriorWeek: (week: TrainingWeek) => void;
  onDeriveWeekGoals: (week: TrainingWeek) => void;
  onEditGoal: (goal: WeekGoal) => void;
  onOpenPlanWeek: (week: TrainingWeek) => void;
  onSync: () => void;
  isCopyingPriorWeek: boolean;
  onSelectWeek: (weekStart: string) => void;
  selectedWeekStart: string;
  previousWeek?: TrainingWeek;
  week?: TrainingWeek | null;
  weekStart: string;
}) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const previousHeight = useRef<number | null>(null);
  const isPast = weekStart < selectedWeekStart;

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const content = contentRef.current;
    if (!frame || !content) {
      return;
    }

    const nextHeight = content.getBoundingClientRect().height;
    const startHeight = previousHeight.current;
    const reduceMotion = prefersReducedMotion();

    if (startHeight !== null && Math.abs(startHeight - nextHeight) > 1 && !reduceMotion) {
      frame.style.height = `${startHeight}px`;
      frame.style.overflow = "hidden";
      window.requestAnimationFrame(() => {
        frame.style.height = `${nextHeight}px`;
      });

      const finish = window.setTimeout(() => {
        frame.style.height = "auto";
        frame.style.overflow = "visible";
      }, 240);

      previousHeight.current = nextHeight;
      return () => window.clearTimeout(finish);
    }

    frame.style.height = "auto";
    frame.style.overflow = "visible";
    previousHeight.current = nextHeight;
  }, [isExpanded, isLoading, week]);

  useEffect(() => {
    if (!isExpanded || !frameRef.current) {
      return;
    }

    const frame = frameRef.current;
    const scrollFrame = window.requestAnimationFrame(() => {
      scrollExpandedWeekIntoView(frame);
    });

    return () => window.cancelAnimationFrame(scrollFrame);
  }, [isExpanded, weekStart]);

  return (
    <div
      className={`week-row ${isExpanded ? "week-row--expanded" : ""}`}
      data-week-start={weekStart}
      data-testid="week-row"
      ref={frameRef}
    >
      <div className="week-row-content" ref={contentRef}>
        {isExpanded ? (
          <ExpandedWeekBoard
            days={Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))}
            isLoading={!week}
            onCreate={onCreate}
            onDelete={onDelete}
            onDuplicate={onDuplicate}
            onEdit={onEdit}
            onCreateGoal={onCreateGoal}
            onCopyPriorWeek={onCopyPriorWeek}
            onDeriveWeekGoals={onDeriveWeekGoals}
            onEditGoal={onEditGoal}
            onOpenPlanWeek={onOpenPlanWeek}
            onSync={onSync}
            isCopyingPriorWeek={isCopyingPriorWeek}
            week={week ?? null}
            weekStart={weekStart}
          />
        ) : (
          <CollapsedWeekCard
            onSelectWeek={onSelectWeek}
            previousWeek={previousWeek}
            tone={isPast ? "past" : "future"}
            week={week ?? undefined}
            weekStart={weekStart}
          />
        )}
      </div>
    </div>
  );
}

function CollapsedWeekCard({
  onSelectWeek,
  previousWeek,
  tone,
  week,
  weekStart
}: {
  onSelectWeek: (weekStart: string) => void;
  previousWeek?: TrainingWeek;
  tone: "past" | "future";
  week?: TrainingWeek;
  weekStart: string;
}) {
  const range = week ? formatCompactWeekRange(week.weekStartDate, week.weekEndDate) : formatCompactWeekRangeFromStart(weekStart);
  const mileageSummary = formatCollapsedMileageSummary(week, weekStart, tone);
  const mileageTrend = getCollapsedMileageTrend(week, previousWeek);
  const detail = formatCollapsedWeekDetail(week, tone);
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
  onDelete,
  onDuplicate,
  onCreateGoal,
  onCopyPriorWeek,
  onDeriveWeekGoals,
  onEditGoal,
  onOpenPlanWeek,
  onSync,
  isCopyingPriorWeek,
}: {
  days: string[];
  isLoading?: boolean;
  week: TrainingWeek | null;
  weekStart: string;
  onCreate: (plannedDate: string) => void;
  onEdit: (workout: Workout) => void;
  onDelete: (workout: Workout) => void;
  onDuplicate: (workout: Workout) => void;
  onCreateGoal: (week: TrainingWeek) => void;
  onCopyPriorWeek: (week: TrainingWeek) => void;
  onDeriveWeekGoals: (week: TrainingWeek) => void;
  onEditGoal: (goal: WeekGoal) => void;
  onOpenPlanWeek: (week: TrainingWeek) => void;
  onSync: () => void;
  isCopyingPriorWeek: boolean;
}) {
  const workouts = week?.workouts ?? [];
  const actualActivities = week?.actualActivities ?? [];
  const today = todayDateString();

  if (isLoading) {
    return (
      <div
        className="expanded-week-board expanded-week-board--loading"
        aria-label={`Loading ${formatWeekRangeFromStart(weekStart)}`}
      >
        <section className="week-command-center" aria-label="Loading week command center">
          <header className="week-command-header">
            <div className="week-command-title">
              <p className="eyebrow">Training week</p>
              <h1>{formatWeekRangeFromStart(weekStart)}</h1>
              <span>Loading week</span>
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
      onEditGoal={onEditGoal}
      onOpenPlanWeek={onOpenPlanWeek}
      onSync={onSync}
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
  onEditGoal,
  onOpenPlanWeek,
  onSync,
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
  onEdit: (workout: Workout) => void;
  onEditGoal: (goal: WeekGoal) => void;
  onOpenPlanWeek: (week: TrainingWeek) => void;
  onSync: () => void;
  today: string;
  week: TrainingWeek | null | undefined;
  workouts: Workout[];
}) {
  if (!week) {
    return <div className="expanded-week-board" />;
  }

  const viewModel = buildWeekCommandCenterViewModel({ week, today });

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
            onSync,
            week
          })
        }
        onEditGoal={(goalId) => {
          const goal = week.goals.find((candidate) => candidate.id === goalId);
          if (goal) {
            onOpenPlanWeek(week);
          }
        }}
      />

      {!viewModel.isUnplanned ? (
        <WeekSchedule
          actualActivities={actualActivities}
          days={days}
          onCreate={onCreate}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          onEdit={onEdit}
          today={today}
          workouts={workouts}
        />
      ) : null}
    </section>
  );
}

function WeekSchedule({
  actualActivities,
  days,
  onCreate,
  onDelete,
  onDuplicate,
  onEdit,
  today,
  workouts
}: {
  actualActivities: ActualActivity[];
  days: string[];
  onCreate: (plannedDate: string) => void;
  onDelete: (workout: Workout) => void;
  onDuplicate: (workout: Workout) => void;
  onEdit: (workout: Workout) => void;
  today: string;
  workouts: Workout[];
}) {
  return (
    <section className="week-schedule-panel" aria-label="Weekly schedule">
      <header>
        <div>
          <span>Schedule</span>
        </div>
      </header>
      <div className="week-board">
        {days.map((dateValue) => {
          const dayWorkouts = workouts.filter((workout) => workout.plannedDate === dateValue);
          const dayActuals = actualActivities.filter((activity) => activity.activityDate === dateValue);
          const isEmpty = dayWorkouts.length === 0 && dayActuals.length === 0;
          return (
            <article className={`day-column ${dayColumnClass(dayWorkouts, dayActuals, isEmpty)}`} key={dateValue}>
              <header>
                <div>
                  <span>{formatWeekdayShort(dateValue)}</span>
                  <strong>{formatDayNumber(dateValue)}</strong>
                </div>
                <button type="button" title="Add workout" onClick={() => onCreate(dateValue)}>
                  <Plus size={15} />
                </button>
              </header>
              <div className="workout-stack">
                {dayActuals.map((activity) => (
                  <ActualActivityItem activity={activity} key={activity.id} />
                ))}
                {dayWorkouts.map((workout) => (
                  <WorkoutItem
                    key={workout.id}
                    workout={workout}
                    onDelete={onDelete}
                    onDuplicate={onDuplicate}
                    onEdit={onEdit}
                  />
                ))}
                {isEmpty && dateValue < today ? (
                  <span className="empty-day-action empty-day-action--static">Rest</span>
                ) : null}
                {isEmpty && dateValue >= today ? (
                  <button className="empty-day-action" type="button" onClick={() => onCreate(dateValue)}>
                    Add session
                  </button>
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
    onSync,
    week
  }: {
    onCopyPriorWeek: (week: TrainingWeek) => void;
    onCreateGoal: (week: TrainingWeek) => void;
    onDeriveWeekGoals: (week: TrainingWeek) => void;
    onEditGoal: (goal: WeekGoal) => void;
    onOpenPlanWeek: (week: TrainingWeek) => void;
    onSync: () => void;
    week: TrainingWeek;
  }
) {
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

function ActualActivityItem({ activity }: { activity: ActualActivity }) {
  return (
    <div className="actual-item">
      <span className="workout-kind">Actual</span>
      <strong>{activity.name}</strong>
      <p className="workout-meta">
        {formatNumber(activity.distanceMiles)} mi · {formatPace(activity.movingTime, activity.distanceMiles)}
      </p>
      <small>{activity.averageHeartrate ? `${Math.round(activity.averageHeartrate)} bpm` : formatTime(activity.startDateLocal)}</small>
      <div className="activity-controls">
        <button type="button" title="View activity on Strava" onClick={() => openStravaActivity(activity)}>
          <ExternalLink size={15} />
        </button>
      </div>
    </div>
  );
}

function WorkoutItem({
  workout,
  onEdit,
  onDelete,
  onDuplicate
}: {
  workout: Workout;
  onEdit: (workout: Workout) => void;
  onDelete: (workout: Workout) => void;
  onDuplicate: (workout: Workout) => void;
}) {
  return (
    <div
      className={`workout-item ${workout.intensityCategory} ${workout.workoutType.replaceAll("_", "-")}`}
      onClick={() => onEdit(workout)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onEdit(workout);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="workout-title-row">
        <span className="workout-kind">{labelForWorkoutType(workout.workoutType)}</span>
        <strong>{workout.title}</strong>
      </div>
      <p className="workout-meta">{formatWorkoutMeta(workout)}</p>
      <small>{workout.status.replaceAll("_", " ")}</small>
      <div
        className="workout-controls"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <button type="button" title="Edit workout" onClick={() => onEdit(workout)}>
          <Edit3 size={15} />
        </button>
        <button type="button" title="Duplicate workout" onClick={() => onDuplicate(workout)}>
          <Copy size={15} />
        </button>
        <button type="button" title="Delete workout" onClick={() => onDelete(workout)}>
          <Trash2 size={15} />
        </button>
      </div>
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

function dayColumnClass(workouts: Workout[], activities: ActualActivity[], isEmpty: boolean) {
  if (activities.length > 0) {
    return "day-column--actual";
  }
  const firstWorkout = workouts.find((workout) => workout.sport !== "rest") ?? workouts[0];
  if (!firstWorkout) {
    return isEmpty ? "day-column--empty day-column--rest" : "";
  }
  return `day-column--${firstWorkout.intensityCategory} ${firstWorkout.workoutType.replaceAll("_", "-")}`;
}

function collapsedWeekDayBadges(week: TrainingWeek | undefined, weekStart: string) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(weekStart, index);
    const dayActuals = week?.actualActivities.filter((activity) => activity.activityDate === date) ?? [];
    const dayWorkouts = week?.workouts.filter((workout) => workout.plannedDate === date) ?? [];
    const actualMiles = sumActualDistance(dayActuals);
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

    if (dayActuals.length > 0) {
      return {
        date,
        kind: actualMiles > 0 ? "actual" : "rest",
        label: actualMiles > 0 ? `${formatNumber(actualMiles)} mi` : "rest",
        title: `${weekday} ${dateLabel}: ${formatNumber(actualMiles)} completed miles`
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

    return {
      date,
      kind: "rest",
      label: "rest",
      title: `${weekday} ${dateLabel}: rest`
    };
  });
}

function formatCollapsedMileageSummary(week: TrainingWeek | undefined, weekStart: string, tone: "past" | "future") {
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

  return tone === "future" ? "not planned" : "no plan";
}

function formatCollapsedWeekDetail(week: TrainingWeek | undefined, tone: "past" | "future") {
  if (!week) {
    return "loading";
  }

  const hasPlannedWork = week.plannedMileage > 0 || week.workouts.length > 0;
  const hasActualWork = week.actualMileage > 0 || week.actualActivities.length > 0;

  if (!hasPlannedWork && !hasActualWork && tone === "future") {
    return "tap to plan";
  }

  const planLabel = hasPlannedWork ? formatHardDays(week.hardDays) : "no plan";
  return `${planLabel} · ${formatLongRun(week.longRunDistance)}`;
}

function openStravaActivity(activity: ActualActivity) {
  window.open(stravaActivityUrl(activity.stravaActivityId), "_blank", "noopener,noreferrer");
}

function stravaActivityUrl(stravaActivityId: string) {
  return `https://www.strava.com/activities/${encodeURIComponent(stravaActivityId)}`;
}

function scrollExpandedWeekIntoView(element: HTMLElement) {
  const container = element.closest("main");
  if (!(container instanceof HTMLElement)) {
    return;
  }

  const rect = element.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const targetTop = container.scrollTop + rect.top - containerRect.top;

  container.scrollTo({
    top: Math.max(0, targetTop),
    behavior: prefersReducedMotion() ? "auto" : "smooth"
  });
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

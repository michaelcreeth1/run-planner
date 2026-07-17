import { ArrowRight, BarChart3, CalendarDays, Route } from "lucide-react";
import { buildWeekNextUp } from "../../features/weekBoard/buildWeekNextUp";
import type { TrainingWeek, Workout } from "../../types/domain";

export function WeekNextUpCard({
  onEditWorkout,
  onOpenPlan,
  onOpenPlanWeek,
  onOpenProgress,
  onSkipReview,
  today,
  week
}: {
  onEditWorkout: (workout: Workout) => void;
  onOpenPlan: () => void;
  onOpenPlanWeek: (week: TrainingWeek) => void;
  onOpenProgress: () => void;
  onSkipReview: (weekId: string) => void;
  today: string;
  week: TrainingWeek;
}) {
  const viewModel = buildWeekNextUp(week, today);
  const Icon =
    viewModel.action === "open_progress"
      ? BarChart3
      : viewModel.action === "open_plan"
      ? Route
      : CalendarDays;

  function handleAction() {
    if (viewModel.action === "edit_workout" && viewModel.workoutId) {
      const workout = week.workouts.find((candidate) => candidate.id === viewModel.workoutId);
      if (workout) {
        onEditWorkout(workout);
      }
      return;
    }
    if (viewModel.action === "open_plan") {
      onOpenPlan();
      return;
    }
    if (viewModel.action === "open_progress") {
      onOpenProgress();
      return;
    }
    if (viewModel.action === "skip_review") {
      onSkipReview(week.id);
      return;
    }
    onOpenPlanWeek(week);
  }

  return (
    <section className="week-next-up" aria-label="Recommended next action">
      <div className="week-next-up-icon" aria-hidden="true">
        <Icon size={18} />
      </div>
      <div className="week-next-up-copy">
        <span>{viewModel.eyebrow}</span>
        <strong>{viewModel.title}</strong>
        <small>{viewModel.detail}</small>
      </div>
      <button type="button" onClick={handleAction}>
        <span>{viewModel.actionLabel}</span>
        <ArrowRight size={15} aria-hidden="true" />
      </button>
    </section>
  );
}

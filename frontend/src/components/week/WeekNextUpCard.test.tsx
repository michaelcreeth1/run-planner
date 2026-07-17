import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { TrainingWeek } from "../../types/domain";
import { WeekNextUpCard } from "./WeekNextUpCard";

describe("WeekNextUpCard", () => {
  it("closes an empty past week without opening the review drawer", async () => {
    const user = userEvent.setup();
    const onSkipReview = vi.fn();
    render(
      <WeekNextUpCard
        onEditWorkout={vi.fn()}
        onOpenPlan={vi.fn()}
        onOpenPlanWeek={vi.fn()}
        onOpenProgress={vi.fn()}
        onSkipReview={onSkipReview}
        today="2026-07-09"
        week={emptyPastWeek()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Nothing to review — skip" }));

    expect(onSkipReview).toHaveBeenCalledWith("week-empty");
  });
});

function emptyPastWeek(): TrainingWeek {
  return {
    id: "week-empty",
    weekStartDate: "2026-06-29",
    weekEndDate: "2026-07-05",
    plannedMileage: 0,
    actualMileage: 0,
    plannedTime: null,
    actualTime: null,
    mesocycleId: null,
    purpose: "",
    purposeSource: "manual",
    targetMileage: null,
    targetMileageSource: "manual",
    targetLongRunDistance: null,
    targetLongRunSource: "manual",
    isDownWeek: false,
    notes: "",
    reviewedAt: null,
    workouts: [],
    actualActivities: [],
    goals: [],
    goalEvaluations: [],
    weekState: "past",
    goalReviewSummary: "",
    hardDays: 0,
    longRunDistance: 0,
    longRunPercentage: 0
  };
}

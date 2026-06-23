export type WeekMode = "planning" | "execution" | "review";

export type GoalDisplayStatus =
  | "planned"
  | "on_track"
  | "at_risk"
  | "achieved"
  | "partial"
  | "missed"
  | "exceeded"
  | "waived"
  | "no_goal";

export type DisplaySeverity = "neutral" | "info" | "success" | "warning" | "danger";

export type WeekActionViewModel = {
  id: string;
  label: string;
  variant: "primary" | "secondary" | "ghost" | "danger";
  icon?: string;
  disabled?: boolean;
  tooltip?: string;
};

export type GoalCardViewModel = {
  id: string;
  goalId?: string;
  label: string;
  primaryValue: string;
  status: GoalDisplayStatus;
  statusLabel: string;
  explanation: string;
  severity: DisplaySeverity;
  priority: "primary" | "secondary";
  editable?: boolean;
};

export type GuardrailWarningViewModel = {
  id: string;
  label: string;
  detail: string;
  severity: "info" | "warning" | "danger";
};

export type CompactWeekStatViewModel = {
  label: string;
  value: string;
  detail?: string;
  severity?: DisplaySeverity;
};

export type WeekCommandCenterViewModel = {
  weekStartDate: string;
  weekEndDate: string;
  title: string;
  mode: WeekMode;
  modeLabel: string;
  purpose?: string;
  primarySummary: string;
  secondarySummary?: string;
  actionButtons: WeekActionViewModel[];
  goalCards: GoalCardViewModel[];
  primaryGoalCards: GoalCardViewModel[];
  detailGoalCards: GoalCardViewModel[];
  guardrailWarnings: GuardrailWarningViewModel[];
  guardrailDetails: GuardrailWarningViewModel[];
  notesDetail?: string;
  detailSummary: string;
  compactStats?: CompactWeekStatViewModel[];
};

type WeekGoalStatus =
  | "not_started"
  | "on_track"
  | "at_risk"
  | "achieved"
  | "partially_achieved"
  | "missed"
  | "exceeded"
  | "waived";

type WeekGoal = {
  id: string;
  category: "mileage" | "sessions" | "long_run" | "quality" | "recovery" | "strength" | "custom";
  goalType: "achievement" | "guardrail";
  label: string;
  description: string;
  targetValue: number | null;
  minAcceptable: number | null;
  maxAcceptable: number | null;
  unit: "mi" | "sessions" | "days" | "percent" | "boolean" | "custom";
  priority: "primary" | "secondary" | "guardrail";
  status: WeekGoalStatus;
  isEditable: boolean;
  isEnabled: boolean;
};

type WeekGoalEvaluation = {
  goalId: string;
  status: WeekGoalStatus;
  guardrailStatus: "ok" | "warning" | "danger" | "waived" | "not_applicable" | null;
  actualValue: number | null;
  plannedValue: number | null;
  remainingPlannedValue: number | null;
  summary: string;
  detail: string | null;
  severity: "info" | "success" | "warning" | "danger";
  contributingWorkoutIds: string[];
  contributingActivityIds: string[];
};

type Workout = {
  id: string;
  plannedDate: string;
  title: string;
  sport: "run" | "strength" | "cross_training" | "rest" | "mobility" | "other";
  workoutType: string;
  intensityCategory: "rest" | "easy" | "moderate" | "workout" | "race" | "strength";
  plannedDistance: number | null;
};

type ActualActivity = {
  id: string;
  name: string;
  sportType: string;
  activityDate: string;
  distanceMiles: number;
};

type TrainingWeek = {
  weekStartDate: string;
  weekEndDate: string;
  plannedMileage: number;
  actualMileage: number;
  notes: string;
  workouts: Workout[];
  actualActivities: ActualActivity[];
  goals: WeekGoal[];
  goalEvaluations: WeekGoalEvaluation[];
};

type BuildWeekCommandCenterOptions = {
  week: TrainingWeek;
  today: string;
};

const QUALITY_TYPES = new Set([
  "tempo",
  "threshold",
  "interval",
  "hill",
  "race",
  "time_trial",
  "progression",
  "strides"
]);

export function getWeekMode(weekStartDate: string, weekEndDate: string, today: string): WeekMode {
  if (today < weekStartDate) {
    return "planning";
  }
  if (today > weekEndDate) {
    return "review";
  }
  return "execution";
}

export function buildWeekCommandCenterViewModel({
  week,
  today
}: BuildWeekCommandCenterOptions): WeekCommandCenterViewModel {
  const mode = getWeekMode(week.weekStartDate, week.weekEndDate, today);
  const evaluationsByGoal = new Map(week.goalEvaluations.map((evaluation) => [evaluation.goalId, evaluation]));
  const achievementGoals = week.goals.filter((goal) => goal.isEnabled && goal.goalType === "achievement");
  const guardrailGoals = week.goals.filter((goal) => goal.isEnabled && goal.goalType === "guardrail");
  const goalCards = buildGoalCards({
    achievementGoals,
    evaluationsByGoal,
    mode,
    today,
    week
  });
  const primaryGoalCards = goalCards.filter((card) => isPrimaryGoalCard(card.id));
  const detailGoalCards = goalCards.filter((card) => !isPrimaryGoalCard(card.id));
  const guardrailWarnings = buildGuardrailWarnings(guardrailGoals, evaluationsByGoal);
  const guardrailDetails = buildGuardrailDetails(guardrailGoals, evaluationsByGoal);
  const compactStats = buildCompactStats(week, goalCards, mode, today);

  return {
    weekStartDate: week.weekStartDate,
    weekEndDate: week.weekEndDate,
    title: formatWeekRange(week.weekStartDate, week.weekEndDate),
    mode,
    modeLabel: modeLabel(mode),
    purpose: buildPurpose(week, goalCards),
    primarySummary: buildPrimarySummary(week, goalCards, mode, today),
    secondarySummary: buildSecondarySummary(week, mode, today),
    actionButtons: buildActions(mode),
    goalCards,
    primaryGoalCards,
    detailGoalCards,
    guardrailWarnings,
    guardrailDetails,
    notesDetail: week.notes.trim() || undefined,
    detailSummary: buildDetailSummary(detailGoalCards, guardrailDetails),
    compactStats
  };
}

function buildGoalCards({
  achievementGoals,
  evaluationsByGoal,
  mode,
  today,
  week
}: {
  achievementGoals: WeekGoal[];
  evaluationsByGoal: Map<string, WeekGoalEvaluation>;
  mode: WeekMode;
  today: string;
  week: TrainingWeek;
}) {
  const cards = achievementGoals.map((goal) =>
    buildGoalCard(goal, evaluationsByGoal.get(goal.id), week, mode, today)
  );

  if (!cards.some((card) => card.id === "long_run")) {
    cards.push(buildInformationalLongRunCard(week, mode, today));
  }

  return cards.sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority === "primary" ? -1 : 1;
    }
    return goalOrder(a.id) - goalOrder(b.id);
  });
}

function buildGoalCard(
  goal: WeekGoal,
  evaluation: WeekGoalEvaluation | undefined,
  week: TrainingWeek,
  mode: WeekMode,
  today: string
): GoalCardViewModel {
  if (goal.category === "long_run") {
    return buildLongRunGoalCard(goal, evaluation, week, mode, today);
  }

  const status = displayStatusFor(goal, evaluation, mode, week, today);
  return {
    id: goal.category,
    goalId: goal.id,
    label: goalLabel(goal),
    primaryValue: primaryValueForGoal(goal, evaluation, week, mode, today),
    status,
    statusLabel: statusLabel(status, mode),
    explanation: explanationForGoal(goal, evaluation, week, mode, today),
    severity: severityFor(status),
    priority: goal.priority === "primary" ? "primary" : "secondary",
    editable: goal.isEditable
  };
}

function buildLongRunGoalCard(
  goal: WeekGoal,
  evaluation: WeekGoalEvaluation | undefined,
  week: TrainingWeek,
  mode: WeekMode,
  today: string
): GoalCardViewModel {
  const longRun = deriveLongRun(week, mode, today);
  const target = goal.targetValue;
  const status = displayStatusFor(goal, evaluation, mode, week, today);
  const plannedSuffix = mode === "planning" ? " planned" : "";
  const primaryValue =
    target && mode !== "planning"
      ? `${formatNumber(longRun.distance)} / ${formatNumber(target)} mi`
      : `${formatNumber(longRun.distance)} mi${plannedSuffix}`;

  return {
    id: "long_run",
    goalId: goal.id,
    label: "Long run",
    primaryValue,
    status,
    statusLabel: statusLabel(status, mode),
    explanation: longRunExplanation(longRun, goal, status, mode),
    severity: severityFor(status),
    priority: "primary",
    editable: goal.isEditable
  };
}

function buildInformationalLongRunCard(
  week: TrainingWeek,
  mode: WeekMode,
  today: string
): GoalCardViewModel {
  const longRun = deriveLongRun(week, mode, today);
  return {
    id: "long_run",
    label: "Long run",
    primaryValue: longRun.distance > 0 ? `${formatNumber(longRun.distance)} mi` : "Not planned",
    status: "no_goal",
    statusLabel: "No goal",
    explanation: longRun.detail || "No long-run goal set.",
    severity: "info",
    priority: "secondary"
  };
}

function buildGuardrailWarnings(
  guardrailGoals: WeekGoal[],
  evaluationsByGoal: Map<string, WeekGoalEvaluation>
): GuardrailWarningViewModel[] {
  const warnings: GuardrailWarningViewModel[] = [];

  guardrailGoals.forEach((goal) => {
      const evaluation = evaluationsByGoal.get(goal.id);
      if (!evaluation || !["warning", "danger"].includes(evaluation.guardrailStatus ?? "")) {
      return;
      }
    warnings.push({
        id: goal.id,
        label: cleanGoalLabel(goal),
        detail: userFacingExplanation(evaluation.detail || evaluation.summary, goal),
        severity: evaluation.guardrailStatus as "warning" | "danger"
    });
  });

  return warnings;
}

function buildGuardrailDetails(
  guardrailGoals: WeekGoal[],
  evaluationsByGoal: Map<string, WeekGoalEvaluation>
): GuardrailWarningViewModel[] {
  return guardrailGoals.map((goal) => {
    const evaluation = evaluationsByGoal.get(goal.id);
    const severity =
      evaluation?.guardrailStatus === "danger" ? "danger" : evaluation?.guardrailStatus === "warning" ? "warning" : "info";
    return {
      id: goal.id,
      label: cleanGoalLabel(goal),
      detail: userFacingExplanation(evaluation?.detail || evaluation?.summary || goal.description, goal),
      severity
    };
  });
}

function buildDetailSummary(detailGoalCards: GoalCardViewModel[], guardrailDetails: GuardrailWarningViewModel[]) {
  const warnings = guardrailDetails.filter((guardrail) => guardrail.severity !== "info").length;
  const pieces = [];
  if (detailGoalCards.length) {
    pieces.push(`${detailGoalCards.length} more goal${detailGoalCards.length === 1 ? "" : "s"}`);
  }
  if (guardrailDetails.length) {
    pieces.push(warnings ? `${warnings} guardrail warning${warnings === 1 ? "" : "s"}` : "guardrails clear");
  }
  return pieces.join(" · ") || "Goal details";
}

function buildCompactStats(
  week: TrainingWeek,
  goalCards: GoalCardViewModel[],
  mode: WeekMode,
  today: string
): CompactWeekStatViewModel[] {
  const mileage = goalCards.find((card) => card.id === "mileage");
  const quality = goalCards.find((card) => card.id === "quality");
  const longRun = goalCards.find((card) => card.id === "long_run");
  const goalsMet = goalCards.filter((card) => ["achieved", "on_track", "planned"].includes(card.status)).length;

  if (mode === "planning") {
    return [
      {
        label: "Target week",
        value: mileage?.primaryValue ?? `${formatNumber(week.plannedMileage)} mi planned`,
        severity: mileage?.severity
      },
      {
        label: "Schedule",
        value: `${plannedSessionCount(week)} sessions`
      },
      {
        label: "Quality",
        value: quality?.primaryValue ?? `${plannedHardDayCount(week)} hard days`,
        severity: quality?.severity
      },
      {
        label: "Long run",
        value: longRun?.primaryValue ?? "Not planned",
        severity: longRun?.severity
      }
    ];
  }

  if (mode === "execution") {
    const remaining = Math.max(projectedTargetMiles(week, mileage) - week.actualMileage, 0);
    return [
      {
        label: "Progress",
        value: mileage?.primaryValue ?? `${formatNumber(week.actualMileage)} mi`,
        severity: mileage?.severity
      },
      {
        label: "Remaining",
        value: `${formatNumber(remaining)} mi`,
        detail: "still planned"
      },
      {
        label: "Goals",
        value: `${goalsMet} on track`
      },
      {
        label: "Long run",
        value: longRun?.primaryValue ?? deriveLongRun(week, mode, today).summary,
        severity: longRun?.severity
      }
    ];
  }

  const achieved = goalCards.filter((card) => card.status === "achieved").length;
  return [
    {
      label: "Actual",
      value: `${formatNumber(week.actualMileage)} mi`
    },
    {
      label: "Goals",
      value: `${achieved} / ${goalCards.length} achieved`
    },
    {
      label: "Quality",
      value: quality?.primaryValue ?? `${actualHardDayCount(week)} hard days`,
      severity: quality?.severity
    },
    {
      label: "Long run",
      value: longRun?.primaryValue ?? deriveLongRun(week, mode, today).summary,
      severity: longRun?.severity
    }
  ];
}

function buildPurpose(week: TrainingWeek, goalCards: GoalCardViewModel[]) {
  if (week.notes.trim()) {
    return week.notes.trim();
  }

  const mileage = goalCards.find((card) => card.id === "mileage");
  const quality = goalCards.find((card) => card.id === "quality");
  if (mileage && quality) {
    return `Build the week around ${intentValueForCard(mileage)} and ${intentValueForCard(quality)}.`;
  }
  if (mileage) {
    return `Build the week around ${intentValueForCard(mileage)}.`;
  }
  return undefined;
}

function buildPrimarySummary(
  week: TrainingWeek,
  goalCards: GoalCardViewModel[],
  mode: WeekMode,
  today: string
) {
  if (mode === "planning") {
    const longRun = deriveLongRun(week, mode, today);
    return `${formatNumber(week.plannedMileage)} mi planned · ${plannedSessionCount(week)} sessions · ${plannedHardDayCount(week)} hard day${plannedHardDayCount(week) === 1 ? "" : "s"} · ${longRun.summary}`;
  }

  if (mode === "execution") {
    const mileage = goalCards.find((card) => card.id === "mileage");
    const target = projectedTargetMiles(week, mileage);
    const remaining = Math.max(target - week.actualMileage, 0);
    return `${formatNumber(week.actualMileage)} / ${formatNumber(target)} mi completed · ${completedSessionCount(week)} completed · ${plannedSessionCount(week)} planned · ${formatNumber(remaining)} mi remaining`;
  }

  const achieved = goalCards.filter((card) => card.status === "achieved").length;
  const missed = goalCards.filter((card) => ["missed", "exceeded"].includes(card.status));
  const missedSummary = missed.length
    ? ` · ${missed.map((card) => `${card.label.toLowerCase()} ${card.status}`).join(" · ")}`
    : "";
  return `${achieved} / ${goalCards.length} goals achieved${missedSummary}`;
}

function buildSecondarySummary(week: TrainingWeek, mode: WeekMode, today: string) {
  const nextKeyWorkout = upcomingKeyWorkout(week, today);
  if (mode === "planning") {
    return "Week intent sets the target; the board below is the implementation.";
  }
  if (mode === "execution") {
    return nextKeyWorkout
      ? `Next key session: ${nextKeyWorkout.title} on ${formatWeekday(nextKeyWorkout.plannedDate)}.`
      : "No key session remains on the plan.";
  }
  return "Review outcomes against the intent, not just the activity totals.";
}

function buildActions(mode: WeekMode): WeekActionViewModel[] {
  if (mode === "planning") {
    return [
      { id: "set_goals", label: "Set goals", variant: "primary", icon: "target" },
      { id: "copy_prior", label: "Copy prior week", variant: "secondary", icon: "copy" },
      {
        id: "clear_week",
        label: "Clear week",
        variant: "ghost",
        icon: "trash",
        disabled: true,
        tooltip: "Clear week is not wired up yet."
      }
    ];
  }

  if (mode === "execution") {
    return [
      { id: "sync", label: "Sync", variant: "primary", icon: "refresh" },
      {
        id: "adjust_rest",
        label: "Adjust rest of week",
        variant: "secondary",
        icon: "calendar",
        disabled: true,
        tooltip: "Adjustment tools are coming next."
      },
      { id: "edit_goals", label: "Edit goals", variant: "ghost", icon: "target" }
    ];
  }

  return [
    {
      id: "review_week",
      label: "Review week",
      variant: "primary",
      icon: "check",
      disabled: true,
      tooltip: "Week review notes are coming next."
    },
    {
      id: "use_as_template",
      label: "Use as template",
      variant: "secondary",
      icon: "copy",
      disabled: true,
      tooltip: "Template actions are coming next."
    },
    { id: "edit_goals", label: "Edit goals", variant: "ghost", icon: "target" }
  ];
}

function primaryValueForGoal(
  goal: WeekGoal,
  evaluation: WeekGoalEvaluation | undefined,
  week: TrainingWeek,
  mode: WeekMode,
  today: string
) {
  const target = goal.targetValue ?? goal.minAcceptable ?? goal.maxAcceptable;
  const planned = evaluation?.plannedValue ?? plannedValueForCategory(goal.category, week);
  const actual = evaluation?.actualValue ?? actualValueForCategory(goal.category, week);

  if (goal.category === "mileage") {
    if (mode === "planning") {
      return `${formatNumber(planned || week.plannedMileage)} mi planned`;
    }
    return `${formatNumber(mode === "review" ? week.actualMileage : actual)} / ${formatNumber(target || week.plannedMileage)} mi`;
  }

  if (goal.category === "quality") {
    if (mode === "planning") {
      return `${formatNumber(planned)} hard planned`;
    }
    return `${formatNumber(actual)} / ${formatNumber(target || planned)} hard`;
  }

  if (goal.category === "recovery") {
    const restDays = mode === "review" ? actualRestDays(week) : plannedRestDays(week);
    if (mode === "review") {
      return restDays > 0 ? `${restDays} rest day${restDays === 1 ? "" : "s"} completed` : "No rest day";
    }
    return restDays > 0 ? `${restDays} rest day${restDays === 1 ? "" : "s"} planned` : "No rest day";
  }

  if (goal.category === "sessions") {
    if (mode === "planning") {
      return `${formatNumber(planned)} sessions planned`;
    }
    if (mode === "execution") {
      return `${formatNumber(actual)} completed · ${formatNumber(planned)} planned`;
    }
    return `${formatNumber(actual)} / ${formatNumber(target || planned)} sessions`;
  }

  if (goal.category === "strength") {
    if (mode === "planning") {
      return `${formatNumber(planned)} strength planned`;
    }
    return `${formatNumber(actual)} / ${formatNumber(target || planned)} session${(target || planned) === 1 ? "" : "s"}`;
  }

  const value = mode === "planning" ? planned : actual;
  return target ? `${formatNumber(value)} / ${formatNumber(target)}` : statusLabel(displayStatusFor(goal, evaluation, mode, week, today), mode);
}

function explanationForGoal(
  goal: WeekGoal,
  evaluation: WeekGoalEvaluation | undefined,
  week: TrainingWeek,
  mode: WeekMode,
  today: string
) {
  if (goal.category === "mileage") {
    if (mode === "execution" && evaluation?.remainingPlannedValue) {
      return `${formatNumber(evaluation.remainingPlannedValue)} mi still planned.`;
    }
    if (isWithinRange(mode === "review" ? week.actualMileage : week.plannedMileage, goal)) {
      return "Within target range.";
    }
  }

  if (goal.category === "quality") {
    const keyWorkout = keyWorkoutForGoal(week, today);
    if (mode !== "review" && keyWorkout) {
      return `${keyWorkout.title} on ${formatWeekday(keyWorkout.plannedDate)}.`;
    }
    return actualHardDayCount(week) > 0 ? "Quality work completed." : "No quality session completed.";
  }

  if (goal.category === "sessions") {
    const remaining = evaluation?.remainingPlannedValue ?? 0;
    if (mode === "execution" && remaining > 0) {
      return `${formatNumber(remaining)} sessions still planned.`;
    }
  }

  if (goal.category === "recovery") {
    const restDays = mode === "review" ? actualRestDays(week) : plannedRestDays(week);
    return restDays > 0 ? `${restDays} rest day${restDays === 1 ? "" : "s"} ${mode === "review" ? "completed" : "planned"}.` : "Add at least one rest day.";
  }

  if (goal.category === "strength") {
    const remaining = evaluation?.remainingPlannedValue ?? 0;
    if (mode === "execution" && remaining > 0) {
      return `${formatNumber(remaining)} strength session${remaining === 1 ? "" : "s"} still planned.`;
    }
  }

  return userFacingExplanation(evaluation?.detail || evaluation?.summary || goal.description, goal);
}

function longRunExplanation(
  longRun: ReturnType<typeof deriveLongRun>,
  goal: WeekGoal,
  status: GoalDisplayStatus,
  mode: WeekMode
) {
  if (!longRun.distance) {
    return mode === "planning" ? "Add a long run to support the week." : "No long run found.";
  }
  if (status === "planned") {
    return longRun.detail;
  }
  if (status === "achieved" || status === "on_track") {
    return isWithinRange(longRun.distance, goal) ? "Within target range." : longRun.detail;
  }
  if (status === "exceeded") {
    return "Longest run was above target.";
  }
  if (status === "missed") {
    return "Longest run was below target.";
  }
  return longRun.detail;
}

function displayStatusFor(
  goal: WeekGoal,
  evaluation: WeekGoalEvaluation | undefined,
  mode: WeekMode,
  week?: TrainingWeek,
  today?: string
): GoalDisplayStatus {
  if (goal.status === "waived" || evaluation?.status === "waived") {
    return "waived";
  }

  if (mode === "planning") {
    if (evaluation?.status === "exceeded") {
      return "exceeded";
    }
    if (evaluation?.status === "at_risk" || evaluation?.status === "missed") {
      return "at_risk";
    }
    return "planned";
  }

  if (mode === "execution") {
    if (goal.category === "recovery" && week && today && plannedRestDayDates(week).some((date) => date >= today)) {
      return "planned";
    }
    if (
      evaluation?.remainingPlannedValue &&
      evaluation.remainingPlannedValue > 0 &&
      ["long_run", "quality", "sessions", "strength", "recovery"].includes(goal.category) &&
      !evaluation.actualValue
    ) {
      return "planned";
    }
    if (evaluation?.remainingPlannedValue && evaluation.remainingPlannedValue > 0) {
      return evaluation.status === "exceeded" ? "exceeded" : "on_track";
    }
    if (evaluation?.status === "partially_achieved") {
      return "partial";
    }
    return mapEvaluationStatus(evaluation?.status ?? goal.status);
  }

  return mapEvaluationStatus(evaluation?.status ?? goal.status);
}

function mapEvaluationStatus(status: WeekGoalStatus): GoalDisplayStatus {
  if (status === "not_started") {
    return "planned";
  }
  if (status === "partially_achieved") {
    return "partial";
  }
  return status;
}

function severityFor(status: GoalDisplayStatus): DisplaySeverity {
  if (["achieved", "on_track", "planned"].includes(status)) {
    return status === "planned" ? "info" : "success";
  }
  if (["at_risk", "partial", "exceeded"].includes(status)) {
    return "warning";
  }
  if (status === "missed") {
    return "danger";
  }
  return "neutral";
}

function statusLabel(status: GoalDisplayStatus, mode: WeekMode) {
  if (status === "planned") {
    return mode === "execution" ? "Still planned" : "Planned";
  }
  if (mode === "execution" && status === "achieved") {
    return "Completed";
  }
  const labels: Record<GoalDisplayStatus, string> = {
    planned: "Planned",
    on_track: "On track",
    at_risk: "At risk",
    achieved: "Achieved",
    partial: "Partial",
    missed: "Missed",
    exceeded: "Exceeded",
    waived: "Waived",
    no_goal: "No goal"
  };
  return labels[status];
}

function modeLabel(mode: WeekMode) {
  if (mode === "planning") {
    return "Planning week";
  }
  if (mode === "execution") {
    return "Execution week";
  }
  return "Week review";
}

function intentValueForCard(card: GoalCardViewModel) {
  if (card.id === "mileage") {
    const match = card.primaryValue.match(/(?:\/\s*)?(\d+(\.\d+)?)\s*mi/);
    return match ? `${match[1]} mi` : card.primaryValue.replace(" planned", "");
  }
  if (card.id === "quality") {
    const match = card.primaryValue.match(/(?:\/\s*)?(\d+(\.\d+)?)\s*hard/);
    const value = match ? Number(match[1]) : null;
    if (value !== null) {
      return `${formatNumber(value)} hard day${value === 1 ? "" : "s"}`;
    }
  }
  return card.primaryValue.replace(" planned", "");
}

function goalLabel(goal: WeekGoal) {
  const labels: Record<WeekGoal["category"], string> = {
    mileage: "Mileage",
    sessions: inferSessionLabel(goal),
    long_run: "Long run",
    quality: "Quality",
    recovery: "Recovery",
    strength: goal.label.toLowerCase().includes("mobility") ? "Mobility" : "Strength",
    custom: cleanGoalLabel(goal)
  };
  return labels[goal.category];
}

function inferSessionLabel(goal: WeekGoal) {
  return goal.label.toLowerCase().includes("run") ? "Runs" : "Sessions";
}

function cleanGoalLabel(goal: WeekGoal) {
  return goal.label.replace(/^Complete\s+/i, "").replace(/^Run\s+/i, "").trim();
}

function userFacingExplanation(value: string | undefined | null, goal: WeekGoal) {
  if (!value) {
    return goal.description || "Tracked against weekly intent.";
  }
  return value
    .replace(/\s+against\s+\d+(\.\d+)?\s+custom\.?/gi, "")
    .replace(/\s+against\s+custom\.?/gi, "")
    .replace(/\s+planned ahead\.?/gi, " still planned.")
    .replace(/^0 completed, 0 still planned\.?$/i, "No work recorded.")
    .trim();
}

function deriveLongRun(week: TrainingWeek, mode: WeekMode, today: string) {
  const actual = longestActualRun(week);
  const plannedUpcoming = longestPlannedRun(week, (workout) => workout.plannedDate >= today);
  const plannedAny = longestPlannedRun(week);

  if (mode === "review") {
    return actual.distance > 0 ? actual : { ...actual, summary: "No long run", detail: "No completed long run found." };
  }
  if (mode === "execution") {
    if (actual.distance > 0) {
      return actual;
    }
    return plannedUpcoming.distance > 0 ? plannedUpcoming : plannedAny;
  }
  return plannedAny;
}

function longestActualRun(week: TrainingWeek) {
  const activity = week.actualActivities
    .filter((item) => isRunSport(item.sportType))
    .sort((a, b) => b.distanceMiles - a.distanceMiles)[0];
  if (!activity) {
    return { distance: 0, summary: "No long run", detail: "No completed long run found." };
  }
  return {
    distance: activity.distanceMiles,
    summary: `${formatNumber(activity.distanceMiles)} mi`,
    detail: `${activity.name} on ${formatWeekday(activity.activityDate)}.`
  };
}

function longestPlannedRun(week: TrainingWeek, predicate: (workout: Workout) => boolean = () => true) {
  const workout = week.workouts
    .filter((item) => item.sport === "run" && predicate(item))
    .sort((a, b) => (b.plannedDistance ?? 0) - (a.plannedDistance ?? 0))[0];
  if (!workout) {
    return { distance: 0, summary: "Not planned", detail: "No planned long run found." };
  }
  const distance = workout.plannedDistance ?? 0;
  return {
    distance,
    summary: `${formatNumber(distance)} mi`,
    detail: `${workout.title} on ${formatWeekday(workout.plannedDate)}.`
  };
}

function plannedValueForCategory(category: WeekGoal["category"], week: TrainingWeek) {
  if (category === "mileage") {
    return week.plannedMileage;
  }
  if (category === "quality") {
    return plannedHardDayCount(week);
  }
  if (category === "sessions") {
    return plannedSessionCount(week);
  }
  if (category === "strength") {
    return week.workouts.filter((workout) => workout.sport === "strength" || workout.sport === "mobility").length;
  }
  return 0;
}

function actualValueForCategory(category: WeekGoal["category"], week: TrainingWeek) {
  if (category === "mileage") {
    return week.actualMileage;
  }
  if (category === "quality") {
    return actualHardDayCount(week);
  }
  if (category === "sessions") {
    return completedSessionCount(week);
  }
  if (category === "strength") {
    return week.actualActivities.filter((activity) => /strength|mobility|workout/i.test(activity.sportType + activity.name)).length;
  }
  return 0;
}

function plannedSessionCount(week: TrainingWeek) {
  return week.workouts.filter((workout) => workout.sport !== "rest").length;
}

function completedSessionCount(week: TrainingWeek) {
  return week.actualActivities.length;
}

function plannedHardDayCount(week: TrainingWeek) {
  return new Set(week.workouts.filter(isQualityWorkout).map((workout) => workout.plannedDate)).size;
}

function actualHardDayCount(week: TrainingWeek) {
  return new Set(
    week.actualActivities
      .filter((activity) => /tempo|threshold|interval|hill|race|workout|reps|repeat|fartlek/i.test(activity.name))
      .map((activity) => activity.activityDate)
  ).size;
}

function plannedRestDays(week: TrainingWeek) {
  return 7 - new Set(week.workouts.filter((workout) => workout.sport !== "rest").map((workout) => workout.plannedDate)).size;
}

function plannedRestDayDates(week: TrainingWeek) {
  const activeDates = new Set(week.workouts.filter((workout) => workout.sport !== "rest").map((workout) => workout.plannedDate));
  const dates: string[] = [];
  const cursor = parseDate(week.weekStartDate);
  const end = parseDate(week.weekEndDate);

  while (cursor <= end) {
    const dateValue = formatIsoDate(cursor);
    if (!activeDates.has(dateValue)) {
      dates.push(dateValue);
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

function actualRestDays(week: TrainingWeek) {
  return 7 - new Set(week.actualActivities.map((activity) => activity.activityDate)).size;
}

function keyWorkoutForGoal(week: TrainingWeek, today: string) {
  return week.workouts.find((workout) => isQualityWorkout(workout) && workout.plannedDate >= today) ?? week.workouts.find(isQualityWorkout);
}

function upcomingKeyWorkout(week: TrainingWeek, today: string) {
  return week.workouts.find((workout) => isQualityWorkout(workout) && workout.plannedDate >= today);
}

function isQualityWorkout(workout: Workout) {
  return workout.intensityCategory === "workout" || workout.intensityCategory === "race" || QUALITY_TYPES.has(workout.workoutType);
}

function isRunSport(sportType: string) {
  return /run/i.test(sportType);
}

function isWithinRange(value: number, goal: WeekGoal) {
  if (goal.minAcceptable !== null && value < goal.minAcceptable) {
    return false;
  }
  if (goal.maxAcceptable !== null && value > goal.maxAcceptable) {
    return false;
  }
  return true;
}

function projectedTargetMiles(week: TrainingWeek, mileageCard: GoalCardViewModel | undefined) {
  const match = mileageCard?.primaryValue.match(/\/\s*(\d+(\.\d+)?)\s*mi/);
  return match ? Number(match[1]) : week.plannedMileage;
}

function goalOrder(id: string) {
  return ["mileage", "quality", "long_run", "recovery", "sessions", "strength", "custom"].indexOf(id);
}

function isPrimaryGoalCard(id: string) {
  return ["mileage", "quality", "long_run", "recovery"].includes(id);
}

function formatWeekRange(start: string, end: string) {
  return `${formatShortDate(start)}-${formatShortDate(end)}`;
}

function formatShortDate(dateValue: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(parseDate(dateValue));
}

function formatWeekday(dateValue: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(parseDate(dateValue));
}

function parseDate(dateValue: string) {
  const [year, month, day] = dateValue.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatIsoDate(dateValue: Date) {
  const year = dateValue.getFullYear();
  const month = String(dateValue.getMonth() + 1).padStart(2, "0");
  const day = String(dateValue.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

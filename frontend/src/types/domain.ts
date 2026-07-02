export type ApiVersion = {
  frontendMinVersion: string;
  backendVersion: string;
  schemaVersion: string;
  forceReload: boolean;
};

export type Workout = {
  id: string;
  trainingWeekId: string;
  athleteAccountId: string;
  plannedDate: string;
  title: string;
  sport: "run" | "strength" | "cross_training" | "rest" | "mobility" | "other";
  workoutType:
    | "easy"
    | "recovery"
    | "long_run"
    | "medium_long"
    | "tempo"
    | "threshold"
    | "interval"
    | "hill"
    | "race"
    | "time_trial"
    | "progression"
    | "strides"
    | "strength"
    | "mobility"
    | "rest"
    | "other";
  intensityCategory: "rest" | "easy" | "moderate" | "workout" | "race" | "strength";
  plannedDistance: number | null;
  plannedDuration: number | null;
  plannedElevation: number | null;
  plannedTss: number | null;
  purpose: string;
  instructions: string;
  notes: string;
  status:
    | "planned"
    | "completed_as_planned"
    | "completed_modified"
    | "missed"
    | "moved"
    | "replaced"
    | "skipped_intentionally"
    | "partial";
};

export type WeekGoalCategory = "mileage" | "sessions" | "long_run" | "quality" | "recovery" | "strength" | "custom";
export type WeekGoalType = "achievement" | "guardrail";
export type WeekGoalUnit = "mi" | "sessions" | "days" | "percent" | "boolean" | "custom";
export type WeekGoalEvaluationMode = "at_least" | "at_most" | "range" | "exact-ish" | "boolean" | "manual";
export type WeekGoalPriority = "primary" | "secondary" | "guardrail";
export type WeekGoalStatus =
  | "not_started"
  | "on_track"
  | "at_risk"
  | "achieved"
  | "partially_achieved"
  | "missed"
  | "exceeded"
  | "waived";
export type WeekGoalSource = "manual" | "derived_from_plan" | "template" | "ai_suggested";
export type GoalSeverity = "info" | "success" | "warning" | "danger";
export type WeekState = "past" | "current" | "future";
export type FieldSource = "manual" | "plan";
export type RaceDistance = "5k" | "10k" | "half_marathon" | "marathon" | "other";
export type RacePriority = "A" | "B" | "C";
export type PlanStatus = "active" | "completed" | "archived";
export type MesocyclePhase = "base" | "build" | "specific" | "taper" | "race" | "recovery" | "maintenance";
export type PlanGoalCategory =
  | "race_time"
  | "peak_weekly_mileage"
  | "weekly_mileage_progression"
  | "long_run_progression"
  | "consistency"
  | "custom";
export type PlanPreviewAction = "create" | "annotate" | "update" | "skip_overridden" | "unlink";

export type WeekGoal = {
  id: string;
  trainingWeekId: string;
  athleteAccountId: string;
  weekStartDate: string;
  category: WeekGoalCategory;
  goalType: WeekGoalType;
  label: string;
  description: string;
  targetValue: number | null;
  minAcceptable: number | null;
  maxAcceptable: number | null;
  unit: WeekGoalUnit;
  evaluationMode: WeekGoalEvaluationMode;
  priority: WeekGoalPriority;
  status: WeekGoalStatus;
  source: WeekGoalSource;
  isEditable: boolean;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WeekGoalEvaluation = {
  goalId: string;
  weekStartDate: string;
  status: WeekGoalStatus;
  guardrailStatus: "ok" | "warning" | "danger" | "waived" | "not_applicable" | null;
  actualValue: number | null;
  plannedValue: number | null;
  remainingPlannedValue: number | null;
  summary: string;
  detail: string | null;
  severity: GoalSeverity;
  evaluatedAt: string;
  contributingWorkoutIds: string[];
  contributingActivityIds: string[];
};

export type TrainingWeek = {
  id: string;
  weekStartDate: string;
  weekEndDate: string;
  plannedMileage: number;
  actualMileage: number;
  plannedTime: number | null;
  actualTime: number | null;
  mesocycleId: string | null;
  purpose: WeekPurposeId | string;
  purposeSource: FieldSource;
  targetMileage: number | null;
  targetMileageSource: FieldSource;
  targetLongRunDistance: number | null;
  targetLongRunSource: FieldSource;
  isDownWeek: boolean;
  notes: string;
  workouts: Workout[];
  actualActivities: ActualActivity[];
  goals: WeekGoal[];
  goalEvaluations: WeekGoalEvaluation[];
  weekState: WeekState;
  goalReviewSummary: string;
  hardDays: number;
  longRunDistance: number;
  longRunPercentage: number;
};

export type ActualActivity = {
  id: string;
  stravaActivityId: string;
  name: string;
  sportType: string;
  startDateLocal: string;
  activityDate: string;
  distance: number;
  distanceMiles: number;
  movingTime: number | null;
  averageHeartrate: number | null;
};

export type StravaStatus = {
  connected: boolean;
  configured: boolean;
  athleteName: string | null;
  grantedScopes: string[];
  expiresAt: string | null;
  message: string;
};

export type StravaActivity = {
  id: string;
  stravaActivityId: string;
  name: string;
  sportType: string;
  startDateLocal: string;
  distanceMiles: number;
  movingTime: number | null;
  totalElevationGain: number | null;
  averageHeartrate: number | null;
  private: boolean;
};

export type AnalyticsRiskLevel = "clear" | "watch" | "revise";

export type AnalyticsInsight = {
  id: string;
  title: string;
  detail: string;
  recommendation: string;
  riskLevel: AnalyticsRiskLevel;
  weekStartDate: string | null;
  metric: string;
};

export type AnalyticsLoadBand = {
  baselineMileage: number | null;
  floorMileage: number | null;
  ceilingMileage: number | null;
  watchCeilingMileage: number | null;
  reviseCeilingMileage: number | null;
  sourceWeeks: number;
};

export type AnalyticsWeekSummary = {
  weekStartDate: string;
  weekEndDate: string;
  weekState: WeekState;
  plannedMileage: number;
  actualMileage: number;
  comparisonMileage: number;
  hardDays: number;
  actualHardDays: number;
  restDays: number;
  actualRestDays: number;
  hasBackToBackHardDays: boolean;
  longRunDistance: number;
  longRunPercentage: number;
  loadRisk: AnalyticsRiskLevel;
  longRunRisk: AnalyticsRiskLevel;
  intensityRisk: AnalyticsRiskLevel;
  recoveryRisk: AnalyticsRiskLevel;
  hasPlan: boolean;
  hasActuals: boolean;
};

export type AnalyticsGoalReliability = {
  category: WeekGoalCategory;
  achieved: number;
  onTrack: number;
  atRisk: number;
  missed: number;
  exceeded: number;
  waived: number;
  total: number;
};

export type AnalyticsPlanning = {
  anchorWeekStartDate: string;
  generatedAt: string;
  lookbackWeeks: number;
  futureWeeks: number;
  primaryRecommendation: AnalyticsInsight;
  insights: AnalyticsInsight[];
  loadBand: AnalyticsLoadBand;
  weeks: AnalyticsWeekSummary[];
  goalReliability: AnalyticsGoalReliability[];
};

export type SyncJob = {
  id: string;
  jobType: string;
  status: string;
  activitiesFetched: number;
  activitiesCreated: number;
  activitiesUpdated: number;
  errorMessage: string | null;
};

export type SessionUser = {
  id: string;
  username: string;
  displayName: string;
  isAdmin: boolean;
};

export type AthleteProfile = {
  id: string;
  displayName: string;
  timezone: string;
  stravaAthleteId: string | null;
};

export type SessionStatus = {
  authenticated: boolean;
  configured: boolean;
  username: string | null;
  user: SessionUser | null;
  activeAthleteAccountId: string | null;
  profiles: AthleteProfile[];
};

export type LoginForm = {
  username: string;
  password: string;
};

export type AdminUserForm = {
  username: string;
  displayName: string;
  password: string;
  initialProfileName: string;
  timezone: string;
  isAdmin: boolean;
};

export type ProfileForm = {
  displayName: string;
  timezone: string;
};

export type WorkoutForm = {
  id?: string;
  plannedDate: string;
  title: string;
  sport: Workout["sport"];
  workoutType: Workout["workoutType"];
  intensityCategory: Workout["intensityCategory"];
  plannedDistance: string;
  plannedDuration: string;
  purpose: string;
  instructions: string;
  notes: string;
  status: Workout["status"];
};

export type WeekGoalForm = {
  id?: string;
  weekId: string;
  category: WeekGoalCategory;
  goalType: WeekGoalType;
  label: string;
  description: string;
  targetValue: string;
  minAcceptable: string;
  maxAcceptable: string;
  unit: WeekGoalUnit;
  evaluationMode: WeekGoalEvaluationMode;
  priority: WeekGoalPriority;
  status: WeekGoalStatus;
  isEnabled: boolean;
};

export type PlanStartingPoint = "existing" | "copy_prior" | "smart_adjustment" | "blank";
export type WeekPurposeId =
  | "aerobic_build"
  | "maintain"
  | "down_week"
  | "workout_focus"
  | "long_run_focus"
  | "recovery"
  | "race_week"
  | "custom";
export type AlignmentStatus = "aligned" | "mismatch";

export type PlanWeekWorkoutDraft = WorkoutForm & {
  draftId: string;
};

export type PlanWeekGoalDraft = WeekGoalForm & {
  draftId: string;
  source: WeekGoalSource;
  sourceLabel: string;
  qualityType?: "any" | "threshold" | "tempo" | "intervals" | "hills" | "race";
  preferredDay?: string;
  noBackToBackHardDays?: boolean;
  strengthRequired?: boolean;
  manuallyEdited?: boolean;
};

export type PlanWeekDraft = {
  weekId: string;
  weekStartDate: string;
  weekEndDate: string;
  weekState: WeekState;
  startingPoint: PlanStartingPoint;
  purpose: WeekPurposeId;
  customPurpose: string;
  priorWeekStartDate: string | null;
  noPriorUsableWeek: boolean;
  load: ProposedLoad;
  workouts: PlanWeekWorkoutDraft[];
  goals: PlanWeekGoalDraft[];
  hasExistingPlan: boolean;
  mismatchAcknowledged: boolean;
};

export type GoalRace = {
  id: string;
  athleteAccountId: string;
  name: string;
  raceDate: string;
  distance: RaceDistance;
  distanceMiles: number | null;
  targetTime: number | null;
  priority: RacePriority;
  location: string;
  altitudeContext: string;
  notes: string;
  targetPaceSecondsPerMile: number | null;
  createdAt: string;
  updatedAt: string;
};

export type Mesocycle = {
  id: string;
  trainingPlanId: string;
  athleteAccountId: string;
  orderIndex: number;
  name: string;
  phase: MesocyclePhase;
  startDate: string;
  endDate: string;
  targetMileageStart: number | null;
  targetMileageEnd: number | null;
  longRunStart: number | null;
  longRunEnd: number | null;
  downWeekCadence: number | null;
  downWeekReductionPct: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type PlanGoal = {
  id: string;
  trainingPlanId: string;
  athleteAccountId: string;
  category: PlanGoalCategory;
  label: string;
  targetValue: number | null;
  unit: WeekGoalUnit | "time";
  flowsDown: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type PlanWeekSummary = {
  weekStartDate: string;
  weekEndDate: string;
  mesocycleId: string | null;
  mesocycleName: string | null;
  mesocyclePhase: MesocyclePhase | null;
  weekIndexInMesocycle: number | null;
  mesocycleWeekCount: number | null;
  plannedMileage: number;
  actualMileage: number;
  targetMileage: number | null;
  targetLongRunDistance: number | null;
  purpose: WeekPurposeId | string;
  purposeSource: FieldSource;
  targetMileageSource: FieldSource;
  targetLongRunSource: FieldSource;
  isDownWeek: boolean;
  hasManualOverride: boolean;
  warning: string | null;
};

export type TrainingPlanSummary = {
  id: string;
  athleteAccountId: string;
  name: string;
  description: string;
  goalRaceId: string | null;
  goalRaceName: string | null;
  startDate: string;
  endDate: string;
  status: PlanStatus;
  notes: string;
  isCurrent: boolean;
  isUpcoming: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TrainingPlan = TrainingPlanSummary & {
  goalRace: GoalRace | null;
  mesocycles: Mesocycle[];
  planGoals: PlanGoal[];
  weekSummaries: PlanWeekSummary[];
};

export type ScaffoldPreviewChange = {
  field: string;
  from: string | number | boolean | null;
  to: string | number | boolean | null;
};

export type ScaffoldPreviewWeek = {
  weekStartDate: string;
  action: PlanPreviewAction;
  changes: ScaffoldPreviewChange[];
  warnings: string[];
};

export type ScaffoldPreview = {
  weeks: ScaffoldPreviewWeek[];
  warnings: string[];
};

export type ProposedLoad = {
  priorMileage: number | null;
  suggestedMileage: number;
  reason: string;
};

export type AlignmentItem = {
  id: string;
  label: string;
  detail: string;
  status: AlignmentStatus;
};

export type WeekSelectSource = "header" | "time-rail" | "week-stack";
export type MileageTrendDirection = "up" | "down" | "same";
export type MileageTrend = {
  direction: MileageTrendDirection;
  delta: number;
};

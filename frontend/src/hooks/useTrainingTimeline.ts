import { useMemo } from "react";

export type TrainingTimelineIndex = {
  years: TimelineYear[];
  selectedWeekStartDate: string;
  currentWeekStartDate: string;
};

export type TrainingTimelineSummary = {
  oldestWeekStartDate: string | null;
  newestWeekStartDate: string | null;
  months: TrainingTimelineMonthSummary[];
};

export type TrainingTimelineMonthSummary = {
  year: number;
  month: number;
  hasPlan: boolean;
  hasActivities: boolean;
  plannedMiles?: number | null;
  actualMiles?: number | null;
};

export type TimelineYear = {
  year: number;
  months: TimelineMonth[];
  hasData: boolean;
  isExpandedByDefault: boolean;
};

export type TimelineMonth = {
  year: number;
  month: number;
  label: string;
  anchorWeekStartDate: string;
  hasActivities: boolean;
  hasPlan: boolean;
  plannedMiles?: number;
  actualMiles?: number;
  races: TimelineRaceMarker[];
  blockMarkers: TimelineBlockMarker[];
  isSelectedMonth: boolean;
  isCurrentMonth: boolean;
};

export type TimelineRaceMarker = {
  id: string;
  name: string;
  date: string;
  weekStartDate: string;
  distance?: string;
  priority?: "A" | "B" | "C";
};

export type TimelineBlockMarker = {
  id: string;
  label: string;
  type: "block_start" | "block_end" | "phase_change";
  date: string;
  weekStartDate: string;
};

export type TimelineWeekSummary = {
  weekStartDate: string;
  plannedMileage: number;
  actualMileage: number;
};

type UseTrainingTimelineOptions = {
  currentWeekStartDate: string;
  selectedWeekStartDate: string;
  timelineSummary: TrainingTimelineSummary | null;
  weekStack: Record<string, TimelineWeekSummary>;
};

export function useTrainingTimeline({
  currentWeekStartDate,
  selectedWeekStartDate,
  timelineSummary,
  weekStack
}: UseTrainingTimelineOptions): TrainingTimelineIndex {
  return useMemo(() => {
    const loadedWeekStartDates = Object.keys(weekStack);
    const startDate = earliestDate([
      timelineSummary?.oldestWeekStartDate,
      currentWeekStartDate,
      selectedWeekStartDate
    ]);
    const endDate = latestDate([
      timelineSummary?.newestWeekStartDate,
      currentWeekStartDate,
      selectedWeekStartDate,
      ...loadedWeekStartDates
    ]);
    const currentYear = parseDate(currentWeekStartDate).getFullYear();
    const selectedYear = parseDate(selectedWeekStartDate).getFullYear();
    const startYear = parseDate(startDate).getFullYear();
    const endYear = parseDate(endDate).getFullYear();
    const races: TimelineRaceMarker[] = [];
    const monthSummaryMap = new Map(
      timelineSummary?.months.map((month) => [`${month.year}-${month.month}`, month]) ?? []
    );

    const years: TimelineYear[] = [];

    for (let year = startYear; year <= endYear; year += 1) {
      const isExpandedByDefault = year === currentYear || year === selectedYear;
      const firstMonth = year === startYear ? parseDate(startDate).getMonth() + 1 : 1;
      const lastMonth = year === endYear ? parseDate(endDate).getMonth() + 1 : 12;
      const months = Array.from({ length: lastMonth - firstMonth + 1 }, (_, index) =>
        buildMonth(year, firstMonth + index, {
          currentWeekStartDate,
          monthSummaryMap,
          races,
          selectedWeekStartDate,
          weekStack
        })
      );

      years.push({
        year,
        months,
        hasData:
          months.some((month) => month.hasActivities || month.hasPlan || month.races.length) ||
          year === currentYear ||
          year === selectedYear,
        isExpandedByDefault
      });
    }

    return {
      years,
      selectedWeekStartDate,
      currentWeekStartDate
    };
  }, [currentWeekStartDate, selectedWeekStartDate, timelineSummary, weekStack]);
}

function buildMonth(
  year: number,
  month: number,
  {
    currentWeekStartDate,
    monthSummaryMap,
    races,
    selectedWeekStartDate,
    weekStack
  }: {
    currentWeekStartDate: string;
    monthSummaryMap: Map<string, TrainingTimelineMonthSummary>;
    races: TimelineRaceMarker[];
    selectedWeekStartDate: string;
    weekStack: Record<string, TimelineWeekSummary>;
  }
): TimelineMonth {
  const monthSummary = monthSummaryMap.get(`${year}-${month}`);
  const monthRaces = races.filter((race) => {
    const raceDate = parseDate(race.date);
    return raceDate.getFullYear() === year && raceDate.getMonth() + 1 === month;
  });
  const weekSummaries = Object.values(weekStack).filter((week) => {
    const weekDate = parseDate(week.weekStartDate);
    return weekDate.getFullYear() === year && weekDate.getMonth() + 1 === month;
  });
  const firstOfMonth = toDateInputValue(new Date(year, month - 1, 1));
  const anchorWeekStartDate = resolveMonthAnchor({
    currentWeekStartDate,
    firstOfMonth,
    month,
    races: monthRaces,
    selectedWeekStartDate,
    year
  });

  return {
    year,
    month,
    label: new Intl.DateTimeFormat("en-US", { month: "short" }).format(new Date(year, month - 1, 1)),
    anchorWeekStartDate,
    hasActivities: Boolean(monthSummary?.hasActivities) || weekSummaries.some((week) => week.actualMileage > 0),
    hasPlan: Boolean(monthSummary?.hasPlan) || weekSummaries.some((week) => week.plannedMileage > 0),
    plannedMiles: monthSummary?.plannedMiles ?? sumOptional(weekSummaries.map((week) => week.plannedMileage)),
    actualMiles: monthSummary?.actualMiles ?? sumOptional(weekSummaries.map((week) => week.actualMileage)),
    races: monthRaces,
    blockMarkers: [],
    isSelectedMonth: isSameYearMonth(selectedWeekStartDate, year, month),
    isCurrentMonth: isSameYearMonth(currentWeekStartDate, year, month)
  };
}

function resolveMonthAnchor({
  currentWeekStartDate,
  firstOfMonth,
  month,
  races,
  selectedWeekStartDate,
  year
}: {
  currentWeekStartDate: string;
  firstOfMonth: string;
  month: number;
  races: TimelineRaceMarker[];
  selectedWeekStartDate: string;
  year: number;
}) {
  if (isSameYearMonth(currentWeekStartDate, year, month)) {
    return currentWeekStartDate;
  }

  if (races.length) {
    return races[0].weekStartDate;
  }

  if (isSameYearMonth(selectedWeekStartDate, year, month)) {
    return selectedWeekStartDate;
  }

  return startOfWeek(parseDate(firstOfMonth));
}

function sumOptional(values: number[]) {
  const sum = values.reduce((total, value) => total + value, 0);
  return sum > 0 ? Number(sum.toFixed(1)) : undefined;
}

function earliestDate(values: Array<string | null | undefined>) {
  return values.filter(isDateValue).sort()[0] ?? toDateInputValue(new Date());
}

function latestDate(values: Array<string | null | undefined>) {
  return values.filter(isDateValue).sort().at(-1) ?? toDateInputValue(new Date());
}

function isDateValue(value: string | null | undefined): value is string {
  return Boolean(value);
}

function isSameYearMonth(dateValue: string, year: number, month: number) {
  const date = parseDate(dateValue);
  return date.getFullYear() === year && date.getMonth() + 1 === month;
}

function startOfWeek(date: Date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + offset);
  return toDateInputValue(copy);
}

function parseDate(dateValue: string) {
  const [year, month, day] = dateValue.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

import { useMemo } from "react";

export type TrainingTimelineIndex = {
  years: TimelineYear[];
  selectedWeekStartDate: string;
  currentWeekStartDate: string;
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
  weekStack: Record<string, TimelineWeekSummary>;
};

const MOCK_RACES: Array<Omit<TimelineRaceMarker, "weekStartDate">> = [
  {
    id: "rockin-river-5k-2026",
    name: "Rockin' on the River 5k",
    date: "2026-04-19",
    distance: "5k",
    priority: "B"
  },
  {
    id: "super-sunday-5k-2026",
    name: "Super Sunday 5k",
    date: "2026-02-08",
    distance: "5k",
    priority: "C"
  }
];

export function useTrainingTimeline({
  currentWeekStartDate,
  selectedWeekStartDate,
  weekStack
}: UseTrainingTimelineOptions): TrainingTimelineIndex {
  return useMemo(() => {
    const currentYear = parseDate(currentWeekStartDate).getFullYear();
    const currentMonth = parseDate(currentWeekStartDate).getMonth() + 1;
    const selectedYear = parseDate(selectedWeekStartDate).getFullYear();
    const selectedMonth = parseDate(selectedWeekStartDate).getMonth() + 1;
    const startYear = Math.min(currentYear - 4, selectedYear);
    const endYear = Math.max(currentYear, selectedYear);
    const races = MOCK_RACES.map((race) => ({
      ...race,
      weekStartDate: startOfWeek(parseDate(race.date))
    }));

    const years: TimelineYear[] = [];

    for (let year = startYear; year <= endYear; year += 1) {
      const isExpandedByDefault = year === currentYear || year === selectedYear;
      const topMonth = year === currentYear ? Math.max(currentMonth, year === selectedYear ? selectedMonth : currentMonth) : 12;
      const months = isExpandedByDefault
        ? Array.from({ length: topMonth }, (_, index) => buildMonth(year, index + 1, {
            currentWeekStartDate,
            races,
            selectedWeekStartDate,
            weekStack
          }))
        : [];

      years.push({
        year,
        months,
        hasData: year === currentYear || year === selectedYear || races.some((race) => parseDate(race.date).getFullYear() === year),
        isExpandedByDefault
      });
    }

    return {
      years,
      selectedWeekStartDate,
      currentWeekStartDate
    };
  }, [currentWeekStartDate, selectedWeekStartDate, weekStack]);
}

function buildMonth(
  year: number,
  month: number,
  {
    currentWeekStartDate,
    races,
    selectedWeekStartDate,
    weekStack
  }: {
    currentWeekStartDate: string;
    races: TimelineRaceMarker[];
    selectedWeekStartDate: string;
    weekStack: Record<string, TimelineWeekSummary>;
  }
): TimelineMonth {
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
    hasActivities: weekSummaries.some((week) => week.actualMileage > 0),
    hasPlan: weekSummaries.some((week) => week.plannedMileage > 0),
    plannedMiles: sumOptional(weekSummaries.map((week) => week.plannedMileage)),
    actualMiles: sumOptional(weekSummaries.map((week) => week.actualMileage)),
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

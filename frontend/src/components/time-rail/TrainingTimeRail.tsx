import { ChevronDown, X } from "lucide-react";
import type { FocusEvent } from "react";
import { useEffect, useRef, useState } from "react";
import type { TimelineMonth, TrainingTimelineIndex } from "../../hooks/useTrainingTimeline";

type TrainingTimeRailProps = {
  index: TrainingTimelineIndex;
  onJumpToThisWeek: () => void;
  onSelectWeek: (weekStartDate: string) => void;
};

export function TrainingTimeRail({ index, onJumpToThisWeek, onSelectWeek }: TrainingTimeRailProps) {
  const [expandedYears, setExpandedYears] = useState<Set<number>>(() => defaultExpandedYears(index));
  const [isHoverExpanded, setIsHoverExpanded] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);
  const isExpanded = isHoverExpanded || isPinned;

  useEffect(() => {
    setExpandedYears((current) => {
      const next = new Set(current);
      index.years.forEach((year) => {
        if (year.isExpandedByDefault) {
          next.add(year.year);
        }
      });
      return next;
    });
  }, [index.years]);

  function clearTimers() {
    if (openTimer.current !== null) {
      window.clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function scheduleOpen() {
    clearTimers();
    openTimer.current = window.setTimeout(() => setIsHoverExpanded(true), 130);
  }

  function scheduleClose() {
    clearTimers();
    if (isPinned) {
      return;
    }
    closeTimer.current = window.setTimeout(() => setIsHoverExpanded(false), 240);
  }

  function handleBlur(event: FocusEvent<HTMLElement>) {
    if (event.currentTarget.contains(event.relatedTarget)) {
      return;
    }
    scheduleClose();
  }

  function toggleYear(year: number) {
    setExpandedYears((current) => {
      const next = new Set(current);
      if (next.has(year)) {
        next.delete(year);
      } else {
        next.add(year);
      }
      return next;
    });
  }

  function selectWeek(weekStartDate: string) {
    onSelectWeek(weekStartDate);
    setIsMobileOpen(false);
  }

  return (
    <>
      <button className="time-rail-mobile-trigger" type="button" onClick={() => setIsMobileOpen(true)}>
        Jump
      </button>

      <aside
        className={`time-rail ${isExpanded ? "is-expanded" : ""} ${isPinned ? "is-pinned" : ""}`}
        aria-label="Training time navigation"
        onFocus={scheduleOpen}
        onBlur={handleBlur}
        onMouseEnter={scheduleOpen}
        onMouseLeave={scheduleClose}
      >
        <div className="time-rail-axis">
          <button
            className="time-rail-handle"
            type="button"
            aria-label={isPinned ? "Unpin timeline" : "Pin timeline"}
            title={isPinned ? "Unpin timeline" : "Pin timeline"}
            aria-pressed={isPinned}
            onClick={() => {
              setIsHoverExpanded(true);
              setIsPinned((current) => !current);
            }}
          >
            <span />
          </button>
          <span className="time-rail-line" />
          <span className="time-rail-collapsed-year">{collapsedYearLabel(index)}</span>
          {collapsedMonths(index).map((month) => (
            <div className="time-rail-axis-month" key={`${month.year}-${month.month}`}>
              <button
                className={`time-rail-tick ${month.isSelectedMonth ? "selected" : ""} ${month.isCurrentMonth ? "current" : ""} ${month.races.length ? "has-race" : ""}`}
                type="button"
                aria-label={`Jump to ${month.label} ${month.year}`}
                title={`Jump to ${month.label} ${month.year}`}
                onClick={() => selectWeek(month.anchorWeekStartDate)}
              >
                <span>{month.label}</span>
                <small>{monthSummary(month)}</small>
              </button>
              {month.races.map((race) => (
                <button
                  className="time-rail-axis-race"
                  key={race.id}
                  type="button"
                  onClick={() => selectWeek(race.weekStartDate)}
                >
                  <span />
                  <strong>{race.name}</strong>
                </button>
              ))}
            </div>
          ))}
        </div>
      </aside>

      {isMobileOpen ? (
        <div className="time-rail-sheet-backdrop" role="presentation" onClick={() => setIsMobileOpen(false)}>
          <aside
            className="time-rail-sheet"
            aria-label="Jump through training timeline"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <h2>Jump</h2>
              <button type="button" title="Close" onClick={() => setIsMobileOpen(false)}>
                <X size={18} />
              </button>
            </header>
            <button className="time-rail-this-week" type="button" onClick={onJumpToThisWeek}>
              This week
            </button>
            <TimelineArchive
              expandedYears={expandedYears}
              index={index}
              onSelectWeek={selectWeek}
              onToggleYear={toggleYear}
            />
          </aside>
        </div>
      ) : null}
    </>
  );
}

function TimelineArchive({
  expandedYears,
  index,
  onSelectWeek,
  onToggleYear
}: {
  expandedYears: Set<number>;
  index: TrainingTimelineIndex;
  onSelectWeek: (weekStartDate: string) => void;
  onToggleYear: (year: number) => void;
}) {
  return (
    <div className="time-rail-archive">
      {index.years.map((year) => {
        const isExpanded = expandedYears.has(year.year);
        return (
          <section className="time-rail-year" key={year.year}>
            <button
              className="time-rail-year-button"
              type="button"
              aria-expanded={isExpanded}
              onClick={() => onToggleYear(year.year)}
            >
              <span>{year.year}</span>
              <ChevronDown size={14} aria-hidden="true" />
            </button>

            {isExpanded ? (
              <div className="time-rail-months">
                {year.months.map((month) => (
                  <TimeRailMonth month={month} key={`${month.year}-${month.month}`} onSelectWeek={onSelectWeek} />
                ))}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

function TimeRailMonth({
  month,
  onSelectWeek
}: {
  month: TimelineMonth;
  onSelectWeek: (weekStartDate: string) => void;
}) {
  return (
    <div className="time-rail-month">
      <button
        className={`time-rail-month-button ${month.isSelectedMonth ? "selected" : ""} ${month.isCurrentMonth ? "current" : ""}`}
        type="button"
        aria-current={month.isSelectedMonth ? "date" : undefined}
        onClick={() => onSelectWeek(month.anchorWeekStartDate)}
      >
        <span>{month.label}</span>
        <small>{monthSummary(month)}</small>
      </button>
      {month.races.map((race) => (
        <button className="time-rail-race" key={race.id} type="button" onClick={() => onSelectWeek(race.weekStartDate)}>
          <span />
          <strong>{race.name}</strong>
          <small>{formatShortDate(race.date)}</small>
        </button>
      ))}
    </div>
  );
}

function defaultExpandedYears(index: TrainingTimelineIndex) {
  return new Set(index.years.filter((year) => year.isExpandedByDefault).map((year) => year.year));
}

function collapsedYearLabel(index: TrainingTimelineIndex) {
  return index.years.find((year) => year.months.some((month) => month.isSelectedMonth))?.year ?? index.years[0]?.year;
}

function collapsedMonths(index: TrainingTimelineIndex) {
  const selectedYear = index.years.find((year) => year.months.some((month) => month.isSelectedMonth));
  const currentYear = index.years.find((year) => year.months.some((month) => month.isCurrentMonth));
  const year = selectedYear ?? currentYear ?? index.years.find((item) => item.months.length) ?? index.years[0];
  return year?.months ?? [];
}

function monthSummary(month: TimelineMonth) {
  if (month.actualMiles) {
    return `${month.actualMiles} mi`;
  }
  if (month.plannedMiles) {
    return `${month.plannedMiles} planned`;
  }
  if (month.races.length) {
    return `${month.races.length} race${month.races.length === 1 ? "" : "s"}`;
  }
  return month.isCurrentMonth ? "current" : "";
}

function formatShortDate(dateValue: string) {
  const date = new Date(`${dateValue}T00:00:00`);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

from dataclasses import dataclass
from typing import Literal

GoalMetricKey = Literal[
    "weekly_run_distance",
    "training_session_count",
    "longest_run_distance",
    "hard_training_day_count",
    "rest_day_count",
    "strength_session_count",
    "long_run_share",
    "back_to_back_hard_pairs",
]


@dataclass(frozen=True)
class GoalMetricDefinition:
    key: GoalMetricKey
    label: str
    category: str
    unit: str
    value_type: Literal["integer", "decimal"]
    operators: tuple[str, ...]
    minimum: float = 0
    maximum: float | None = None


GOAL_METRICS: dict[GoalMetricKey, GoalMetricDefinition] = {
    "weekly_run_distance": GoalMetricDefinition(
        key="weekly_run_distance",
        label="Weekly running distance",
        category="mileage",
        unit="mi",
        value_type="decimal",
        operators=("at_least", "at_most", "range", "exact-ish"),
    ),
    "training_session_count": GoalMetricDefinition(
        key="training_session_count",
        label="Training sessions",
        category="sessions",
        unit="sessions",
        value_type="integer",
        operators=("at_least", "at_most", "range", "exact-ish"),
    ),
    "longest_run_distance": GoalMetricDefinition(
        key="longest_run_distance",
        label="Longest run distance",
        category="long_run",
        unit="mi",
        value_type="decimal",
        operators=("at_least", "at_most", "range", "exact-ish"),
    ),
    "hard_training_day_count": GoalMetricDefinition(
        key="hard_training_day_count",
        label="Hard training days",
        category="quality",
        unit="days",
        value_type="integer",
        operators=("at_least", "at_most", "range", "exact-ish"),
        maximum=7,
    ),
    "rest_day_count": GoalMetricDefinition(
        key="rest_day_count",
        label="Rest days",
        category="recovery",
        unit="days",
        value_type="integer",
        operators=("at_least", "at_most", "range", "exact-ish"),
        maximum=7,
    ),
    "strength_session_count": GoalMetricDefinition(
        key="strength_session_count",
        label="Strength or mobility sessions",
        category="strength",
        unit="sessions",
        value_type="integer",
        operators=("at_least", "at_most", "range", "exact-ish"),
    ),
    "long_run_share": GoalMetricDefinition(
        key="long_run_share",
        label="Long run share of weekly distance",
        category="long_run",
        unit="percent",
        value_type="decimal",
        operators=("at_least", "at_most", "range"),
        maximum=100,
    ),
    "back_to_back_hard_pairs": GoalMetricDefinition(
        key="back_to_back_hard_pairs",
        label="Back-to-back hard-day pairs",
        category="recovery",
        unit="days",
        value_type="integer",
        operators=("at_most", "exact-ish"),
        maximum=6,
    ),
}


def infer_goal_metric(category: str, unit: str) -> GoalMetricKey | None:
    mapping: dict[tuple[str, str], GoalMetricKey] = {
        ("mileage", "mi"): "weekly_run_distance",
        ("sessions", "sessions"): "training_session_count",
        ("long_run", "mi"): "longest_run_distance",
        ("long_run", "percent"): "long_run_share",
        ("quality", "days"): "hard_training_day_count",
        # Older plan goals described quality as a number of sessions. The
        # evaluator has always measured distinct hard days, so normalize them.
        ("quality", "sessions"): "hard_training_day_count",
        ("recovery", "days"): "rest_day_count",
        ("strength", "sessions"): "strength_session_count",
    }
    return mapping.get((category, unit))


def goal_metric_catalog() -> list[dict]:
    return [
        {
            "key": definition.key,
            "label": definition.label,
            "category": definition.category,
            "unit": definition.unit,
            "valueType": definition.value_type,
            "operators": list(definition.operators),
            "minimum": definition.minimum,
            "maximum": definition.maximum,
        }
        for definition in GOAL_METRICS.values()
    ]


def normalized_goal_thresholds(
    metric_key: GoalMetricKey,
    evaluation_mode: str,
    *,
    target_value: float | None,
    min_acceptable: float | None,
    max_acceptable: float | None,
) -> tuple[float | None, float | None, float | None]:
    definition = GOAL_METRICS[metric_key]
    if evaluation_mode not in definition.operators:
        raise ValueError(f"{definition.label} does not support this condition.")

    if evaluation_mode == "at_least":
        value = min_acceptable if min_acceptable is not None else target_value
        if value is None:
            raise ValueError("An at-least goal requires a value.")
        values = (value, value, None)
    elif evaluation_mode == "at_most":
        value = max_acceptable if max_acceptable is not None else target_value
        if value is None:
            raise ValueError("An at-most goal requires a value.")
        values = (value, None, value)
    elif evaluation_mode == "range":
        minimum = min_acceptable if min_acceptable is not None else target_value
        maximum = max_acceptable if max_acceptable is not None else target_value
        if minimum is None or maximum is None:
            raise ValueError("A range goal requires both a minimum and maximum.")
        if minimum > maximum:
            raise ValueError("The minimum cannot be greater than the maximum.")
        values = (target_value, minimum, maximum)
    else:
        value = target_value
        if value is None:
            raise ValueError("An exact goal requires a value.")
        values = (value, None, None)

    for value in values:
        if value is None:
            continue
        if value < definition.minimum:
            raise ValueError(f"{definition.label} cannot be less than {definition.minimum:g}.")
        if definition.maximum is not None and value > definition.maximum:
            raise ValueError(f"{definition.label} cannot be greater than {definition.maximum:g}.")
        if definition.value_type == "integer" and not float(value).is_integer():
            raise ValueError(f"{definition.label} must be a whole number.")

    return values

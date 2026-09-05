import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { ProfileProvider } from "../../lib/profile";
import { server } from "../../test/server";
import { DefaultGoalsCard } from "./DefaultGoalsCard";

const apiUrl = (path: string) => new URL(path, window.location.origin).toString();

const goalMetrics = [
  {
    key: "weekly_run_distance",
    label: "Weekly run distance",
    category: "mileage",
    unit: "mi",
    valueType: "decimal",
    operators: ["at_least", "at_most", "range", "exact-ish"],
    minimum: 0,
    maximum: null
  },
  {
    key: "rest_day_count",
    label: "Rest days",
    category: "recovery",
    unit: "days",
    valueType: "integer",
    operators: ["at_least", "at_most", "range", "exact-ish"],
    minimum: 0,
    maximum: 7
  }
] as const;

function recurringGoal({ id, metricKey, value }: { id: string; metricKey: "weekly_run_distance" | "rest_day_count"; value: number }) {
  const metric = goalMetrics.find((candidate) => candidate.key === metricKey)!;
  return {
    id,
    athleteAccountId: id.startsWith("a-") ? "profile-a" : "profile-b",
    trainingPlanId: null,
    metricKey,
    category: metric.category,
    goalType: "achievement",
    label: metric.label,
    description: "",
    targetValue: value,
    minAcceptable: value,
    maxAcceptable: null,
    unit: metric.unit,
    evaluationMode: "at_least",
    priority: "secondary",
    notes: "",
    createdAt: "2026-07-13T12:00:00Z",
    updatedAt: "2026-07-13T12:00:00Z"
  };
}

function card(profileId: string) {
  return (
    <ProfileProvider profileId={profileId}>
      <DefaultGoalsCard writesBlocked={false} />
    </ProfileProvider>
  );
}

describe("DefaultGoalsCard", () => {
  it("builds a numeric rule from the metric catalog and blocks impossible values", async () => {
    const user = userEvent.setup();
    const savedPayload = vi.fn();
    server.use(
      http.get(apiUrl("/api/default-goals"), () => HttpResponse.json([])),
      http.get(apiUrl("/api/goal-metrics"), () =>
        HttpResponse.json([
          {
            key: "rest_day_count",
            label: "Rest days",
            category: "recovery",
            unit: "days",
            valueType: "integer",
            operators: ["at_least", "at_most", "range", "exact-ish"],
            minimum: 0,
            maximum: 7
          }
        ])
      ),
      http.put(apiUrl("/api/default-goals"), async ({ request }) => {
        const payload = (await request.json()) as Array<Record<string, unknown>>;
        savedPayload(payload);
        return HttpResponse.json(
          payload.map((goal, index) => ({
            ...goal,
            id: `goal-${index}`,
            athleteAccountId: "athlete-1",
            trainingPlanId: null,
            createdAt: "2026-07-13T12:00:00Z",
            updatedAt: "2026-07-13T12:00:00Z"
          }))
        );
      })
    );

    render(card("athlete-1"));
    await user.click(await screen.findByRole("button", { name: "Add goal" }));

    expect(screen.getByLabelText("Metric")).toHaveValue("rest_day_count");
    expect(screen.getByText("days")).toBeVisible();
    await user.type(screen.getByLabelText("Value"), "12");
    expect(screen.getByText("Rest days cannot be greater than 7.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Done" })).toBeDisabled();

    await user.clear(screen.getByLabelText("Value"));
    await user.type(screen.getByLabelText("Value"), "1");
    expect(screen.getByText("Keep at least 1 day of rest")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Done" }));

    await waitFor(() => expect(savedPayload).toHaveBeenCalledTimes(1));
    expect(savedPayload).toHaveBeenCalledWith([
      expect.objectContaining({
        metricKey: "rest_day_count",
        category: "recovery",
        unit: "days",
        evaluationMode: "at_least",
        minAcceptable: 1,
        maxAcceptable: null
      })
    ]);
  });

  it("ignores a previous profile load after the active profile changes", async () => {
    let requestCount = 0;
    server.use(
      http.get(apiUrl("/api/default-goals"), ({ request }) => {
        requestCount += 1;
        if (requestCount === 1) {
          return new Promise<Response>((resolve) => {
            request.signal.addEventListener("abort", () => {
              resolve(HttpResponse.json([recurringGoal({ id: "a-goal", metricKey: "weekly_run_distance", value: 10 })]));
            }, { once: true });
          });
        }
        return HttpResponse.json([recurringGoal({ id: "b-goal", metricKey: "rest_day_count", value: 2 })]);
      }),
      http.get(apiUrl("/api/goal-metrics"), () => HttpResponse.json(goalMetrics))
    );

    const view = render(card("profile-a"));
    await waitFor(() => expect(requestCount).toBe(1));
    view.rerender(card("profile-b"));

    expect(await screen.findByText("Keep at least 2 days of rest")).toBeVisible();
    expect(screen.queryByText("Run at least 10 miles")).not.toBeInTheDocument();
  });

  it("cancels profile A autosave work before saving profile B drafts", async () => {
    const user = userEvent.setup();
    let activeProfile = "profile-a";
    const savedPayloads: unknown[] = [];
    server.use(
      http.get(apiUrl("/api/default-goals"), () =>
        HttpResponse.json([
          activeProfile === "profile-a"
            ? recurringGoal({ id: "a-goal", metricKey: "weekly_run_distance", value: 10 })
            : recurringGoal({ id: "b-goal", metricKey: "rest_day_count", value: 2 })
        ])
      ),
      http.get(apiUrl("/api/goal-metrics"), () => HttpResponse.json(goalMetrics)),
      http.put(apiUrl("/api/default-goals"), async ({ request }) => {
        const payload = await request.json() as Array<Record<string, unknown>>;
        savedPayloads.push(payload);
        return HttpResponse.json([
          recurringGoal({ id: "b-goal", metricKey: "rest_day_count", value: Number(payload[0]?.targetValue) })
        ]);
      })
    );

    const view = render(card("profile-a"));
    await user.click(await screen.findByRole("button", { name: "Edit Run at least 10 miles" }));
    await user.clear(screen.getByLabelText("Value"));
    await user.type(screen.getByLabelText("Value"), "11");

    activeProfile = "profile-b";
    view.rerender(card("profile-b"));
    await user.click(await screen.findByRole("button", { name: "Edit Keep at least 2 days of rest" }));
    await user.clear(screen.getByLabelText("Value"));
    await user.type(screen.getByLabelText("Value"), "3");
    await user.click(screen.getByRole("button", { name: "Done" }));

    await waitFor(() => expect(savedPayloads).toHaveLength(1), { timeout: 2_000 });
    expect(savedPayloads[0]).toEqual([
      expect.objectContaining({ metricKey: "rest_day_count", targetValue: 3 })
    ]);
  });

  it("stops automatic retries after a failed autosave and offers an explicit retry", async () => {
    const user = userEvent.setup();
    let saveRequests = 0;
    server.use(
      http.get(apiUrl("/api/default-goals"), () =>
        HttpResponse.json([
          recurringGoal({ id: "a-goal", metricKey: "weekly_run_distance", value: 10 })
        ])
      ),
      http.get(apiUrl("/api/goal-metrics"), () => HttpResponse.json(goalMetrics)),
      http.put(apiUrl("/api/default-goals"), () => {
        saveRequests += 1;
        return HttpResponse.json({ detail: "Save failed." }, { status: 503 });
      })
    );

    render(card("profile-a"));
    await user.click(await screen.findByRole("button", { name: "Edit Run at least 10 miles" }));
    await user.clear(screen.getByLabelText("Value"));
    await user.type(screen.getByLabelText("Value"), "11");
    await user.click(screen.getByRole("button", { name: "Done" }));

    expect(await screen.findByText("Save failed.")).toBeVisible();
    await new Promise((resolve) => setTimeout(resolve, 1_400));
    expect(saveRequests).toBe(1);

    await user.click(screen.getByRole("button", { name: "Retry save" }));
    await waitFor(() => expect(saveRequests).toBe(2));
  });
});

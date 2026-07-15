import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { server } from "../../test/server";
import { DefaultGoalsCard } from "./DefaultGoalsCard";

const apiUrl = (path: string) => new URL(path, window.location.origin).toString();

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

    render(<DefaultGoalsCard writesBlocked={false} />);
    await user.click(await screen.findByRole("button", { name: "Add rule" }));

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
});

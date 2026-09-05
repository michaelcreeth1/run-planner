import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { server } from "../test/server";
import { ApiResponseError, fetchJson, NetworkRequestError, toApiErrorPresentation } from "./api";

const apiUrl = (path: string) => new URL(path, window.location.origin).toString();

describe("fetchJson", () => {
  it("sends cookies and parses successful JSON", async () => {
    server.use(
      http.post(apiUrl("/api/example"), async ({ request }) => {
        expect(request.credentials).toBe("include");
        expect(request.headers.get("content-type")).toBe("application/json");
        expect(await request.json()).toEqual({ value: 42 });
        return HttpResponse.json({ saved: true });
      })
    );

    await expect(
      fetchJson<{ saved: boolean }>("/api/example", {
        method: "POST",
        body: JSON.stringify({ value: 42 })
      })
    ).resolves.toEqual({ saved: true });
  });

  it("returns undefined for a 204 response", async () => {
    server.use(http.delete(apiUrl("/api/example/1"), () => new HttpResponse(null, { status: 204 })));

    await expect(fetchJson("/api/example/1", { method: "DELETE" })).resolves.toBeUndefined();
  });

  it("surfaces JSON API details", async () => {
    server.use(
      http.get(apiUrl("/api/conflict"), () =>
        HttpResponse.json({ detail: "Plan overlaps an active plan." }, { status: 409 })
      )
    );

    const error = await fetchJson("/api/conflict").catch((caught) => caught);
    expect(error).toBeInstanceOf(ApiResponseError);
    expect(error).toHaveProperty("message", "Plan overlaps an active plan.");
    expect(toApiErrorPresentation(error, "Could not save the plan.")).toEqual({
      kind: "response",
      title: "Could not save the plan.",
      detail: "Plan overlaps an active plan."
    });
  });

  it("surfaces non-JSON error bodies", async () => {
    server.use(
      http.get(apiUrl("/api/unavailable"), () =>
        new HttpResponse("upstream unavailable", {
          status: 502,
          headers: { "Content-Type": "text/plain" }
        })
      )
    );

    await expect(fetchJson("/api/unavailable")).rejects.toThrow("upstream unavailable");
  });

  it("classifies connectivity failures separately from API responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    const networkError = await fetchJson("/api/weeks").catch((error) => error);
    expect(networkError).toBeInstanceOf(NetworkRequestError);
    expect(toApiErrorPresentation(networkError, "Could not load weeks.")).toEqual({
      kind: "network",
      title: "Backend unreachable",
      detail: "Could not load weeks. Check that the server is running and try again."
    });
    vi.unstubAllGlobals();
  });
});

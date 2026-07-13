import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../test/server";
import { fetchJson } from "./api";

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

    await expect(fetchJson("/api/conflict")).rejects.toThrow("Plan overlaps an active plan.");
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
});

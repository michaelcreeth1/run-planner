import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, expect, vi } from "vitest";
import { server } from "./server";

const nativeFetch = globalThis.fetch;
const unhandledRequests: string[] = [];

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: vi.fn()
  });
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))
  });
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const resolved = typeof input === "string" && input.startsWith("/")
      ? new URL(input, window.location.origin)
      : input;
    return nativeFetch(resolved, init);
  });
  server.events.on("request:unhandled", ({ request }) => {
    unhandledRequests.push(`${request.method} ${request.url}`);
  });
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  cleanup();
  const requests = [...unhandledRequests];
  unhandledRequests.length = 0;
  server.resetHandlers();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
  expect(requests, "Unhandled MSW requests").toEqual([]);
});

afterAll(() => {
  server.close();
  vi.unstubAllGlobals();
});

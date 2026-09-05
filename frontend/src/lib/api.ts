export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

export class NetworkRequestError extends Error {
  constructor(public readonly path: string, options?: ErrorOptions) {
    super("The server could not be reached.", options);
    this.name = "NetworkRequestError";
  }
}

export class ApiResponseError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly path: string
  ) {
    super(message);
    this.name = "ApiResponseError";
  }
}

export type ApiErrorPresentation = {
  kind: "network" | "response";
  title: string;
  detail: string;
};

export function toApiErrorPresentation(error: unknown, title: string): ApiErrorPresentation {
  if (error instanceof NetworkRequestError) {
    return {
      kind: "network",
      title: "Backend unreachable",
      detail: `${title} Check that the server is running and try again.`
    };
  }
  return {
    kind: "response",
    title,
    detail: error instanceof Error ? error.message : "The request could not be completed."
  };
}

export async function fetchJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...init.headers
      },
      ...init
    });
  } catch (error) {
    throw new NetworkRequestError(path, { cause: error });
  }
  if (response.status === 204) {
    return undefined as T;
  }
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? await response.json()
    : { detail: await response.text() };
  if (!response.ok) {
    const detail = typeof body.detail === "string" ? body.detail : `Request failed with ${response.status}`;
    throw new ApiResponseError(detail, response.status, path);
  }
  return body as T;
}

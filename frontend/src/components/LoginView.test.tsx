import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { LoginForm } from "../types/domain";
import { LoginView } from "./LoginView";

function LoginHarness({ onSubmit = vi.fn() }: { onSubmit?: () => void }) {
  const [form, setForm] = useState<LoginForm>({ username: "", password: "" });
  return (
    <LoginView
      apiError={null}
      form={form}
      isConfigured
      isLoggingIn={false}
      loginError={null}
      setForm={setForm}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    />
  );
}

describe("LoginView", () => {
  it("collects credentials and submits the form", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<LoginHarness onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Username"), "michael");
    await user.type(screen.getByLabelText("Password"), "secret-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(screen.getByLabelText("Username")).toHaveValue("michael");
    expect(screen.getByLabelText("Password")).toHaveValue("secret-password");
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("blocks sign-in and explains when accounts are not configured", () => {
    render(
      <LoginView
        apiError={null}
        form={{ username: "", password: "" }}
        isConfigured={false}
        isLoggingIn={false}
        loginError={null}
        setForm={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByText("Accounts are not configured")).toBeVisible();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
  });

  it("shows backend and credential failures", () => {
    render(
      <LoginView
        apiError={{ kind: "network", title: "Backend unreachable", detail: "Failed to fetch" }}
        form={{ username: "", password: "" }}
        isConfigured
        isLoggingIn={false}
        loginError="Invalid credentials."
        setForm={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByText("Backend unreachable")).toBeVisible();
    expect(screen.getByText("Invalid credentials.")).toBeVisible();
  });
});

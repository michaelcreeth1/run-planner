import { RefreshCw, ShieldAlert, UserCircle, WifiOff } from "lucide-react";
import type { Dispatch, FormEvent, SetStateAction } from "react";
import type { LoginForm } from "../types/domain";
import { StatusBanner } from "./shared/StatusBanner";

export function LoginView({
  apiError,
  form,
  isConfigured,
  isLoggingIn,
  loginError,
  setForm,
  onSubmit
}: {
  apiError: string | null;
  form: LoginForm;
  isConfigured: boolean;
  isLoggingIn: boolean;
  loginError: string | null;
  setForm: Dispatch<SetStateAction<LoginForm>>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <main className="login-shell">
      <form className="login-panel" onSubmit={onSubmit}>
        <div>
          <p className="eyebrow">Running Planner</p>
          <h1>Sign in</h1>
        </div>
        {!isConfigured ? (
          <StatusBanner
            tone="warning"
            icon={<ShieldAlert size={18} />}
            title="Accounts are not configured"
            detail="Set the bootstrap username and password before signing in."
          />
        ) : null}
        {apiError ? (
          <StatusBanner tone="warning" icon={<WifiOff size={18} />} title="Backend unreachable" detail={apiError} />
        ) : null}
        {loginError ? (
          <StatusBanner tone="danger" icon={<ShieldAlert size={18} />} title="Login failed" detail={loginError} />
        ) : null}
        <label>
          <span>Username</span>
          <input
            value={form.username}
            autoComplete="username"
            onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
          />
        </label>
        <label>
          <span>Password</span>
          <input
            type="password"
            value={form.password}
            autoComplete="current-password"
            onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
          />
        </label>
        <button className="primary" type="submit" disabled={!isConfigured || isLoggingIn}>
          {isLoggingIn ? <RefreshCw size={17} /> : <UserCircle size={17} />}
          <span>{isLoggingIn ? "Signing in" : "Sign in"}</span>
        </button>
      </form>
    </main>
  );
}

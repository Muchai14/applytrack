import {
  useEffect,
  useState,
  useRef,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { ArrowRight, Leaf, LoaderCircle, LockKeyhole } from "lucide-react";
import { authApi, SESSION_EXPIRED, type Account } from "../api/auth";
import { ErrorState, Loading } from "./ui";

type RenderWorkspace = (
  user: Account,
  logout: () => void,
  pending: boolean,
  error: string,
) => ReactNode;
function PrivateWorkspace({
  user,
  children,
}: {
  user: Account;
  children: ReactNode;
}) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, staleTime: 10000 } },
      }),
  );
  useEffect(() => () => client.clear(), [client]);
  return (
    <QueryClientProvider key={user.id} client={client}>
      {children}
    </QueryClientProvider>
  );
}
export default function AuthGate({ children }: { children: RenderWorkspace }) {
  const client = useQueryClient();
  const session = useQuery({
    queryKey: ["account-session"],
    queryFn: authApi.session,
    retry: 1,
    staleTime: 0,
  });
  const [expired, setExpired] = useState(false);
  const channel = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const bus = new BroadcastChannel("applytrack-account");
    channel.current = bus;
    bus.onmessage = async () => {
      await client.cancelQueries({ queryKey: ["account-session"] });
      client.setQueryData(["account-session"], { user: null });
      setExpired(false);
      await client.invalidateQueries({ queryKey: ["account-session"] });
    };
    return () => {
      channel.current = null;
      bus.close();
    };
  }, [client]);
  useEffect(() => {
    const handler = () => {
      client.setQueryData(["account-session"], { user: null });
      setExpired(true);
    };
    addEventListener(SESSION_EXPIRED, handler);
    return () => removeEventListener(SESSION_EXPIRED, handler);
  }, [client]);
  const logout = useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => {
      client.setQueryData(["account-session"], { user: null });
      setExpired(false);
      channel.current?.postMessage("changed");
    },
  });
  if (session.isPending)
    return (
      <div className="auth-loading">
        <Loading />
      </div>
    );
  if (session.isError)
    return (
      <div className="auth-loading">
        <ErrorState error={session.error} retry={() => session.refetch()} />
      </div>
    );
  const user = session.data.user;
  if (!user)
    return (
      <AccountForm
        expired={expired}
        onAuthenticated={(result) => {
          setExpired(false);
          logout.reset();
          client.setQueryData(["account-session"], { user: result });
          channel.current?.postMessage("changed");
        }}
      />
    );
  return (
    <PrivateWorkspace key={user.id} user={user}>
      {children(
        user,
        () => logout.mutate(),
        logout.isPending,
        logout.error?.message || "",
      )}
    </PrivateWorkspace>
  );
}
function AccountForm({
  expired,
  onAuthenticated,
}: {
  expired: boolean;
  onAuthenticated: (user: Account) => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [validation, setValidation] = useState("");
  const submit = useMutation({
    mutationFn: () =>
      mode === "register"
        ? authApi.register(username, password)
        : authApi.login(username, password),
    onSuccess: (result) => {
      if (result.user) {
        setPassword("");
        setConfirmation("");
        onAuthenticated(result.user);
      }
    },
  });
  function handle(e: FormEvent) {
    e.preventDefault();
    setValidation("");
    if (!/^[A-Za-z0-9_]{3,24}$/.test(username.trim())) {
      setValidation(
        "Use 3–24 letters, numbers or underscores for your username.",
      );
      return;
    }
    if (
      mode === "register" &&
      (password.length < 12 || password.length > 128)
    ) {
      setValidation("Use a password between 12 and 128 characters.");
      return;
    }
    if (mode === "register" && password !== confirmation) {
      setValidation("Passwords do not match.");
      return;
    }
    submit.mutate();
  }
  function switchMode() {
    setMode(mode === "login" ? "register" : "login");
    setPassword("");
    setConfirmation("");
    setValidation("");
    submit.reset();
  }
  return (
    <main className="auth-page">
      <section className="auth-story">
        <a className="brand" href="/">
          {" "}
          <span className="brand-icon">
            A<span>↗</span>
          </span>
          ApplyTrack<span className="brand-dot">.</span>
        </a>
        <div>
          <span className="auth-leaf">
            <Leaf size={35} />
          </span>
          <p className="eyebrow">YOUR NEXT CHAPTER</p>
          <h1>
            Your search.
            <br />
            Your own space.
          </h1>
          <p>
            Keep every opportunity organized, see your progress, and make your
            next move with a little more clarity.
          </p>
          <ul>
            <li>A workspace tied to your username</li>
            <li>Applications saved to your account</li>
            <li>Follow-ups that keep you moving</li>
          </ul>
        </div>
        <p className="auth-story-footer">Small steps. Real progress.</p>
      </section>
      <section className="auth-card">
        <span className="auth-lock">
          <LockKeyhole size={21} />
        </span>
        <h2>
          {mode === "login" ? "Welcome back." : "Make room for what’s next."}
        </h2>
        <p>
          {mode === "login"
            ? "Sign in to your personal application tracker."
            : "Create a username and start your own workspace."}
        </p>
        {expired && (
          <p className="auth-notice" role="status">
            Your session ended. Please sign in again.
          </p>
        )}
        <form onSubmit={handle} noValidate>
          <label className="field">
            <span>Username</span>
            <input
              name="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={24}
              placeholder="Choose your username"
              required
            />
          </label>
          {mode === "register" && (
            <small className="auth-hint">
              3–24 letters, numbers or underscores. Usernames are not
              case-sensitive.
            </small>
          )}
          <label className="field">
            <span>Password</span>
            <input
              name="password"
              type="password"
              autoComplete={
                mode === "register" ? "new-password" : "current-password"
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              maxLength={128}
              required
            />
          </label>
          {mode === "register" && (
            <>
              <small className="auth-hint">
                12–128 characters. Password reset is not available yet, so keep
                your password safe.
              </small>
              <label className="field">
                <span>Confirm password</span>
                <input
                  name="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  maxLength={128}
                  required
                />
              </label>
            </>
          )}
          {(validation || submit.error) && (
            <p role="alert" className="auth-error">
              {validation || submit.error?.message}
            </p>
          )}
          <button
            className="btn primary auth-submit"
            disabled={submit.isPending}
          >
            {submit.isPending ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <ArrowRight size={17} />
            )}{" "}
            {submit.isPending
              ? "Please wait…"
              : mode === "login"
                ? "Log in"
                : "Create account"}
          </button>
        </form>
        <p className="auth-switch">
          {mode === "login" ? "New to ApplyTrack?" : "Already have an account?"}{" "}
          <button
            type="button"
            onClick={switchMode}
            disabled={submit.isPending}
          >
            {mode === "login" ? "Sign up" : "Log in"}
          </button>
        </p>
        <p className="auth-footnote">
          Your application records are visible only to your signed-in account.
          This free demo database has limited retention.
        </p>
      </section>
    </main>
  );
}

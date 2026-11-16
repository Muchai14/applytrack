import { beforeEach, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "../App";
const methods = vi.hoisted(() => ({
  session: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
}));
vi.mock("../api/auth", () => ({
  authApi: methods,
  SESSION_EXPIRED: "applytrack:session-expired",
}));
vi.mock("../api", async () => {
  const { createMockApi } = await import("../api/mock");
  return { api: createMockApi(localStorage, 0), isMock: false };
});
function mount() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <App />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  methods.session.mockResolvedValue({ user: null });
  methods.logout.mockResolvedValue({ user: null });
  methods.login.mockResolvedValue({ user: { id: "alice", username: "Alice" } });
  methods.register.mockResolvedValue({
    user: { id: "alice", username: "Alice" },
  });
});
it("registers, displays username, and logs out to a clean entry screen", async () => {
  const user = userEvent.setup();
  mount();
  await screen.findByRole("heading", { name: "Welcome back." });
  await user.click(screen.getByRole("button", { name: "Sign up" }));
  await user.type(screen.getByLabelText("Username", { exact: true }), "Alice");
  await user.type(
    screen.getByLabelText("Password", { exact: true }),
    "Disposable-password-123!",
  );
  await user.type(
    screen.getByLabelText("Confirm password", { exact: true }),
    "Disposable-password-123!",
  );
  await user.click(screen.getByRole("button", { name: "Create account" }));
  expect(
    await screen.findByLabelText("Signed in as Alice"),
  ).toBeInTheDocument();
  expect(methods.register).toHaveBeenCalledWith(
    "Alice",
    "Disposable-password-123!",
  );
  await screen.findByRole("heading", { name: "Your application pipeline" });
  await user.click(screen.getByRole("button", { name: "Log out" }));
  expect(
    await screen.findByRole("heading", { name: "Welcome back." }),
  ).toBeInTheDocument();
  expect(screen.queryByText("Linear")).not.toBeInTheDocument();
});
it("validates username and password confirmation before contacting the API", async () => {
  const user = userEvent.setup();
  mount();
  await screen.findByRole("heading", { name: "Welcome back." });
  await user.click(screen.getByRole("button", { name: "Sign up" }));
  await user.type(
    screen.getByLabelText("Username", { exact: true }),
    "bad name",
  );
  await user.click(screen.getByRole("button", { name: "Create account" }));
  expect(screen.getByRole("alert")).toHaveTextContent("letters, numbers");
  await user.clear(screen.getByLabelText("Username", { exact: true }));
  await user.type(screen.getByLabelText("Username", { exact: true }), "Alice");
  await user.type(
    screen.getByLabelText("Password", { exact: true }),
    "Disposable-password-123!",
  );
  await user.type(
    screen.getByLabelText("Confirm password", { exact: true }),
    "Does-not-match-123!",
  );
  await user.click(screen.getByRole("button", { name: "Create account" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Passwords do not match");
  expect(methods.register).not.toHaveBeenCalled();
});
it("shows login errors and preserves the form for retry", async () => {
  methods.login.mockRejectedValueOnce(
    new Error("Incorrect username or password."),
  );
  const user = userEvent.setup();
  mount();
  await screen.findByRole("heading", { name: "Welcome back." });
  await user.type(screen.getByLabelText("Username", { exact: true }), "Alice");
  await user.type(
    screen.getByLabelText("Password", { exact: true }),
    "incorrect",
  );
  await user.click(screen.getByRole("button", { name: "Log in" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Incorrect username",
  );
  expect(
    screen.queryByRole("heading", { name: "Your application pipeline" }),
  ).not.toBeInTheDocument();
});
it("returns to sign-in when a private API reports session expiry", async () => {
  methods.session.mockResolvedValue({
    user: { id: "alice", username: "Alice" },
  });
  mount();
  await screen.findByRole("heading", { name: "Your application pipeline" });
  window.dispatchEvent(new Event("applytrack:session-expired"));
  expect(
    await screen.findByRole("heading", { name: "Welcome back." }),
  ).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Your session ended");
  expect(screen.queryByLabelText("Signed in as Alice")).not.toBeInTheDocument();
});
it("keeps the account visible when logout fails so it can be retried", async () => {
  methods.session.mockResolvedValue({
    user: { id: "alice", username: "Alice" },
  });
  methods.logout.mockRejectedValue(new Error("Could not reach your account."));
  const user = userEvent.setup();
  mount();
  await screen.findByLabelText("Signed in as Alice");
  await user.click(screen.getByRole("button", { name: "Log out" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach");
  expect(screen.getByLabelText("Signed in as Alice")).toBeInTheDocument();
});

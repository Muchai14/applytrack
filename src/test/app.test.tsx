import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "../App";
import { STORAGE_KEY } from "../api/mock";
import { seedApplications } from "../api/seed";
vi.mock("../api", async () => {
  const { createMockApi } = await import("../api/mock");
  return { api: createMockApi(localStorage, 0), isMock: true };
});
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  location.hash = "#dashboard";
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seedApplications()));
});
describe("interactive workspace", () => {
  it("renders computed metrics and records a follow-up", async () => {
    const user = userEvent.setup();
    mount();
    expect(
      await screen.findByRole("heading", { name: "Your application pipeline" }),
    ).toBeInTheDocument();
    const initial = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    const row = screen.getByText("Notion").closest(".follow-up-row")!;
    await user.click(
      within(row as HTMLElement).getByRole("button", {
        name: "Record follow-up",
      }),
    );
    await waitFor(() =>
      expect(
        within(document.getElementById("follow-ups")!).queryByText("Notion"),
      ).not.toBeInTheDocument(),
    );
    const after = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(
      after.find((a: { company: string }) => a.company === "Notion")
        .last_followed_up_at,
    ).toBeTruthy();
    expect(after.length).toBe(initial.length);
  });
  it("adds an application and persists it", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "Add application" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText(/Company/), "Test Company");
    await user.type(
      within(dialog).getByLabelText(/^Role \*/),
      "Frontend Engineer",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Add application" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEY)!).some(
        (a: { company: string }) => a.company === "Test Company",
      ),
    ).toBe(true);
  });
  it("requires rejection date and updates status when valid", async () => {
    const user = userEvent.setup();
    location.hash = "#applications";
    mount();
    await screen.findByText("Linear");
    await user.click(
      screen.getByRole("button", { name: "Edit Linear application" }),
    );
    const dialog = screen.getByRole("dialog");
    await user.selectOptions(
      within(dialog).getByLabelText(/Status/),
      "Rejected",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );
    expect(
      within(dialog).getByText(/Rejection date must be/),
    ).toBeInTheDocument();
    await user.type(
      within(dialog).getByLabelText(/Rejection date/),
      new Date().toISOString().slice(0, 10),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEY)!).find(
        (a: { company: string }) => a.company === "Linear",
      ).status,
    ).toBe("Rejected");
  });
  it("searches, filters and confirms deletion", async () => {
    const user = userEvent.setup();
    location.hash = "#applications";
    mount();
    await screen.findByText("Linear");
    await user.type(
      screen.getByRole("textbox", { name: "Search applications" }),
      "Linear",
    );
    expect(screen.queryByText("Vercel")).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Delete Linear application" }),
    );
    await user.click(screen.getByRole("button", { name: "Keep application" }));
    expect(screen.getByText("Linear")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Delete Linear application" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Delete application" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole("heading", { name: "No matches just yet" }),
    ).toBeInTheDocument();
  });
  it("shows empty dashboard and null median without invented metrics", async () => {
    localStorage.setItem(STORAGE_KEY, "[]");
    mount();
    expect(await screen.findByText("No rejection data")).toBeInTheDocument();
    expect(
      screen.getByText("Your next chapter is unwritten"),
    ).toBeInTheDocument();
    expect(screen.getByText("You’re all caught up.")).toBeInTheDocument();
  });
  it("shows loading, handles errors, and retries", async () => {
    localStorage.setItem(STORAGE_KEY, "invalid");
    mount();
    expect(screen.getByRole("status")).toHaveTextContent("Loading");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "could not be read",
    );
    localStorage.setItem(STORAGE_KEY, "[]");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByText("Your next chapter is unwritten"),
    ).toBeInTheDocument();
  });
  it("explains mocked incidents and opens a report", async () => {
    const user = userEvent.setup();
    location.hash = "#incidents";
    mount();
    expect(
      await screen.findByText("A preview of your future safety net"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /INC-0042/ }));
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText("Recovery verification"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Two consecutive dashboard checks/),
    ).toBeInTheDocument();
    await user.click(
      within(dialog).getByRole("button", { name: "Close report" }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("previews a CSV and imports only after confirmation", async () => {
    const user = userEvent.setup();
    location.hash = "#import";
    mount();
    const csv =
      "source_id,company,role,category,channel,status,applied_at\nui-one,Import Labs,Analyst,Data,Referral,Applied,2026-10-01";
    const file = new File([csv], "applications.csv", { type: "text/csv" });
    Object.defineProperty(file, "text", { value: async () => csv });
    await user.upload(screen.getByLabelText("Upload CSV file"), file);
    expect(
      await screen.findByText("Review before importing"),
    ).toBeInTheDocument();
    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEY)!).some(
        (a: { company: string }) => a.company === "Import Labs",
      ),
    ).toBe(false);
    await user.click(
      screen.getByRole("button", { name: "Import 1 new applications" }),
    );
    expect(
      await screen.findByText("Your pipeline is up to date."),
    ).toBeInTheDocument();
    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEY)!).some(
        (a: { company: string }) => a.company === "Import Labs",
      ),
    ).toBe(true);
  });
});

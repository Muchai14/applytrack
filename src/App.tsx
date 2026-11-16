import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Download,
  FileSpreadsheet,
  LayoutDashboard,
  LogOut,
  Leaf,
  Menu,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { api, isMock } from "./api";
import { CSV_EXAMPLE, daysInactive, open } from "./domain";
import {
  statuses,
  type Application,
  type Incident,
  type ImportPreview,
} from "./types";
import AuthGate from "./components/AuthGate";
import type { Account } from "./api/auth";
import ApplicationForm from "./components/ApplicationForm";
import {
  Company,
  Empty,
  ErrorState,
  Loading,
  Modal,
  StatusBadge,
  Toast,
  formatDate,
} from "./components/ui";

type Page = "Dashboard" | "Applications" | "Import" | "Incidents";
const pages: { name: Page; icon: typeof Activity; label: string }[] = [
  { name: "Dashboard", icon: LayoutDashboard, label: "Overview" },
  { name: "Applications", icon: BriefcaseBusiness, label: "Applications" },
  { name: "Import", icon: FileSpreadsheet, label: "Import CSV" },
  { name: "Incidents", icon: Activity, label: "Service incidents" },
];
const pageFromHash = () => {
  const value = location.hash.slice(1);
  return pages.find((p) => p.name.toLowerCase() === value)?.name ?? "Dashboard";
};
export default function App() {
  if (isMock) return <Workspace user={{ id: "demo", username: "Demo" }} />;
  return (
    <AuthGate>
      {(user, logout, pending, error) => (
        <Workspace
          user={user}
          onLogout={logout}
          logoutPending={pending}
          logoutError={error}
        />
      )}
    </AuthGate>
  );
}
function Workspace({
  user,
  onLogout,
  logoutPending = false,
  logoutError = "",
}: {
  user: Account;
  onLogout?: () => void;
  logoutPending?: boolean;
  logoutError?: string;
}) {
  const [page, setPage] = useState<Page>(pageFromHash);
  const [mobile, setMobile] = useState(false);
  const [form, setForm] = useState<Application | "new" | null>(null);
  const [toast, setToast] = useState("");
  const [help, setHelp] = useState(false);
  const closeToast = useCallback(() => setToast(""), []);
  useEffect(() => {
    const handler = () => {
      if (pages.some((p) => p.name.toLowerCase() === location.hash.slice(1)))
        setPage(pageFromHash());
    };
    addEventListener("hashchange", handler);
    return () => removeEventListener("hashchange", handler);
  }, []);
  function navigate(next: Page) {
    setPage(next);
    location.hash = next.toLowerCase();
    setMobile(false);
  }
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {mobile && (
        <button
          className="nav-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={"sidebar " + (mobile ? "is-open" : "")}>
        <a
          className="brand"
          href="#dashboard"
          onClick={() => navigate("Dashboard")}
        >
          <span className="brand-icon">
            A<span>↗</span>
          </span>
          ApplyTrack<span className="brand-dot">.</span>
        </a>
        <div className="workspace">
          <span className="workspace-avatar">
            {user.username.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <strong>{user.username}’s workspace</strong>
            <small>Personal job search</small>
          </div>
          <span className="workspace-mark">⌘</span>
        </div>
        <p className="nav-caption">WORKSPACE</p>
        <nav aria-label="Main navigation">
          {pages.map(({ name, icon: Icon, label }) => (
            <button
              key={name}
              className={"nav-item " + (page === name ? "active" : "")}
              onClick={() => navigate(name)}
              aria-current={page === name ? "page" : undefined}
            >
              <Icon size={19} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="encouragement">
            <Leaf size={23} />
            <h3>One step closer.</h3>
            <p>Every application is a new possibility. Keep showing up.</p>
            <span className="little-line" />
          </div>
          <button className="help-btn" onClick={() => setHelp(true)}>
            <CircleHelp size={18} /> How it works <ArrowUpRight size={15} />
          </button>
          <div className="profile">
            <span className="profile-avatar">
              {user.username.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <strong>{user.username}</strong>
              <small>
                {isMock ? "Local demo workspace" : "Connected workspace"}
              </small>
            </div>
            {onLogout ? (
              <button
                className="icon-btn"
                aria-label="Log out from sidebar"
                onClick={onLogout}
                disabled={logoutPending}
              >
                <LogOut size={17} />
              </button>
            ) : (
              <ShieldCheck size={17} />
            )}
          </div>
          {logoutError && (
            <p role="alert" className="logout-error">
              {logoutError}
            </p>
          )}
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-btn mobile-toggle"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <Menu size={22} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{page === "Dashboard" ? "Overview" : page}</strong>
          </div>
          <div className="topbar-right">
            {isMock && (
              <span className="demo-badge">
                <span />
                Demo data
              </span>
            )}
            <span className="topbar-divider" />
            <button
              className="icon-btn"
              aria-label="View applications needing follow-up"
              onClick={() => {
                navigate("Dashboard");
                setTimeout(
                  () =>
                    document
                      .getElementById("follow-ups")
                      ?.scrollIntoView({ behavior: "smooth" }),
                  100,
                );
              }}
            >
              <Bell size={19} />
            </button>
            <span className="top-username">{user.username}</span>
            <span
              className="top-avatar"
              aria-label={`Signed in as ${user.username}`}
            >
              {user.username.slice(0, 1).toUpperCase()}
            </span>
            {onLogout && (
              <button
                className="icon-btn account-logout"
                aria-label="Log out"
                onClick={onLogout}
                disabled={logoutPending}
              >
                <LogOut size={17} />
              </button>
            )}
          </div>
        </header>
        <main id="main-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">YOUR NEXT CHAPTER STARTS HERE</p>
              <h1>
                {page === "Dashboard"
                  ? "A clearer view of your search."
                  : page === "Applications"
                    ? "Every opportunity, in one place."
                    : page === "Import"
                      ? "Bring your search together."
                      : "A little peace of mind."}
              </h1>
              <p className="page-description">
                {page === "Dashboard"
                  ? "Less keeping track. More moving forward."
                  : page === "Applications"
                    ? "Keep the details organized. Focus on what comes next."
                    : page === "Import"
                      ? "Turn your spreadsheet into an organized application pipeline."
                      : "See what happened, what was done, and what needs attention."}
              </p>
            </div>
            <button
              className="btn primary add-main"
              onClick={() => setForm("new")}
            >
              <Plus size={17} /> Add application
            </button>
          </div>
          {page === "Dashboard" && (
            <Dashboard
              onNavigate={navigate}
              onEdit={setForm}
              onToast={setToast}
            />
          )}
          {page === "Applications" && (
            <Applications onEdit={setForm} onToast={setToast} />
          )}
          {page === "Import" && (
            <ImportPage onToast={setToast} onNavigate={navigate} />
          )}
          {page === "Incidents" && <Incidents />}
          <footer className="page-footer">
            <span>
              <Leaf size={13} /> Small steps. Real progress.
            </span>
            <span>
              ApplyTrack <span className="footer-dot">·</span> Your search,
              thoughtfully organized
            </span>
          </footer>
        </main>
      </div>
      {form && (
        <ApplicationForm
          application={form === "new" ? undefined : form}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            setToast(
              form === "new"
                ? "Application added. Here’s to new possibilities."
                : "Application updated.",
            );
          }}
        />
      )}
      {toast && <Toast message={toast} close={closeToast} />}
      {help && (
        <Modal
          title="A little clarity for your job search"
          onClose={() => setHelp(false)}
        >
          <div className="help-copy">
            <p>
              Add applications, update their status, and record follow-ups. Your
              overview summarizes the records in this workspace.
            </p>
            <p>
              Open applications become stale after 21 days without an
              application, status change, or recorded follow-up. Editing
              descriptive details does not reset that clock.
            </p>
            <p>
              Rejection share includes all applications in each category. Median
              days to rejection includes only currently rejected applications.
            </p>
            <p>
              {isMock
                ? "This is a frontend demo. Synthetic application data is saved in this browser. Service incidents are illustrative; no real monitoring or repairs run here."
                : "This workspace connects to the configured API. Service behavior depends on your backend."}
            </p>
          </div>
          <div className="modal-footer">
            <button className="btn primary" onClick={() => setHelp(false)}>
              Got it
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function useFollowUp(onToast: (message: string) => void) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.followUp,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["dashboard"] });
      await client.invalidateQueries({ queryKey: ["applications"] });
      onToast("Follow-up recorded. You’re all caught up.");
    },
  });
}
function Dashboard({
  onNavigate,
  onEdit,
  onToast,
}: {
  onNavigate: (p: Page) => void;
  onEdit: (a: Application) => void;
  onToast: (m: string) => void;
}) {
  const q = useQuery({ queryKey: ["dashboard"], queryFn: api.dashboard });
  const follow = useFollowUp(onToast);
  if (q.isPending) return <Loading />;
  if (q.isError)
    return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const d = q.data;
  const cards = [
    {
      label: "Total applications",
      value: d.total,
      icon: BriefcaseBusiness,
      note: "Possibilities you’ve put in motion",
      className: "green",
    },
    {
      label: "Open applications",
      value: d.open,
      icon: ArrowUpRight,
      note: "Still in the running",
      className: "blue",
    },
    {
      label: "Interviews",
      value: d.interviews,
      icon: Activity,
      note: "Conversations worth preparing for",
      className: "purple",
    },
    {
      label: "Median days to rejection",
      value: d.median_days === null ? "—" : Math.round(d.median_days * 10) / 10,
      icon: Clock3,
      note:
        d.median_days === null
          ? "No rejection data"
          : "Based on rejected applications",
      className: "sand",
    },
  ];
  return (
    <>
      <section className="stats-grid" aria-label="Application summary">
        {cards.map((c) => (
          <article className="stat-card" key={c.label}>
            <div className="stat-top">
              <span>{c.label}</span>
              <span className={"stat-icon " + c.className}>
                <c.icon size={18} />
              </span>
            </div>
            <div className="stat-value">
              {c.value}
              {c.label.startsWith("Median") && d.median_days !== null && (
                <small>days</small>
              )}
            </div>
            <p>{c.note}</p>
          </article>
        ))}
      </section>
      <div className="overview-grid">
        <section className="panel pipeline">
          <div className="section-heading">
            <div>
              <h2>Your application pipeline</h2>
              <p>A snapshot of where things stand.</p>
            </div>
            <span className="muted-tag">All time</span>
          </div>
          <div className="pipeline-total">
            <strong>{d.total}</strong>
            <span>
              applications
              <br />
              and counting
            </span>
            <span className="pipeline-flourish">↗</span>
          </div>
          <div className="pipeline-bar" aria-label="Pipeline distribution">
            {statuses.map((s) => (
              <span
                key={s}
                className={"bar-" + s.toLowerCase()}
                style={{
                  width: d.total ? `${(d.counts[s] / d.total) * 100}%` : "25%",
                  opacity: d.total ? 1 : 0.25,
                }}
                title={`${s}: ${d.counts[s]}`}
              />
            ))}
          </div>
          <div className="pipeline-legend">
            {statuses.map((s) => (
              <div key={s}>
                <span className={"legend-dot dot-" + s.toLowerCase()} />
                <span>{s}</span>
                <strong>{d.counts[s]}</strong>
              </div>
            ))}
          </div>
          <div className="panel-note">
            <span className="note-dot" />{" "}
            {d.open
              ? `${d.open} open doors. Keep the momentum going.`
              : "Your next opportunity starts with one application."}
          </div>
        </section>
        <section className="panel categories">
          <div className="section-heading">
            <div>
              <h2>Rejection share by category</h2>
              <p>A little perspective on your search.</p>
            </div>
            <span className="round-icon">
              <ArrowDownLeft size={18} />
            </span>
          </div>
          {!d.categories.length ? (
            <Empty
              title="Room for a fresh start"
              description="Add an application to see category insights."
            />
          ) : (
            <div className="category-list">
              {d.categories.map((c) => (
                <div className="category-row" key={c.name}>
                  <div>
                    <strong>{c.name}</strong>
                    <span>
                      {c.rejected} of {c.total} rejected{" "}
                      <b>{Math.round(c.rate * 100)}%</b>
                    </span>
                  </div>
                  <div className="category-track">
                    <span style={{ width: `${c.rate * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="category-footnote">
            Includes open applications. Outcomes may still change.
          </p>
        </section>
      </div>
      <section className="panel follow-up" id="follow-ups">
        <div className="section-heading">
          <div className="follow-up-title">
            <span className="follow-up-icon">
              <Clock3 size={20} />
            </span>
            <div>
              <h2>
                A gentle nudge{" "}
                <span className="count-badge">{d.stale.length}</span>
              </h2>
              <p>Open applications with no activity for 21+ days.</p>
            </div>
          </div>
          <span className="muted-tag warm">Time to reconnect</span>
        </div>
        {follow.error && (
          <p role="alert" className="inline-error">
            {follow.error.message}
          </p>
        )}
        {!d.stale.length ? (
          <div className="all-clear">
            <Check size={22} />
            <div>
              <strong>You’re all caught up.</strong>
              <p>No applications need a follow-up right now.</p>
            </div>
          </div>
        ) : (
          <div className="follow-up-list">
            {d.stale.map((a) => (
              <div className="follow-up-row" key={a.id}>
                <Company a={a} />
                <StatusBadge status={a.status} />
                <span className="inactive-label">
                  {daysInactive(a)} days inactive
                </span>
                <button
                  className="btn follow-btn"
                  disabled={follow.isPending}
                  onClick={() => follow.mutate(a.id)}
                >
                  <Check size={15} /> Record follow-up
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="panel recent">
        <div className="section-heading">
          <div>
            <h2>Recently updated</h2>
            <p>The latest steps in your journey.</p>
          </div>
          <button
            className="text-btn"
            onClick={() => onNavigate("Applications")}
          >
            View all applications <ArrowRight size={16} />
          </button>
        </div>
        {!d.recent.length ? (
          <Empty
            title="Your next chapter is unwritten"
            description="Add your first application using the button above."
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>COMPANY & ROLE</th>
                  <th>CATEGORY</th>
                  <th>STATUS</th>
                  <th>APPLIED</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {d.recent.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <Company a={a} />
                    </td>
                    <td>{a.category}</td>
                    <td>
                      <StatusBadge status={a.status} />
                    </td>
                    <td className="date-cell">{formatDate(a.applied_at)}</td>
                    <td>
                      <button
                        className="icon-btn"
                        aria-label={`Edit ${a.company} application`}
                        onClick={() => onEdit(a)}
                      >
                        <ArrowUpRight size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
function Applications({
  onEdit,
  onToast,
}: {
  onEdit: (a: Application) => void;
  onToast: (m: string) => void;
}) {
  const q = useQuery({ queryKey: ["applications"], queryFn: api.list });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All statuses");
  const [category, setCategory] = useState("All categories");
  const [deleting, setDeleting] = useState<Application | null>(null);
  const client = useQueryClient();
  const follow = useFollowUp(onToast);
  const remove = useMutation({
    mutationFn: api.remove,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["applications"] });
      await client.invalidateQueries({ queryKey: ["dashboard"] });
      setDeleting(null);
      onToast("Application deleted.");
    },
  });
  if (q.isPending) return <Loading />;
  if (q.isError)
    return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const rows = q.data.filter(
    (a) =>
      (a.company + " " + a.role).toLowerCase().includes(search.toLowerCase()) &&
      (status === "All statuses" || a.status === status) &&
      (category === "All categories" || a.category === category),
  );
  return (
    <section className="panel applications-panel">
      <div className="filter-toolbar">
        <label className="search-box">
          <Search size={18} />
          <input
            aria-label="Search applications"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search company or role…"
          />
          {search && (
            <button
              className="icon-btn"
              aria-label="Clear search"
              onClick={() => setSearch("")}
            >
              <X size={15} />
            </button>
          )}
        </label>
        <div className="filter-selects">
          <SlidersHorizontal size={16} />
          <select
            aria-label="Filter by status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {["All statuses", ...statuses].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <select
            aria-label="Filter by category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {["All categories", ...new Set(q.data.map((a) => a.category))].map(
              (x) => (
                <option key={x}>{x}</option>
              ),
            )}
          </select>
        </div>
      </div>
      <div className="list-summary">
        <strong>
          {rows.length} {rows.length === 1 ? "application" : "applications"}
        </strong>
        <span>One place for every possibility.</span>
      </div>
      {follow.error && (
        <p role="alert" className="inline-error">
          {follow.error.message}
        </p>
      )}
      {rows.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>COMPANY & ROLE</th>
                <th>CATEGORY</th>
                <th>STATUS</th>
                <th>APPLIED</th>
                <th>LAST ACTIVITY</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td>
                    <Company a={a} />
                  </td>
                  <td>
                    {a.category}
                    <small className="cell-subtext">{a.channel}</small>
                  </td>
                  <td>
                    <StatusBadge status={a.status} />
                  </td>
                  <td className="date-cell">{formatDate(a.applied_at)}</td>
                  <td>
                    <span
                      className={
                        open(a) && daysInactive(a) >= 21
                          ? "stale-text"
                          : "date-cell"
                      }
                    >
                      {daysInactive(a) === 0
                        ? "Today"
                        : `${daysInactive(a)} days ago`}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="icon-btn"
                        aria-label={`Edit ${a.company} application`}
                        onClick={() => onEdit(a)}
                      >
                        <Pencil size={16} />
                      </button>
                      {open(a) && (
                        <button
                          className="icon-btn"
                          disabled={follow.isPending}
                          aria-label={`Record follow-up for ${a.company}`}
                          onClick={() => follow.mutate(a.id)}
                        >
                          <Check size={17} />
                        </button>
                      )}
                      <button
                        className="icon-btn danger-icon"
                        aria-label={`Delete ${a.company} application`}
                        onClick={() => {
                          remove.reset();
                          setDeleting(a);
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title={
            q.data.length
              ? "No matches just yet"
              : "Start with your first opportunity"
          }
          description={
            q.data.length
              ? "Try another search or clear your filters."
              : "Use Add application to start building your pipeline."
          }
          action={
            q.data.length ? (
              <button
                className="btn secondary"
                onClick={() => {
                  setSearch("");
                  setStatus("All statuses");
                  setCategory("All categories");
                }}
              >
                Clear filters
              </button>
            ) : undefined
          }
        />
      )}
      {deleting && (
        <Modal
          title="Delete this application?"
          description={`${deleting.company} · ${deleting.role}`}
          onClose={() => setDeleting(null)}
        >
          <p className="delete-copy">
            This will permanently remove the application from this workspace.
          </p>
          {remove.error && (
            <p role="alert" className="inline-error">
              {remove.error.message}
            </p>
          )}
          <div className="modal-footer">
            <button className="btn secondary" onClick={() => setDeleting(null)}>
              Keep application
            </button>
            <button
              className="btn danger"
              disabled={remove.isPending}
              onClick={() => remove.mutate(deleting.id)}
            >
              {remove.isPending ? "Deleting…" : "Delete application"}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
function ImportPage({
  onToast,
  onNavigate,
}: {
  onToast: (m: string) => void;
  onNavigate: (p: Page) => void;
}) {
  const [csv, setCsv] = useState("");
  const [filename, setFilename] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportPreview | null>(null);
  const [fileError, setFileError] = useState("");
  const [reading, setReading] = useState(false);
  const client = useQueryClient();
  const inspect = useMutation({
    mutationFn: api.previewCsv,
    onSuccess: setPreview,
  });
  const commit = useMutation({
    mutationFn: () => api.importCsv(csv),
    onSuccess: async (r) => {
      setResult(r);
      setPreview(null);
      await client.invalidateQueries({ queryKey: ["applications"] });
      await client.invalidateQueries({ queryKey: ["dashboard"] });
      onToast(
        `${r.created} application${r.created === 1 ? "" : "s"} imported.`,
      );
    },
  });
  async function load(file?: File) {
    if (!file) return;
    setFileError("");
    setPreview(null);
    setResult(null);
    inspect.reset();
    commit.reset();
    setCsv("");
    setFilename(file.name);
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setFileError("Choose a .csv file.");
      return;
    }
    if (file.size > 1024 * 1024) {
      setFileError("File exceeds the 1 MB limit.");
      return;
    }
    setReading(true);
    try {
      const value = await file.text();
      setCsv(value);
      inspect.mutate(value);
    } catch {
      setFileError("Could not read this file. Please choose it again.");
    } finally {
      setReading(false);
    }
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([CSV_EXAMPLE], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "applytrack-example.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const busy = inspect.isPending || commit.isPending || reading;
  return (
    <div className="import-grid">
      <section className="panel import-panel">
        <div className="section-heading">
          <div>
            <h2>From spreadsheet to workspace</h2>
            <p>Start with a CSV. We’ll check it before anything is saved.</p>
          </div>
        </div>
        <label
          className={"dropzone " + (busy ? "disabled" : "")}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (!busy) void load(e.dataTransfer.files[0]);
          }}
        >
          <span className="upload-icon">
            <UploadCloud size={29} />
          </span>
          <strong>
            {busy ? "Working on your file…" : filename || "Drop your CSV here"}
          </strong>
          <span>
            or <b>browse files</b> to get started
          </span>
          <small>CSV only · Up to 1 MB · Maximum 1,000 rows</small>
          <input
            type="file"
            accept=".csv,text/csv"
            aria-label="Upload CSV file"
            disabled={busy}
            onChange={(e) => {
              void load(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <div className="template-row">
          <span>
            <FileSpreadsheet size={18} /> Need the right format?
          </span>
          <button className="text-btn" onClick={download}>
            <Download size={15} /> Download example CSV
          </button>
        </div>
        {(fileError || inspect.error || commit.error) && (
          <p role="alert" className="inline-error">
            {fileError || inspect.error?.message || commit.error?.message}
          </p>
        )}
        {preview && (
          <div className="import-preview">
            <h3>Review before importing</h3>
            <div className="import-counts">
              <span>
                <strong>{preview.created}</strong> new
              </span>
              <span>
                <strong>{preview.skipped}</strong> unchanged
              </span>
              <span>
                <strong>{preview.conflicts}</strong> conflicts
              </span>
            </div>
            {preview.errors.length > 0 && (
              <div role="alert" className="validation-errors">
                <strong>
                  Nothing will be saved until these errors are fixed.
                </strong>
                <ul>
                  {preview.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
            {preview.conflicts > 0 && (
              <p className="import-warning">
                Conflicting records will be left unchanged. Other valid new
                records can be imported.
              </p>
            )}
            {preview.rows.length > 0 && (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>COMPANY</th>
                      <th>ROLE</th>
                      <th>STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.slice(0, 5).map((a, i) => (
                      <tr key={i}>
                        <td>{a.company}</td>
                        <td>{a.role}</td>
                        <td>
                          <StatusBadge status={a.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.rows.length > 5 && (
                  <p className="preview-note">
                    Showing the first 5 of {preview.rows.length} valid rows.
                  </p>
                )}
              </div>
            )}
            <div className="import-actions">
              <button
                className="btn primary"
                disabled={busy || !!preview.errors.length || !preview.created}
                onClick={() => commit.mutate()}
              >
                <Plus size={16} />
                {commit.isPending
                  ? "Importing…"
                  : `Import ${preview.created} new applications`}
              </button>
            </div>
          </div>
        )}
        {result && (
          <div className="import-success" role="status">
            <span className="success-icon">
              <Check size={24} />
            </span>
            <h3>Your pipeline is up to date.</h3>
            <p>
              {result.created} created · {result.skipped} unchanged ·{" "}
              {result.conflicts} conflicts left unchanged
            </p>
            <button
              className="btn primary"
              onClick={() => onNavigate("Applications")}
            >
              View applications <ArrowRight size={16} />
            </button>
          </div>
        )}
      </section>
      <aside className="panel import-guide">
        <span className="guide-icon">
          <FileSpreadsheet size={24} />
        </span>
        <h2>A smooth landing for your data</h2>
        <p>Use the example file as your starting point.</p>
        <ol>
          <li>
            <strong>Keep a stable source ID</strong>
            <span>
              A unique source_id lets us recognize each application on future
              imports.
            </span>
          </li>
          <li>
            <strong>Use clear, consistent dates</strong>
            <span>
              Dates use YYYY-MM-DD. Rejected applications need a decision_at
              date.
            </span>
          </li>
          <li>
            <strong>Review, then import</strong>
            <span>
              Identical records are skipped. Conflicts are never silently
              overwritten.
            </span>
          </li>
        </ol>
        <div className="guide-note">
          <ShieldCheck size={19} />
          <p>
            {isMock
              ? "Demo imports stay in this browser. Use synthetic data while trying things out."
              : "Imports are validated by your configured backend before saving."}
          </p>
        </div>
      </aside>
    </div>
  );
}
function Incidents() {
  const q = useQuery({ queryKey: ["incidents"], queryFn: api.incidents });
  const [selected, setSelected] = useState<Incident | null>(null);
  if (q.isPending) return <Loading />;
  if (q.isError)
    return <ErrorState error={q.error} retry={() => q.refetch()} />;
  return (
    <>
      <div className="incident-banner">
        <span className="incident-shield">
          <ShieldCheck size={25} />
        </span>
        <div>
          <strong>
            {isMock
              ? "A preview of your future safety net"
              : "Service incident history"}
          </strong>
          <p>
            {isMock
              ? "These are simulated incidents. Monitoring and automated recovery will connect when the backend is built."
              : "Service failures are separate from application follow-up reminders."}
          </p>
        </div>
        {isMock && <span className="muted-tag">Simulation</span>}
      </div>
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Incident history</h2>
            <p>Sanitized reports. No personal application data.</p>
          </div>
          <Activity size={19} />
        </div>
        {!q.data.length ? (
          <Empty
            title="Nothing to report"
            description="Service incidents will appear here when detected."
          />
        ) : (
          <div className="incident-list">
            {q.data.map((i) => (
              <button
                className="incident-row"
                key={i.id}
                onClick={() => setSelected(i)}
              >
                <span
                  className={
                    "incident-symbol " +
                    (i.status === "Resolved" ? "resolved" : "attention")
                  }
                >
                  {i.status === "Resolved" ? (
                    <Check size={19} />
                  ) : (
                    <Clock3 size={19} />
                  )}
                </span>
                <span className="incident-description">
                  <strong>
                    Dashboard availability <small>{i.id}</small>
                  </strong>
                  <span>
                    {i.route} <b>·</b> {formatDate(i.detected_at)} <b>·</b>{" "}
                    {i.environment}
                  </span>
                </span>
                <StatusBadge status={i.status} />
                <ChevronRight size={17} />
              </button>
            ))}
          </div>
        )}
      </section>
      {selected && (
        <Modal
          title={selected.id + " · Dashboard availability"}
          description={`${selected.environment} environment · ${formatDate(selected.detected_at)}`}
          onClose={() => setSelected(null)}
        >
          <div className="incident-detail">
            <StatusBadge status={selected.status} />
            {[
              ["Diagnosis", selected.diagnosis],
              ["Remediation", selected.action],
              ["Recovery verification", selected.verification],
            ].map(([title, text]) => (
              <section key={title}>
                <h3>{title}</h3>
                <p>{text}</p>
              </section>
            ))}
            <dl>
              <dt>Affected route</dt>
              <dd>{selected.route}</dd>
              <dt>Detected at (UTC)</dt>
              <dd>{selected.detected_at}</dd>
              <dt>Resolved at (UTC)</dt>
              <dd>{selected.resolved_at || "Not resolved"}</dd>
              <dt>Release ID</dt>
              <dd>{selected.release_id}</dd>
              <dt>Trace ID</dt>
              <dd>{selected.trace_id}</dd>
            </dl>
          </div>
          <div className="modal-footer">
            <button className="btn secondary" onClick={() => setSelected(null)}>
              Close report
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

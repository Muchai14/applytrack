import type { Application, Incident, Status } from "../types";
import { DAY } from "../domain";
export function seedApplications(now = Date.now()): Application[] {
  const entries: [string, string, string, Status, number, number?][] = [
    ["Linear", "Product Designer", "Design", "Interview", 8, 2],
    ["Vercel", "Frontend Engineer", "Engineering", "Applied", 4],
    ["Notion", "Product Analyst", "Data", "Applied", 26],
    ["Figma", "UX Researcher", "Design", "Interview", 12, 3],
    ["Stripe", "Data Analyst", "Data", "Rejected", 30, 15],
    ["Arc Studio", "Product Designer", "Design", "Applied", 35],
    ["Loom", "Frontend Engineer", "Engineering", "Rejected", 23, 14],
    ["Supabase", "Developer Advocate", "Engineering", "Applied", 2],
    ["Miro", "Product Analyst", "Data", "Closed", 18],
    ["Northstar", "Data Analyst", "Data", "Applied", 45],
    ["Orbit Labs", "UX Designer", "Design", "Applied", 22],
    ["PostHog", "Frontend Engineer", "Engineering", "Interview", 9, 1],
    ["Buffer", "Product Designer", "Design", "Applied", 6],
    ["Airtable", "Data Analyst", "Data", "Rejected", 40, 32],
    ["Dovetail", "UX Researcher", "Design", "Applied", 1],
    ["Raycast", "Frontend Engineer", "Engineering", "Applied", 15],
  ];
  const date = (days: number) =>
    new Date(now - days * DAY).toISOString().slice(0, 10);
  return entries.map(([company, role, category, status, age, changed], i) => ({
    id: "demo-" + i,
    source_id: "sample-" + i,
    company,
    role,
    category,
    status,
    channel: i % 2 ? "Company website" : "LinkedIn",
    applied_at: date(age),
    status_changed_at: date(changed ?? age),
    decision_at: status === "Rejected" ? date(changed!) : null,
    last_followed_up_at: null,
    created_at: date(age),
    updated_at: date(changed ?? age),
  }));
}
export function seedIncidents(): Incident[] {
  return [
    {
      id: "INC-0042",
      environment: "dev",
      route: "/api/dashboard",
      detected_at: new Date(Date.now() - 3600000).toISOString(),
      resolved_at: new Date(Date.now() - 3480000).toISOString(),
      status: "Resolved",
      diagnosis:
        "Two consecutive synthetic checks returned HTTP 503. The dev fault flag was enabled.",
      action:
        "Responder disabled the allowlisted dev fault flag. No application records were changed.",
      verification:
        "Two consecutive dashboard checks returned HTTP 200 with a valid response.",
      release_id: "demo-a81c9f2",
      trace_id: "demo-47d8b2a9",
    },
    {
      id: "INC-0041",
      environment: "dev",
      route: "/api/dashboard",
      detected_at: new Date(Date.now() - 86400000).toISOString(),
      resolved_at: null,
      status: "Needs attention",
      diagnosis:
        "Dashboard requests exceeded the timeout. No supported injected fault was detected.",
      action:
        "No automatic action authorized. Escalated for human investigation.",
      verification: "Recovery has not been verified.",
      release_id: "demo-29fe431",
      trace_id: "demo-90f1e837",
    },
  ];
}

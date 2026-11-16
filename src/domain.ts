import Papa from "papaparse";
import {
  statuses,
  type Application,
  type ApplicationInput,
  type Dashboard,
  type ImportPreview,
} from "./types";
export const DAY = 86400000;
export const today = () => new Date().toISOString().slice(0, 10);
export const open = (a: Application) =>
  a.status === "Applied" || a.status === "Interview";
export function lastActivity(a: Application) {
  return Math.max(
    ...[a.applied_at, a.status_changed_at, a.last_followed_up_at]
      .filter(Boolean)
      .map((x) => Date.parse(x!)),
  );
}
export function daysInactive(a: Application, now = Date.now()) {
  return Math.max(0, Math.floor((now - lastActivity(a)) / DAY));
}
export function metrics(rows: Application[], now = Date.now()): Dashboard {
  const counts = Object.fromEntries(
    statuses.map((s) => [s, rows.filter((a) => a.status === s).length]),
  ) as Dashboard["counts"];
  const durations = rows
    .filter((a) => a.status === "Rejected" && a.decision_at)
    .map((a) => (Date.parse(a.decision_at!) - Date.parse(a.applied_at)) / DAY)
    .sort((a, b) => a - b);
  const n = durations.length;
  return {
    total: rows.length,
    open: rows.filter(open).length,
    interviews: counts.Interview,
    rejected: counts.Rejected,
    counts,
    median_days: n
      ? n % 2
        ? durations[Math.floor(n / 2)]
        : (durations[n / 2 - 1] + durations[n / 2]) / 2
      : null,
    categories: [...new Set(rows.map((a) => a.category))].sort().map((name) => {
      const group = rows.filter((a) => a.category === name);
      const rejected = group.filter((a) => a.status === "Rejected").length;
      return {
        name,
        total: group.length,
        rejected,
        rate: rejected / group.length,
      };
    }),
    stale: rows
      .filter((a) => open(a) && now - lastActivity(a) >= 21 * DAY)
      .sort((a, b) => lastActivity(a) - lastActivity(b)),
    recent: [...rows]
      .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
      .slice(0, 5),
  };
}
const validDate = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  !Number.isNaN(Date.parse(s)) &&
  new Date(s).toISOString().slice(0, 10) === s;
export function validateInput(a: ApplicationInput): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const key of ["company", "role", "category", "channel"] as const)
    if (typeof a[key] !== "string" || !a[key].trim())
      errors[key] = "This field is required.";
    else if (a[key].length > 160)
      errors[key] = "Use no more than 160 characters.";
  if (!statuses.includes(a.status)) errors.status = "Select a valid status.";
  if (!validDate(a.applied_at) || a.applied_at > today())
    errors.applied_at = "Enter a valid application date, no later than today.";
  if (
    a.status === "Rejected" &&
    (!a.decision_at ||
      !validDate(a.decision_at) ||
      a.decision_at < a.applied_at ||
      a.decision_at > today())
  )
    errors.decision_at =
      "Rejection date must be between the application date and today.";
  return errors;
}
export function updateRecord(
  input: ApplicationInput,
  previous?: Application,
  now = new Date().toISOString(),
): Application {
  const errors = validateInput(input);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  return {
    ...previous,
    ...(Object.fromEntries(
      Object.entries(input).map(([k, v]) => [
        k,
        typeof v === "string" ? v.trim() : v,
      ]),
    ) as unknown as ApplicationInput),
    id: previous?.id ?? crypto.randomUUID(),
    decision_at: input.status === "Rejected" ? input.decision_at : null,
    status_changed_at: previous
      ? previous.status === input.status
        ? previous.status_changed_at
        : now
      : input.applied_at,
    last_followed_up_at: previous?.last_followed_up_at ?? null,
    created_at: previous?.created_at ?? now,
    updated_at: now,
  };
}
export const CSV_HEADER =
  "source_id,company,role,category,channel,status,applied_at,status_changed_at,last_followed_up_at,decision_at";
export const CSV_EXAMPLE =
  CSV_HEADER +
  "\nexample-001,Example Labs,Data Analyst,Data,Company website,Applied," +
  today() +
  ",,,\n";
export function previewImport(
  csv: string,
  existing: Application[],
): ImportPreview {
  const result: ImportPreview = {
    rows: [],
    errors: [],
    created: 0,
    skipped: 0,
    conflicts: 0,
  };
  if (new TextEncoder().encode(csv).length > 1024 * 1024)
    return { ...result, errors: ["File exceeds the 1 MB limit."] };
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().replace(/^\uFEFF/, ""),
  });
  const required = CSV_HEADER.split(",")
    .slice(0, 8)
    .filter((h) => h !== "status_changed_at");
  const missing = required.filter((h) => !parsed.meta.fields?.includes(h));
  if (missing.length)
    return { ...result, errors: ["Missing columns: " + missing.join(", ")] };
  if (parsed.data.length > 1000)
    return { ...result, errors: ["File exceeds the 1,000 row limit."] };
  parsed.errors.forEach((e) =>
    result.errors.push(`Row ${(e.row ?? 0) + 2}: ${e.message}`),
  );
  if (!parsed.data.length)
    result.errors.push("The file contains no application rows.");
  const seen = new Set<string>();
  parsed.data.forEach((r, i) => {
    const row = Object.fromEntries(
      Object.entries(r).map(([k, v]) => [
        k,
        typeof v === "string" ? v.trim() : "",
      ]),
    ) as Record<string, string>;
    const input = {
      ...row,
      decision_at: row.decision_at || null,
    } as ApplicationInput;
    const problems = Object.values(validateInput(input));
    if (!row.source_id) problems.push("source_id is required.");
    if (seen.has(row.source_id))
      problems.push("Duplicate source_id within this file.");
    seen.add(row.source_id);
    for (const key of ["status_changed_at", "last_followed_up_at"])
      if (
        row[key] &&
        (!validDate(row[key]) ||
          row[key] < row.applied_at ||
          row[key] > today())
      )
        problems.push(
          `Invalid ${key}; use a date between application date and today.`,
        );
    if (problems.length) {
      result.errors.push(`Row ${i + 2}: ${problems.join(" ")}`);
      return;
    }
    const a = updateRecord(input);
    a.source_id = row.source_id;
    a.status_changed_at = row.status_changed_at || row.applied_at;
    a.last_followed_up_at = row.last_followed_up_at || null;
    result.rows.push(a);
    const old = existing.find((x) => x.source_id === a.source_id);
    if (!old) result.created++;
    else {
      const fields = [
        "company",
        "role",
        "category",
        "channel",
        "status",
        "applied_at",
        "decision_at",
        "status_changed_at",
        "last_followed_up_at",
      ] as const;
      const normalize = (v: unknown) =>
        typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)
          ? v.slice(0, 10)
          : v;
      if (fields.every((k) => normalize(old[k]) === normalize(a[k])))
        result.skipped++;
      else result.conflicts++;
    }
  });
  return result;
}

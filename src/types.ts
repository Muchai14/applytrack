export const statuses = ["Applied", "Interview", "Rejected", "Closed"] as const;
export type Status = (typeof statuses)[number];
export interface ApplicationInput {
  company: string;
  role: string;
  category: string;
  channel: string;
  status: Status;
  applied_at: string;
  decision_at: string | null;
}
export interface Application extends ApplicationInput {
  id: string;
  source_id?: string;
  status_changed_at: string;
  last_followed_up_at: string | null;
  created_at: string;
  updated_at: string;
}
export interface Dashboard {
  total: number;
  open: number;
  interviews: number;
  rejected: number;
  median_days: number | null;
  counts: Record<Status, number>;
  categories: { name: string; total: number; rejected: number; rate: number }[];
  stale: Application[];
  recent: Application[];
}
export interface Incident {
  id: string;
  environment: string;
  route: string;
  detected_at: string;
  resolved_at: string | null;
  status: "Investigating" | "Resolved" | "Needs attention";
  diagnosis: string;
  action: string;
  verification: string;
  release_id: string;
  trace_id: string;
}
export interface ImportPreview {
  rows: Application[];
  errors: string[];
  created: number;
  skipped: number;
  conflicts: number;
}
export interface Api {
  list(): Promise<Application[]>;
  dashboard(): Promise<Dashboard>;
  save(input: ApplicationInput, id?: string): Promise<Application>;
  remove(id: string): Promise<void>;
  followUp(id: string): Promise<void>;
  previewCsv(csv: string): Promise<ImportPreview>;
  importCsv(csv: string): Promise<ImportPreview>;
  incidents(): Promise<Incident[]>;
}

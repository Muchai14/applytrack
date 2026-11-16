import type {
  Api,
  Application,
  ApplicationInput,
  Dashboard,
  ImportPreview,
  Incident,
} from "../types";
export function createHttpApi(base: string): Api {
  async function request<T>(
    path: string,
    method = "GET",
    body?: unknown,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const r = await fetch(base.replace(/\/$/, "") + path, {
        method,
        headers:
          body === undefined
            ? undefined
            : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      if (!r.ok)
        throw new Error(`Request failed (${r.status}). Please try again.`);
      return r.status === 204 ? (undefined as T) : ((await r.json()) as T);
    } finally {
      clearTimeout(timeout);
    }
  }
  return {
    list: () => request<Application[]>("/api/applications"),
    dashboard: () => request<Dashboard>("/api/dashboard"),
    save: (input: ApplicationInput, id?: string) =>
      request<Application>(
        id
          ? `/api/applications/${encodeURIComponent(id)}`
          : "/api/applications",
        id ? "PATCH" : "POST",
        {
          company: input.company,
          role: input.role,
          category: input.category,
          channel: input.channel,
          status: input.status,
          applied_at: input.applied_at,
          decision_at: input.decision_at,
        },
      ),
    remove: (id) =>
      request<void>(`/api/applications/${encodeURIComponent(id)}`, "DELETE"),
    followUp: (id) =>
      request<void>(
        `/api/applications/${encodeURIComponent(id)}/follow-ups`,
        "POST",
      ),
    previewCsv: (csv) =>
      request<ImportPreview>("/api/imports/preview", "POST", { csv }),
    importCsv: (csv) => request<ImportPreview>("/api/imports", "POST", { csv }),
    incidents: () => request<Incident[]>("/api/incidents"),
  };
}

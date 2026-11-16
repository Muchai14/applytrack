import type { Api, Application } from "../types";
import { metrics, open, previewImport, updateRecord } from "../domain";
import { seedApplications, seedIncidents } from "./seed";
export const STORAGE_KEY = "applytrack.demo.v1";
export function createMockApi(
  storage: Storage = localStorage,
  delay = 180,
): Api {
  const wait = () => new Promise((resolve) => setTimeout(resolve, delay));
  const read = (): Application[] => {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw !== null) {
      try {
        const rows = JSON.parse(raw);
        if (!Array.isArray(rows)) throw new Error();
        return rows;
      } catch {
        throw new Error(
          "Saved demo data could not be read. Clear the ApplyTrack demo storage to start again.",
        );
      }
    }
    const rows = seedApplications();
    write(rows);
    return rows;
  };
  const write = (rows: Application[]) => {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(rows));
    } catch {
      throw new Error(
        "Could not save demo data. Browser storage may be full or disabled.",
      );
    }
  };
  return {
    async list() {
      await wait();
      return read();
    },
    async dashboard() {
      await wait();
      return metrics(read());
    },
    async save(input, id) {
      await wait();
      const rows = read();
      const previous = rows.find((a) => a.id === id);
      if (id && !previous) throw new Error("Application not found.");
      const a = updateRecord(input, previous);
      write(previous ? rows.map((x) => (x.id === id ? a : x)) : [a, ...rows]);
      return a;
    },
    async remove(id) {
      await wait();
      const rows = read();
      if (!rows.some((a) => a.id === id))
        throw new Error("Application not found.");
      write(rows.filter((a) => a.id !== id));
    },
    async followUp(id) {
      await wait();
      const rows = read();
      const a = rows.find((a) => a.id === id);
      if (!a) throw new Error("Application not found.");
      if (!open(a))
        throw new Error("Only open applications can receive follow-ups.");
      const now = new Date().toISOString();
      write(
        rows.map((x) =>
          x.id === id ? { ...x, last_followed_up_at: now, updated_at: now } : x,
        ),
      );
    },
    async previewCsv(csv) {
      await wait();
      return previewImport(csv, read());
    },
    async importCsv(csv) {
      await wait();
      const rows = read();
      const p = previewImport(csv, rows);
      if (p.errors.length)
        throw new Error("Import blocked: fix all validation errors first.");
      const ids = new Set(rows.map((a) => a.source_id).filter(Boolean));
      write([...rows, ...p.rows.filter((a) => !ids.has(a.source_id))]);
      return p;
    },
    async incidents() {
      await wait();
      return seedIncidents();
    },
  };
}

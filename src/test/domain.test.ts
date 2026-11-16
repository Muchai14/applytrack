import { describe, expect, it } from "vitest";
import {
  DAY,
  CSV_HEADER,
  metrics,
  previewImport,
  updateRecord,
  validateInput,
} from "../domain";
import type { Application, ApplicationInput } from "../types";
const now = Date.parse("2026-11-15T00:00:00Z");
const input: ApplicationInput = {
  company: "Example",
  role: "Analyst",
  category: "Data",
  channel: "Referral",
  status: "Applied",
  applied_at: "2026-10-01",
  decision_at: null,
};
function record(extra: Partial<Application> = {}): Application {
  return {
    ...updateRecord(input, undefined, "2026-10-01T00:00:00Z"),
    ...extra,
  };
}
const csv = (rows: string[]) => CSV_HEADER + "\n" + rows.join("\n");
const line = "one,Example,Analyst,Data,Referral,Applied,2026-10-01,,,";
describe("pipeline metrics", () => {
  it("handles empty datasets without NaN", () => {
    const d = metrics([]);
    expect(d.total).toBe(0);
    expect(d.median_days).toBeNull();
    expect(d.stale).toEqual([]);
  });
  it("counts only Applied and Interview as open", () => {
    const d = metrics(
      [
        record(),
        record({ status: "Interview" }),
        record({ status: "Closed" }),
        record({ status: "Rejected", decision_at: "2026-10-09" }),
      ],
      now,
    );
    expect(d.open).toBe(2);
    expect(d.counts).toEqual({
      Applied: 1,
      Interview: 1,
      Rejected: 1,
      Closed: 1,
    });
  });
  it("includes all statuses in rejection-share denominator", () => {
    const d = metrics(
      [record(), record({ status: "Rejected", decision_at: "2026-10-09" })],
      now,
    );
    expect(d.categories[0]).toMatchObject({ total: 2, rejected: 1, rate: 0.5 });
  });
  it("calculates the middle value for odd medians", () => {
    expect(
      metrics(
        [2, 6, 10].map((n) =>
          record({
            status: "Rejected",
            decision_at: new Date(
              Date.parse(input.applied_at) + n * DAY,
            ).toISOString(),
          }),
        ),
      ).median_days,
    ).toBe(6);
  });
  it("averages the middle values for even medians", () => {
    expect(
      metrics(
        [2, 5, 8, 10].map((n) =>
          record({
            status: "Rejected",
            decision_at: new Date(
              Date.parse(input.applied_at) + n * DAY,
            ).toISOString(),
          }),
        ),
      ).median_days,
    ).toBe(6.5);
  });
  it("treats exactly 21 days as stale, but not a millisecond earlier", () => {
    const a = record({
      applied_at: "2026-10-25",
      status_changed_at: "2026-10-25",
    });
    expect(metrics([a], now).stale).toHaveLength(1);
    expect(metrics([a], now - 1).stale).toHaveLength(0);
  });
  it("excludes terminal applications from stale reminders", () => {
    expect(
      metrics(
        [record({ status: "Rejected" }), record({ status: "Closed" })],
        now,
      ).stale,
    ).toHaveLength(0);
  });
  it("uses the latest follow-up or status transition", () => {
    expect(
      metrics(
        [
          record({ last_followed_up_at: "2026-11-14" }),
          record({ status_changed_at: "2026-11-14" }),
        ],
        now,
      ).stale,
    ).toHaveLength(0);
  });
});
describe("record validation and transitions", () => {
  it("rejects missing fields, impossible dates and invalid status", () => {
    expect(
      validateInput({
        ...input,
        company: " ",
        applied_at: "2026-02-30",
        status: "Wrong" as never,
      }),
    ).toHaveProperty("applied_at");
    expect(validateInput({ ...input, company: "" })).toHaveProperty("company");
  });
  it("requires a rejection date within the application date and today", () => {
    expect(
      validateInput({ ...input, status: "Rejected", decision_at: null }),
    ).toHaveProperty("decision_at");
    expect(
      validateInput({
        ...input,
        status: "Rejected",
        decision_at: "2026-09-30",
      }),
    ).toHaveProperty("decision_at");
  });
  it("preserves inactivity when descriptive fields change", () => {
    const old = record();
    const updated = updateRecord({ ...input, company: "New name" }, old);
    expect(updated.status_changed_at).toBe(old.status_changed_at);
    expect(updated.applied_at).toBe(old.applied_at);
  });
  it("reopening clears rejection date and resets the status clock", () => {
    const old = record({ status: "Rejected", decision_at: "2026-10-08" });
    const updated = updateRecord(input, old, "2026-11-15T00:00:00Z");
    expect(updated.decision_at).toBeNull();
    expect(updated.status_changed_at).toBe("2026-11-15T00:00:00Z");
  });
});
describe("CSV validation", () => {
  it("parses valid records and preserves historic dates", () => {
    const p = previewImport(csv([line]), []);
    expect(p.errors).toEqual([]);
    expect(p.created).toBe(1);
    expect(p.rows[0].status_changed_at).toBe("2026-10-01");
  });
  it("supports quoted commas", () => {
    expect(
      previewImport(csv([line.replace("Example", '"Example, Inc."')]), [])
        .rows[0].company,
    ).toBe("Example, Inc.");
  });
  it("identifies identical reimports", () => {
    const first = previewImport(csv([line]), []);
    expect(previewImport(csv([line]), first.rows)).toMatchObject({
      created: 0,
      skipped: 1,
      conflicts: 0,
    });
  });
  it("flags changed records as conflicts", () => {
    const first = previewImport(csv([line]), []);
    expect(
      previewImport(csv([line.replace("Example", "Changed")]), first.rows),
    ).toMatchObject({ created: 0, skipped: 0, conflicts: 1 });
  });
  it("rejects duplicate source IDs within a file", () => {
    expect(previewImport(csv([line, line]), []).errors.join()).toContain(
      "Duplicate source_id",
    );
  });
  it("reports row numbers for invalid records", () => {
    expect(
      previewImport(csv([line.replace("2026-10-01", "bad")]), []).errors[0],
    ).toContain("Row 2");
  });
  it("rejects future historical dates and missing rejection dates", () => {
    expect(
      previewImport(csv([line.replace(",,,", ",2099-01-01,,")]), []).errors,
    ).not.toHaveLength(0);
    expect(
      previewImport(csv([line.replace("Applied", "Rejected")]), []).errors,
    ).not.toHaveLength(0);
  });
  it("enforces headers, nonempty files, size and row limits", () => {
    expect(previewImport("company\nExample", []).errors[0]).toContain(
      "Missing columns",
    );
    expect(previewImport(CSV_HEADER, []).errors).not.toHaveLength(0);
    expect(previewImport("a".repeat(1024 * 1024 + 1), []).errors[0]).toContain(
      "1 MB",
    );
    expect(previewImport(csv(Array(1001).fill(line)), []).errors[0]).toContain(
      "1,000",
    );
  });
});

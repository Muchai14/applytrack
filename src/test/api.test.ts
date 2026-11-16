import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockApi, STORAGE_KEY } from "../api/mock";
import { createHttpApi } from "../api/http";
import { CSV_HEADER } from "../domain";
import type { ApplicationInput } from "../types";
const input: ApplicationInput = {
  company: "Test Labs",
  role: "Engineer",
  category: "Engineering",
  channel: "Referral",
  status: "Applied",
  applied_at: "2026-10-01",
  decision_at: null,
};
beforeEach(() => localStorage.setItem(STORAGE_KEY, "[]"));
describe("mock API persistence and data safety", () => {
  it("creates, edits, reads through a new adapter and deletes", async () => {
    const api = createMockApi(localStorage, 0);
    const a = await api.save(input);
    await api.save({ ...input, company: "Renamed" }, a.id);
    expect((await createMockApi(localStorage, 0).list())[0].company).toBe(
      "Renamed",
    );
    await api.remove(a.id);
    expect(await api.list()).toEqual([]);
  });
  it("follow-up removes stale reminder without changing status", async () => {
    const api = createMockApi(localStorage, 0);
    const a = await api.save(input);
    expect((await api.dashboard()).stale).toHaveLength(1);
    await api.followUp(a.id);
    expect((await api.dashboard()).stale).toHaveLength(0);
    expect((await api.list())[0].status).toBe("Applied");
  });
  it("does not reseed an intentionally empty collection", async () => {
    expect(await createMockApi(localStorage, 0).list()).toEqual([]);
  });
  it("rejects invalid mutations and unknown IDs", async () => {
    const api = createMockApi(localStorage, 0);
    await expect(api.save({ ...input, company: "" })).rejects.toThrow();
    await expect(api.remove("missing")).rejects.toThrow();
    await expect(api.followUp("missing")).rejects.toThrow();
    await expect(api.save(input, "missing")).rejects.toThrow();
  });
  it("does not follow up terminal records", async () => {
    const api = createMockApi(localStorage, 0);
    const a = await api.save({ ...input, status: "Closed" });
    await expect(api.followUp(a.id)).rejects.toThrow("Only open");
  });
  it("blocks all writes for a partially invalid CSV", async () => {
    const api = createMockApi(localStorage, 0);
    const csv =
      CSV_HEADER +
      "\none,Example,Engineer,Engineering,Referral,Applied,2026-10-01,,,\ntwo,,Engineer,Engineering,Referral,Applied,2026-10-01,,,";
    await expect(api.importCsv(csv)).rejects.toThrow("Import blocked");
    expect(await api.list()).toEqual([]);
  });
  it("rechecks imports, skips duplicates and leaves conflicts unchanged", async () => {
    const api = createMockApi(localStorage, 0);
    const csv =
      CSV_HEADER +
      "\none,Example,Engineer,Engineering,Referral,Applied,2026-10-01,,,";
    await api.importCsv(csv);
    expect((await api.importCsv(csv)).skipped).toBe(1);
    expect(
      (await api.importCsv(csv.replace("Example", "Changed"))).conflicts,
    ).toBe(1);
    expect((await api.list())[0].company).toBe("Example");
  });
  it("reports storage corruption instead of silently replacing data", async () => {
    localStorage.setItem(STORAGE_KEY, "bad");
    await expect(createMockApi(localStorage, 0).list()).rejects.toThrow(
      "could not be read",
    );
    expect(localStorage.getItem(STORAGE_KEY)).toBe("bad");
  });
  it("does not report success when storage fails", async () => {
    const broken = {
      getItem: () => null,
      setItem: () => {
        throw new Error();
      },
    } as unknown as Storage;
    await expect(createMockApi(broken, 0).save(input)).rejects.toThrow(
      "Could not save",
    );
  });
});
describe("HTTP adapter", () => {
  it("centralizes URL and JSON mutation payload", async () => {
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ id: "a", ...input }), { status: 201 }),
      );
    await createHttpApi("https://api.example/").save(input);
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.example/api/applications",
      expect.objectContaining({ method: "POST", body: JSON.stringify(input) }),
    );
    fetcher.mockRestore();
  });
  it("handles no-content responses and HTTP failures", async () => {
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    const api = createHttpApi("");
    await expect(api.remove("a")).resolves.toBeUndefined();
    await expect(api.dashboard()).rejects.toThrow("503");
    fetcher.mockRestore();
  });
});

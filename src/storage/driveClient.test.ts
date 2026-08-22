import { describe, it, expect, vi } from "vitest";
import { createDriveClient, ConflictError, FOLDER_NAME, MAX_PINNED_REVISIONS } from "./driveClient";
import { emptyPlan } from "../core/schema";
import type { GoogleAuth } from "./googleAuth";

interface Stub {
  url: string;
  init?: RequestInit;
}

/** Queue of responses matched in call order; records every request. */
function harness(responses: Array<{ status?: number; body?: unknown }>) {
  const calls: Stub[] = [];
  let i = 0;
  const fetchStub = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const r = responses[i++] ?? { status: 200, body: {} };
    return {
      ok: (r.status ?? 200) < 400,
      status: r.status ?? 200,
      json: async () => r.body ?? {},
      text: async () => JSON.stringify(r.body ?? {}),
    } as unknown as Response;
  });
  return { fetchStub: fetchStub as unknown as typeof fetch, calls };
}

function authStub(): GoogleAuth & { refreshes: number } {
  let token: string | null = "tok";
  const a = {
    refreshes: 0,
    getToken: () => token,
    async requestToken() {
      a.refreshes++;
      token = "tok-refreshed";
      return token;
    },
    signOut() {
      token = null;
    },
  };
  return a;
}

const headerOf = (call: Stub, name: string) =>
  (call.init?.headers as Record<string, string> | undefined)?.[name];

/** Responses for a folder lookup that finds an existing folder. */
const FOLDER_FOUND = { body: { files: [{ id: "folder-1" }] } };

describe("token refresh", () => {
  it("refreshes once on 401 and retries the request", async () => {
    const { fetchStub, calls } = harness([
      { status: 401 },
      { body: emptyPlan("p") },
      { body: { headRevisionId: "rev-1" } },
    ]);
    const auth = authStub();
    const client = createDriveClient({ fetch: fetchStub, auth });
    await client.read("file-1");
    expect(auth.refreshes).toBe(1);
    expect(calls).toHaveLength(3);
    expect(headerOf(calls[0], "Authorization")).toBe("Bearer tok");
    expect(headerOf(calls[1], "Authorization")).toBe("Bearer tok-refreshed");
  });

  it("does not retry more than once", async () => {
    const { fetchStub, calls } = harness([{ status: 401 }, { status: 401 }]);
    const auth = authStub();
    const client = createDriveClient({ fetch: fetchStub, auth });
    await expect(client.read("file-1")).rejects.toThrow();
    expect(auth.refreshes).toBe(1);
    expect(calls).toHaveLength(2);
  });

  it("surfaces a non-401 failure without refreshing", async () => {
    const { fetchStub } = harness([{ status: 500, body: { error: "boom" } }]);
    const auth = authStub();
    const client = createDriveClient({ fetch: fetchStub, auth });
    await expect(client.read("file-1")).rejects.toThrow(/500/);
    expect(auth.refreshes).toBe(0);
  });
});

describe("ensureFolder", () => {
  it("reuses an existing folder", async () => {
    const { fetchStub, calls } = harness([FOLDER_FOUND]);
    const client = createDriveClient({ fetch: fetchStub, auth: authStub() });
    expect(await client.ensureFolder()).toBe("folder-1");
    expect(calls[0].url).toContain(encodeURIComponent(`name='${FOLDER_NAME}'`));
  });

  it("creates the folder when none exists", async () => {
    const { fetchStub, calls } = harness([{ body: { files: [] } }, { body: { id: "folder-new" } }]);
    const client = createDriveClient({ fetch: fetchStub, auth: authStub() });
    expect(await client.ensureFolder()).toBe("folder-new");
    expect(calls[1].init?.method).toBe("POST");
    expect(JSON.parse(calls[1].init?.body as string)).toMatchObject({
      name: FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
    });
  });

  it("caches the folder id across calls", async () => {
    const { fetchStub, calls } = harness([FOLDER_FOUND]);
    const client = createDriveClient({ fetch: fetchStub, auth: authStub() });
    await client.ensureFolder();
    await client.ensureFolder();
    expect(calls).toHaveLength(1);
  });
});

describe("listPlans", () => {
  it("lists files inside the plan folder", async () => {
    const files = [{ id: "f1", name: "Q3", modifiedTime: "2026-08-01T00:00:00Z" }];
    const { fetchStub, calls } = harness([FOLDER_FOUND, { body: { files } }]);
    const client = createDriveClient({ fetch: fetchStub, auth: authStub() });
    expect(await client.listPlans()).toEqual(files);
    expect(calls[1].url).toContain(encodeURIComponent("'folder-1' in parents"));
  });

  it("returns an empty list when the folder is empty", async () => {
    const { fetchStub } = harness([FOLDER_FOUND, { body: {} }]);
    const client = createDriveClient({ fetch: fetchStub, auth: authStub() });
    expect(await client.listPlans()).toEqual([]);
  });
});

describe("read", () => {
  it("validates content and returns the head revision id", async () => {
    const doc = emptyPlan("p");
    const { fetchStub } = harness([{ body: doc }, { body: { headRevisionId: "rev-7" } }]);
    const client = createDriveClient({ fetch: fetchStub, auth: authStub() });
    const result = await client.read("file-1");
    expect(result.doc).toEqual(doc);
    expect(result.headRevisionId).toBe("rev-7");
  });

  it("rejects a file that is not a valid plan", async () => {
    const { fetchStub } = harness([{ body: { schemaVersion: 99 } }]);
    const client = createDriveClient({ fetch: fetchStub, auth: authStub() });
    await expect(client.read("file-1")).rejects.toThrow();
  });
});

describe("update", () => {
  it("raises ConflictError when the remote head moved", async () => {
    const { fetchStub, calls } = harness([{ body: { headRevisionId: "rev-9" } }]);
    const client = createDriveClient({ fetch: fetchStub, auth: authStub() });
    await expect(client.update("file-1", emptyPlan("p"), "rev-7")).rejects.toBeInstanceOf(
      ConflictError,
    );
    // The precondition check is the only request: nothing was written.
    expect(calls).toHaveLength(1);
  });

  it("reports the remote head revision on the conflict", async () => {
    const { fetchStub } = harness([{ body: { headRevisionId: "rev-9" } }]);
    const client = createDriveClient({ fetch: fetchStub, auth: authStub() });
    await expect(client.update("file-1", emptyPlan("p"), "rev-7")).rejects.toMatchObject({
      remoteHeadRevisionId: "rev-9",
    });
  });

  it("writes, then pins the new revision with keepForever", async () => {
    const { fetchStub, calls } = harness([
      { body: { headRevisionId: "rev-7" } }, // precondition check
      { body: { id: "file-1", headRevisionId: "rev-8" } }, // content upload
      { body: {} }, // pin
      { body: { revisions: [] } }, // prune listing
    ]);
    const client = createDriveClient({ fetch: fetchStub, auth: authStub() });
    const out = await client.update("file-1", emptyPlan("p"), "rev-7");
    expect(out.headRevisionId).toBe("rev-8");

    const pin = calls.find((c) => c.url.includes("/revisions/rev-8"))!;
    expect(pin.init?.method).toBe("PATCH");
    expect(JSON.parse(pin.init?.body as string)).toEqual({ keepForever: true });
  });

  it("unpins revisions beyond the newest MAX_PINNED_REVISIONS", async () => {
    const revisions = Array.from({ length: MAX_PINNED_REVISIONS + 3 }, (_, i) => ({
      id: `rev-${i}`,
      modifiedTime: `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
      keepForever: true,
    }));
    const { fetchStub, calls } = harness([
      { body: { headRevisionId: "rev-7" } },
      { body: { headRevisionId: "rev-new" } },
      { body: {} },
      { body: { revisions } },
      { body: {} },
      { body: {} },
      { body: {} },
    ]);
    const client = createDriveClient({ fetch: fetchStub, auth: authStub() });
    await client.update("file-1", emptyPlan("p"), "rev-7");

    const unpins = calls.filter(
      (c) => c.init?.method === "PATCH" && c.init.body === JSON.stringify({ keepForever: false }),
    );
    expect(unpins).toHaveLength(3);
    // Oldest first: rev-0, rev-1, rev-2
    expect(unpins[0].url).toContain("/revisions/rev-0");
    expect(unpins[2].url).toContain("/revisions/rev-2");
  });

  it("leaves revisions alone while under the cap", async () => {
    const revisions = [{ id: "rev-1", modifiedTime: "2026-01-01T00:00:00Z", keepForever: true }];
    const { fetchStub, calls } = harness([
      { body: { headRevisionId: "rev-7" } },
      { body: { headRevisionId: "rev-8" } },
      { body: {} },
      { body: { revisions } },
    ]);
    const client = createDriveClient({ fetch: fetchStub, auth: authStub() });
    await client.update("file-1", emptyPlan("p"), "rev-7");
    const unpins = calls.filter(
      (c) => c.init?.method === "PATCH" && c.init.body === JSON.stringify({ keepForever: false }),
    );
    expect(unpins).toEqual([]);
  });
});

describe("create", () => {
  it("uploads multipart with the folder as parent", async () => {
    const { fetchStub, calls } = harness([
      FOLDER_FOUND,
      { body: { id: "new-file", headRevisionId: "rev-1" } },
      { body: {} },
      { body: { revisions: [] } },
    ]);
    const client = createDriveClient({ fetch: fetchStub, auth: authStub() });
    const out = await client.create("My Plan", emptyPlan("p"));
    expect(out).toEqual({ fileId: "new-file", headRevisionId: "rev-1" });

    const upload = calls[1];
    expect(upload.url).toContain("uploadType=multipart");
    expect(upload.init?.body as string).toContain("My Plan");
    expect(upload.init?.body as string).toContain("folder-1");
  });

  it("pins the first revision", async () => {
    const { fetchStub, calls } = harness([
      FOLDER_FOUND,
      { body: { id: "new-file", headRevisionId: "rev-1" } },
      { body: {} },
      { body: { revisions: [] } },
    ]);
    const client = createDriveClient({ fetch: fetchStub, auth: authStub() });
    await client.create("My Plan", emptyPlan("p"));
    const pin = calls.find((c) => c.url.includes("/revisions/rev-1"))!;
    expect(JSON.parse(pin.init?.body as string)).toEqual({ keepForever: true });
  });
});

describe("listRevisions", () => {
  it("offers only pinned revisions, newest first", async () => {
    const { fetchStub } = harness([
      {
        body: {
          revisions: [
            { id: "rev-1", modifiedTime: "2026-01-01T00:00:00Z", keepForever: true },
            { id: "rev-2", modifiedTime: "2026-01-02T00:00:00Z" },
            { id: "rev-3", modifiedTime: "2026-01-03T00:00:00Z", keepForever: true },
          ],
        },
      },
    ]);
    const client = createDriveClient({ fetch: fetchStub, auth: authStub() });
    expect(await client.listRevisions("file-1")).toEqual([
      { id: "rev-3", modifiedTime: "2026-01-03T00:00:00Z" },
      { id: "rev-1", modifiedTime: "2026-01-01T00:00:00Z" },
    ]);
  });
});

describe("readRevision", () => {
  it("validates the fetched revision content", async () => {
    const { fetchStub, calls } = harness([{ body: emptyPlan("old") }]);
    const client = createDriveClient({ fetch: fetchStub, auth: authStub() });
    const doc = await client.readRevision("file-1", "rev-3");
    expect(doc.name).toBe("old");
    expect(calls[0].url).toContain("alt=media");
    expect(calls[0].url).toContain("/revisions/rev-3");
  });
});

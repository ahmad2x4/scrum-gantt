import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSaveController } from "./saveController";
import { createStore } from "../core/store";
import { emptyPlan } from "../core/schema";
import { addTeam } from "../core/mutations";
import { ConflictError, type DriveClient } from "../storage/driveClient";
import { loadDraft, saveDraft } from "../storage/localDraft";

beforeEach(() => localStorage.clear());

function driveStub(over: Partial<DriveClient> = {}): DriveClient {
  return {
    ensureFolder: vi.fn(async () => "folder"),
    listPlans: vi.fn(async () => []),
    read: vi.fn(async () => ({
      doc: emptyPlan("remote"),
      headRevisionId: "rev-1",
    })),
    create: vi.fn(async () => ({ fileId: "file-1", headRevisionId: "rev-1" })),
    update: vi.fn(async () => ({ headRevisionId: "rev-2" })),
    listRevisions: vi.fn(async () => []),
    readRevision: vi.fn(async () => emptyPlan("old")),
    ...over,
  };
}

describe("save", () => {
  it("creates the file on first save and remembers the id", async () => {
    const store = createStore(emptyPlan("New Plan"));
    const drive = driveStub();
    const c = createSaveController({ store, drive });
    await c.save();
    expect(drive.create).toHaveBeenCalledWith("New Plan", expect.anything());
    expect(c.getStatus().fileId).toBe("file-1");
  });

  it("updates in place on subsequent saves", async () => {
    const store = createStore(emptyPlan("p"));
    const drive = driveStub();
    const c = createSaveController({ store, drive });
    await c.save();
    await c.save();
    expect(drive.create).toHaveBeenCalledTimes(1);
    expect(drive.update).toHaveBeenCalledWith(
      "file-1",
      expect.anything(),
      "rev-1",
    );
  });

  it("advances the expected head revision after each save", async () => {
    const store = createStore(emptyPlan("p"));
    const drive = driveStub();
    const c = createSaveController({ store, drive });
    await c.save();
    await c.save();
    await c.save();
    // Reusing rev-1 here would make every save after the first conflict.
    expect(drive.update).toHaveBeenLastCalledWith(
      "file-1",
      expect.anything(),
      "rev-2",
    );
  });

  it("clears the dirty flag after a successful save", async () => {
    const store = createStore(emptyPlan("p"));
    store.apply(addTeam("Falcon"));
    const c = createSaveController({ store, drive: driveStub() });
    await c.save();
    expect(store.isDirty()).toBe(false);
  });

  it("clears the local draft after a successful save", async () => {
    const store = createStore(emptyPlan("p"));
    saveDraft({ doc: store.get(), fileId: null, savedAt: "x" });
    const c = createSaveController({ store, drive: driveStub() });
    await c.save();
    expect(loadDraft()).toBeNull();
  });

  it("records an error and leaves the store dirty when the write fails", async () => {
    const store = createStore(emptyPlan("p"));
    store.apply(addTeam("Falcon"));
    const drive = driveStub({
      create: vi.fn(async () => {
        throw new Error("offline");
      }),
    });
    const c = createSaveController({ store, drive });
    await c.save();
    expect(c.getStatus().error).toMatch(/offline/);
    expect(store.isDirty()).toBe(true);
  });

  it("keeps the local draft when the write fails", async () => {
    const store = createStore(emptyPlan("p"));
    saveDraft({ doc: store.get(), fileId: null, savedAt: "x" });
    const drive = driveStub({
      create: vi.fn(async () => {
        throw new Error("offline");
      }),
    });
    const c = createSaveController({ store, drive });
    await c.save();
    expect(loadDraft()).not.toBeNull();
  });

  it("notifies subscribers as saving starts and finishes", async () => {
    const listener = vi.fn();
    const c = createSaveController({
      store: createStore(emptyPlan("p")),
      drive: driveStub(),
    });
    c.subscribe(listener);
    await c.save();
    expect(listener.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(c.getStatus().saving).toBe(false);
  });

  it("reports saving as false once a failed save settles", async () => {
    const drive = driveStub({
      create: vi.fn(async () => {
        throw new Error("offline");
      }),
    });
    const c = createSaveController({
      store: createStore(emptyPlan("p")),
      drive,
    });
    await c.save();
    expect(c.getStatus().saving).toBe(false);
  });

  it("stops subscribers being notified after unsubscribe", async () => {
    const listener = vi.fn();
    const c = createSaveController({
      store: createStore(emptyPlan("p")),
      drive: driveStub(),
    });
    c.subscribe(listener)();
    await c.save();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("saveAs", () => {
  it("renames the plan and writes it to a new file", async () => {
    const store = createStore(emptyPlan("Old name"));
    const drive = driveStub({
      create: vi.fn(async () => ({ fileId: "file-2", headRevisionId: "r" })),
    });
    const c = createSaveController({ store, drive });
    await c.saveAs("New name");
    expect(store.get().name).toBe("New name");
    expect(drive.create).toHaveBeenCalledWith("New name", expect.anything());
    expect(c.getStatus().fileId).toBe("file-2");
  });

  it("writes to a second file when the plan was already saved", async () => {
    const store = createStore(emptyPlan("p"));
    const drive = driveStub();
    const c = createSaveController({ store, drive });
    await c.save();
    await c.saveAs("Copy");
    expect(drive.create).toHaveBeenCalledTimes(2);
    expect(drive.update).not.toHaveBeenCalled();
  });
});

describe("conflict", () => {
  it("surfaces a conflict instead of overwriting", async () => {
    const store = createStore(emptyPlan("p"));
    const drive = driveStub({
      update: vi.fn(async () => {
        throw new ConflictError("rev-9");
      }),
    });
    const c = createSaveController({ store, drive });
    await c.save(); // create
    await c.save(); // update -> conflict
    expect(c.getStatus().conflict).toEqual({ remoteHeadRevisionId: "rev-9" });
  });

  it("does not report a conflict as an error", async () => {
    const store = createStore(emptyPlan("p"));
    const drive = driveStub({
      update: vi.fn(async () => {
        throw new ConflictError("rev-9");
      }),
    });
    const c = createSaveController({ store, drive });
    await c.save();
    await c.save();
    expect(c.getStatus().error).toBeNull();
  });

  it("leaves the plan dirty while a conflict is unresolved", async () => {
    const store = createStore(emptyPlan("p"));
    const drive = driveStub({
      update: vi.fn(async () => {
        throw new ConflictError("rev-9");
      }),
    });
    const c = createSaveController({ store, drive });
    await c.save();
    store.apply(addTeam("Falcon"));
    await c.save();
    expect(store.isDirty()).toBe(true);
  });

  it("reload replaces the document from Drive and clears the conflict", async () => {
    const store = createStore(emptyPlan("p"));
    const drive = driveStub({
      update: vi.fn(async () => {
        throw new ConflictError("rev-9");
      }),
    });
    const c = createSaveController({ store, drive });
    await c.save();
    await c.save();
    await c.resolveConflict("reload");
    expect(store.get().name).toBe("remote");
    expect(c.getStatus().conflict).toBeNull();
  });

  it("copy saves under a new file", async () => {
    const store = createStore(emptyPlan("p"));
    const drive = driveStub({
      update: vi.fn(async () => {
        throw new ConflictError("rev-9");
      }),
      create: vi.fn(async () => ({
        fileId: "copy-1",
        headRevisionId: "rev-1",
      })),
    });
    const c = createSaveController({ store, drive });
    await c.save();
    await c.save();
    await c.resolveConflict("copy");
    expect(c.getStatus().fileId).toBe("copy-1");
    expect(c.getStatus().conflict).toBeNull();
  });

  it("overwrite retries against the remote head revision", async () => {
    const store = createStore(emptyPlan("p"));
    const update = vi
      .fn()
      .mockRejectedValueOnce(new ConflictError("rev-9"))
      .mockResolvedValueOnce({ headRevisionId: "rev-10" });
    const c = createSaveController({ store, drive: driveStub({ update }) });
    await c.save();
    await c.save();
    await c.resolveConflict("overwrite");
    expect(update).toHaveBeenLastCalledWith(
      "file-1",
      expect.anything(),
      "rev-9",
    );
    expect(c.getStatus().conflict).toBeNull();
  });

  it("keeps the conflict when the chosen resolution itself fails", async () => {
    const store = createStore(emptyPlan("p"));
    const update = vi
      .fn()
      .mockRejectedValueOnce(new ConflictError("rev-9"))
      .mockRejectedValueOnce(new Error("offline"));
    const c = createSaveController({ store, drive: driveStub({ update }) });
    await c.save();
    await c.save();
    await c.resolveConflict("overwrite");
    expect(c.getStatus().conflict).toEqual({ remoteHeadRevisionId: "rev-9" });
    expect(c.getStatus().error).toMatch(/offline/);
  });

  it("ignores a resolution when there is no conflict", async () => {
    const store = createStore(emptyPlan("p"));
    const drive = driveStub();
    const c = createSaveController({ store, drive });
    await c.resolveConflict("overwrite");
    expect(drive.update).not.toHaveBeenCalled();
  });
});

describe("openFile and restore", () => {
  it("openFile replaces the document and records the file id", async () => {
    const store = createStore(emptyPlan("p"));
    const c = createSaveController({ store, drive: driveStub() });
    await c.openFile("file-7");
    expect(store.get().name).toBe("remote");
    expect(c.getStatus().fileId).toBe("file-7");
    expect(store.isDirty()).toBe(false);
  });

  it("saves an opened file back to the same file", async () => {
    const store = createStore(emptyPlan("p"));
    const drive = driveStub();
    const c = createSaveController({ store, drive });
    await c.openFile("file-7");
    await c.save();
    expect(drive.create).not.toHaveBeenCalled();
    expect(drive.update).toHaveBeenCalledWith(
      "file-7",
      expect.anything(),
      "rev-1",
    );
  });

  it("restore loads a revision and marks the plan dirty so it can be saved forward", async () => {
    const store = createStore(emptyPlan("p"));
    const c = createSaveController({ store, drive: driveStub() });
    await c.openFile("file-7");
    await c.restore("rev-3");
    expect(store.get().name).toBe("old");
    expect(store.isDirty()).toBe(true);
  });

  it("restore records an error when no plan is open", async () => {
    const store = createStore(emptyPlan("p"));
    const drive = driveStub();
    const c = createSaveController({ store, drive });
    await c.restore("rev-3");
    expect(drive.readRevision).not.toHaveBeenCalled();
    expect(c.getStatus().error).toBeTruthy();
  });
});

describe("dismissError", () => {
  it("clears a recorded error", async () => {
    const drive = driveStub({
      create: vi.fn(async () => {
        throw new Error("offline");
      }),
    });
    const c = createSaveController({
      store: createStore(emptyPlan("p")),
      drive,
    });
    await c.save();
    c.dismissError();
    expect(c.getStatus().error).toBeNull();
  });
});

describe("locking", () => {
  const lockedPlan = (name: string) => ({ ...emptyPlan(name), locked: true });

  it("keeps the current lock when restoring a revision", async () => {
    // The revision predates the lock, so adopting its locked field wholesale
    // would unlock the plan through the History dialog — a hole straight
    // through the lock. Content rolls back; the lock does not.
    const store = createStore(lockedPlan("p"));
    const drive = driveStub({
      readRevision: vi.fn(async () => emptyPlan("old")),
    });
    const c = createSaveController({ store, drive });
    await c.openFile("file-1");
    store.apply(() => lockedPlan("p"), { allowLocked: true });
    await c.restore("rev-0");
    expect(store.get().name).toBe("old");
    expect(store.get().locked).toBe(true);
  });

  it("leaves an unlocked plan unlocked when restoring", async () => {
    const store = createStore(emptyPlan("p"));
    const drive = driveStub({
      readRevision: vi.fn(async () => lockedPlan("old")),
    });
    const c = createSaveController({ store, drive });
    await c.openFile("file-1");
    await c.restore("rev-0");
    expect(store.get().locked).toBeUndefined();
  });

  it("adopts the lock of a plan it opens, which is a different file", async () => {
    const store = createStore(emptyPlan("p"));
    const drive = driveStub({
      read: vi.fn(async () => ({
        doc: lockedPlan("remote"),
        headRevisionId: "rev-1",
      })),
    });
    const c = createSaveController({ store, drive });
    await c.openFile("file-9");
    expect(store.get().locked).toBe(true);
  });

  it("writes an unlocked copy from Save as, so the branch is workable", async () => {
    const store = createStore(lockedPlan("Baseline"));
    const drive = driveStub();
    const c = createSaveController({ store, drive });
    await c.saveAs("Baseline copy");
    expect(store.get().locked).toBe(false);
    expect(drive.create).toHaveBeenCalledWith(
      "Baseline copy",
      expect.objectContaining({ locked: false }),
    );
  });

  it("renames on Save as even though the plan was locked", async () => {
    // The rename goes through apply, which the lock gate would otherwise
    // refuse, silently writing the copy under the old name.
    const store = createStore(lockedPlan("Baseline"));
    const c = createSaveController({ store, drive: driveStub() });
    await c.saveAs("Baseline copy");
    expect(store.get().name).toBe("Baseline copy");
  });
});

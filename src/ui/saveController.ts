import type { Store } from "../core/store";
import { ConflictError, type DriveClient } from "../storage/driveClient";
import { saveDraft, clearDraft } from "../storage/localDraft";

export interface SaveStatus {
  saving: boolean;
  error: string | null;
  conflict: { remoteHeadRevisionId: string } | null;
  fileId: string | null;
}

export type ConflictChoice = "reload" | "copy" | "overwrite";

export interface SaveController {
  getStatus(): SaveStatus;
  subscribe(fn: () => void): () => void;
  save(): Promise<void>;
  saveAs(name: string): Promise<void>;
  openFile(fileId: string): Promise<void>;
  restore(revisionId: string): Promise<void>;
  resolveConflict(choice: ConflictChoice): Promise<void>;
  dismissError(): void;
}

/**
 * All Drive orchestration lives here so the composition root stays a wiring
 * file. Plain TypeScript with no React, so it is fully unit-testable.
 */
export function createSaveController(deps: {
  store: Store;
  drive: DriveClient;
}): SaveController {
  const { store, drive } = deps;
  let status: SaveStatus = {
    saving: false,
    error: null,
    conflict: null,
    fileId: null,
  };
  let headRevisionId: string | null = null;
  const listeners = new Set<() => void>();

  const set = (patch: Partial<SaveStatus>) => {
    status = { ...status, ...patch };
    listeners.forEach((fn) => fn());
  };

  /** Wraps a Drive operation with the saving flag and uniform error capture. */
  async function run(op: () => Promise<void>): Promise<void> {
    set({ saving: true, error: null });
    try {
      await op();
    } catch (e) {
      if (e instanceof ConflictError) {
        // A conflict is a decision for the user, not a failure to report.
        set({ conflict: { remoteHeadRevisionId: e.remoteHeadRevisionId } });
      } else {
        set({ error: e instanceof Error ? e.message : String(e) });
      }
    } finally {
      set({ saving: false });
    }
  }

  async function writeNew(name: string): Promise<void> {
    const result = await drive.create(name, store.get());
    headRevisionId = result.headRevisionId;
    set({ fileId: result.fileId, conflict: null });
    store.markSaved();
    clearDraft();
  }

  async function writeExisting(
    fileId: string,
    expected: string,
  ): Promise<void> {
    const result = await drive.update(fileId, store.get(), expected);
    headRevisionId = result.headRevisionId;
    set({ conflict: null });
    store.markSaved();
    clearDraft();
  }

  return {
    getStatus: () => status,

    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },

    save() {
      return run(async () => {
        if (status.fileId && headRevisionId) {
          await writeExisting(status.fileId, headRevisionId);
        } else {
          await writeNew(store.get().name);
        }
      });
    },

    saveAs(name) {
      return run(async () => {
        // The copy is a branch off the baseline, so it arrives unlocked and
        // workable; the original file in Drive keeps its locked content.
        // allowLocked because the rename itself would otherwise be refused,
        // silently writing the copy under the old name.
        store.apply((d) => ({ ...d, name, locked: false }), {
          allowLocked: true,
        });
        await writeNew(name);
      });
    },

    openFile(fileId) {
      return run(async () => {
        const { doc, headRevisionId: head } = await drive.read(fileId);
        headRevisionId = head;
        store.replace(doc);
        set({ fileId, conflict: null });
        clearDraft();
      });
    },

    restore(revisionId) {
      return run(async () => {
        if (!status.fileId)
          throw new Error("Open a plan before restoring a revision.");
        const doc = await drive.readRevision(status.fileId, revisionId);
        // The lock is the plan's current state, not the revision's. A revision
        // predating the lock carries locked: false, and adopting that would
        // unlock the plan through the History dialog.
        // Both directions: a revision saved while locked must not re-lock a
        // plan the user has since unlocked either.
        const locked = store.get().locked;
        const { locked: _discarded, ...content } = doc;
        store.replace(locked === undefined ? content : { ...content, locked });
        // Restoring is an edit, not a save: the user must confirm it forward,
        // and until they do it lives only in the draft.
        store.markDirty();
        saveDraft({
          doc: store.get(),
          fileId: status.fileId,
          savedAt: new Date().toISOString(),
        });
      });
    },

    resolveConflict(choice) {
      const remote = status.conflict?.remoteHeadRevisionId;
      const fileId = status.fileId;
      return run(async () => {
        if (!remote || !fileId) return;
        if (choice === "reload") {
          const { doc, headRevisionId: head } = await drive.read(fileId);
          headRevisionId = head;
          store.replace(doc);
          set({ conflict: null });
        } else if (choice === "copy") {
          await writeNew(`${store.get().name} (copy)`);
        } else {
          await writeExisting(fileId, remote);
        }
      });
    },

    dismissError() {
      set({ error: null });
    },
  };
}

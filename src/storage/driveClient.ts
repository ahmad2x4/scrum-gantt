import type { PlanDocument } from "../core/types";
import { validate } from "../core/schema";
import type { GoogleAuth } from "./googleAuth";

export const FOLDER_NAME = "Scrum Gantt";

/**
 * Drive caps a file at 200 pinned revisions. Staying well under it leaves room
 * for the pin of a new save to succeed before the prune runs.
 */
export const MAX_PINNED_REVISIONS = 50;

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const MIME = "application/json";
const FOLDER_MIME = "application/vnd.google-apps.folder";

export interface PlanFile {
  id: string;
  name: string;
  modifiedTime: string;
}

export interface RevisionInfo {
  id: string;
  modifiedTime: string;
}

export class ConflictError extends Error {
  remoteHeadRevisionId: string;

  constructor(remoteHeadRevisionId: string) {
    super("This plan was changed elsewhere since you opened it.");
    this.name = "ConflictError";
    this.remoteHeadRevisionId = remoteHeadRevisionId;
  }
}

export interface DriveClient {
  ensureFolder(): Promise<string>;
  listPlans(): Promise<PlanFile[]>;
  read(fileId: string): Promise<{ doc: PlanDocument; headRevisionId: string }>;
  create(
    name: string,
    doc: PlanDocument,
  ): Promise<{ fileId: string; headRevisionId: string }>;
  update(
    fileId: string,
    doc: PlanDocument,
    expectedHeadRevisionId: string,
  ): Promise<{ headRevisionId: string }>;
  listRevisions(fileId: string): Promise<RevisionInfo[]>;
  readRevision(fileId: string, revisionId: string): Promise<PlanDocument>;
}

interface RawRevision {
  id: string;
  modifiedTime: string;
  keepForever?: boolean;
}

export function createDriveClient(deps: {
  fetch: typeof fetch;
  auth: GoogleAuth;
}): DriveClient {
  /** Every request goes through here: 401 is routine, refresh once and retry. */
  async function call<T>(
    url: string,
    init: RequestInit = {},
    retried = false,
  ): Promise<T> {
    const token = deps.auth.getToken();
    const res = await deps.fetch(url, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
    });
    if (res.status === 401 && !retried) {
      await deps.auth.requestToken({ silent: true });
      return call<T>(url, init, true);
    }
    if (!res.ok) {
      throw new Error(
        `Drive request failed (${res.status}): ${await res.text()}`,
      );
    }
    return (await res.json()) as T;
  }

  const revisionUrl = (fileId: string, revisionId: string) =>
    `${API}/files/${fileId}/revisions/${revisionId}`;

  const revisionsUrl = (fileId: string) =>
    `${API}/files/${fileId}/revisions?fields=revisions(id,modifiedTime,keepForever)&pageSize=1000`;

  async function headRevisionId(fileId: string): Promise<string> {
    const meta = await call<{ headRevisionId: string }>(
      `${API}/files/${fileId}?fields=headRevisionId`,
    );
    return meta.headRevisionId;
  }

  async function setPinned(
    fileId: string,
    revisionId: string,
    keepForever: boolean,
  ): Promise<void> {
    await call(revisionUrl(fileId, revisionId), {
      method: "PATCH",
      headers: { "Content-Type": MIME },
      body: JSON.stringify({ keepForever }),
    });
  }

  /**
   * Pins the just-written revision, then unpins the oldest so the file stays
   * under the cap. Unpinned revisions of a binary file cannot be downloaded, so
   * pinning is what makes history usable at all.
   */
  async function pinAndPrune(
    fileId: string,
    revisionId: string,
  ): Promise<void> {
    await setPinned(fileId, revisionId, true);

    const listed = await call<{ revisions?: RawRevision[] }>(
      revisionsUrl(fileId),
    );
    const pinned = (listed.revisions ?? []).filter((r) => r.keepForever);
    pinned.sort((a, b) => a.modifiedTime.localeCompare(b.modifiedTime));

    const excess = pinned.slice(
      0,
      Math.max(0, pinned.length - MAX_PINNED_REVISIONS),
    );
    for (const rev of excess) {
      await setPinned(fileId, rev.id, false);
    }
  }

  let folderId: string | null = null;

  async function ensureFolder(): Promise<string> {
    if (folderId) return folderId;
    const q = encodeURIComponent(
      `name='${FOLDER_NAME}' and mimeType='${FOLDER_MIME}' and trashed=false`,
    );
    const found = await call<{ files?: Array<{ id: string }> }>(
      `${API}/files?q=${q}&fields=files(id)`,
    );
    if (found.files?.length) {
      folderId = found.files[0].id;
      return folderId;
    }
    const created = await call<{ id: string }>(`${API}/files?fields=id`, {
      method: "POST",
      headers: { "Content-Type": MIME },
      body: JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_MIME }),
    });
    folderId = created.id;
    return folderId;
  }

  return {
    ensureFolder,

    async listPlans() {
      const parent = await ensureFolder();
      const q = encodeURIComponent(`'${parent}' in parents and trashed=false`);
      const res = await call<{ files?: PlanFile[] }>(
        `${API}/files?q=${q}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc`,
      );
      return res.files ?? [];
    },

    async read(fileId) {
      const content = await call<unknown>(`${API}/files/${fileId}?alt=media`);
      const doc = validate(content);
      return { doc, headRevisionId: await headRevisionId(fileId) };
    },

    async create(name, doc) {
      const parent = await ensureFolder();
      const boundary = `b${Math.random().toString(36).slice(2)}`;
      const metadata = { name, mimeType: MIME, parents: [parent] };
      const body =
        `--${boundary}\r\nContent-Type: ${MIME}\r\n\r\n${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\nContent-Type: ${MIME}\r\n\r\n${JSON.stringify(doc)}\r\n` +
        `--${boundary}--`;

      const created = await call<{ id: string; headRevisionId: string }>(
        `${UPLOAD}/files?uploadType=multipart&fields=id,headRevisionId`,
        {
          method: "POST",
          headers: {
            "Content-Type": `multipart/related; boundary=${boundary}`,
          },
          body,
        },
      );
      await pinAndPrune(created.id, created.headRevisionId);
      return { fileId: created.id, headRevisionId: created.headRevisionId };
    },

    async update(fileId, doc, expectedHeadRevisionId) {
      // Drive has no compare-and-swap, so check the head before writing. The
      // window between check and write is small but real; the alternative is
      // silently overwriting a colleague's save.
      const remote = await headRevisionId(fileId);
      if (remote !== expectedHeadRevisionId) throw new ConflictError(remote);

      const written = await call<{ headRevisionId: string }>(
        `${UPLOAD}/files/${fileId}?uploadType=media&fields=headRevisionId`,
        {
          method: "PATCH",
          headers: { "Content-Type": MIME },
          body: JSON.stringify(doc),
        },
      );
      await pinAndPrune(fileId, written.headRevisionId);
      return { headRevisionId: written.headRevisionId };
    },

    async listRevisions(fileId) {
      const res = await call<{ revisions?: RawRevision[] }>(
        revisionsUrl(fileId),
      );
      // Only pinned revisions are downloadable for binary files, so only those
      // are offered as restore points.
      return (res.revisions ?? [])
        .filter((r) => r.keepForever)
        .map((r) => ({ id: r.id, modifiedTime: r.modifiedTime }))
        .sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime));
    },

    async readRevision(fileId, revisionId) {
      const content = await call<unknown>(
        `${revisionUrl(fileId, revisionId)}?alt=media`,
      );
      return validate(content);
    },
  };
}

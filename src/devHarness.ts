/**
 * Dev-only console harness for the storage layer.
 *
 * The unit tests stub `fetch` and Google's scripts, so they prove the client's
 * logic but say nothing about whether the real Drive API agrees with it. This
 * exercises the same code against the live API before any UI depends on it.
 *
 * Loaded only when `import.meta.env.DEV` — it never reaches a production build.
 * Delete it once the save controller and its UI land.
 */
import { emptyPlan } from "./core/schema";
import { addTeam, addStream, addItem } from "./core/mutations";
import type { PlanDocument } from "./core/types";
import { createAuth, defaultTokenClientFactory } from "./storage/googleAuth";
import { createDriveClient, type DriveClient } from "./storage/driveClient";
import { loadPickerApi, openPicker } from "./storage/picker";
import { saveDraft, loadDraft, clearDraft } from "./storage/localDraft";

const auth = createAuth({
  clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID,
  tokenClientFactory: defaultTokenClientFactory,
});

const drive: DriveClient = createDriveClient({
  fetch: window.fetch.bind(window),
  auth,
});

/** A small but structurally valid plan: one team, one stream, one dated item. */
function samplePlan(name: string): PlanDocument {
  const monday = Date.UTC(2026, 7, 24);
  let doc = addTeam("Platform")(emptyPlan(name));
  const teamId = doc.rows[0].id;
  doc = addStream(teamId, "Payments")(doc);
  const streamId = doc.rows[1].id;
  doc = addItem(streamId, "Card vault", monday, 5)(doc);
  return {
    ...doc,
    tasks: doc.tasks.map((t) => ({ ...t, progress: 40 })),
    savedAt: new Date().toISOString(),
  };
}

/** Round-trips a plan through Drive and reports each step. */
async function smoke(): Promise<void> {
  const step = (n: string, v: unknown) =>
    console.log(`%c${n}`, "font-weight:bold", v);

  await auth.requestToken();
  step("1. signed in", `token ${auth.getToken()?.slice(0, 12)}…`);

  step("2. folder", await drive.ensureFolder());

  const name = `Smoke test ${new Date().toISOString()}`;
  const created = await drive.create(name, samplePlan(name));
  step("3. created", created);

  const readBack = await drive.read(created.fileId);
  step("4. read back", readBack);

  const edited = { ...readBack.doc, name: `${readBack.doc.name} (edited)` };
  const updated = await drive.update(
    created.fileId,
    edited,
    readBack.headRevisionId,
  );
  step("5. updated", updated);

  try {
    await drive.update(created.fileId, edited, readBack.headRevisionId);
    console.error("6. FAIL — a stale head revision was accepted");
  } catch (e) {
    step("6. conflict detected as expected", (e as Error).name);
  }

  const revisions = await drive.listRevisions(created.fileId);
  step("7. pinned revisions", revisions);

  if (revisions.length > 1) {
    const oldest = revisions[revisions.length - 1];
    step(
      "8. read oldest revision",
      await drive.readRevision(created.fileId, oldest.id),
    );
  }

  step("9. listed plans", await drive.listPlans());
  console.log(
    `%cDone. Check My Drive → "Scrum Gantt" for "${name}".`,
    "color:green;font-weight:bold",
  );
}

async function pick() {
  await loadPickerApi();
  const token = auth.getToken() ?? (await auth.requestToken());
  return openPicker({ apiKey: import.meta.env.VITE_GOOGLE_API_KEY, token });
}

const harness = {
  auth,
  drive,
  smoke,
  pick,
  samplePlan,
  draft: { saveDraft, loadDraft, clearDraft },
};

declare global {
  interface Window {
    sg: typeof harness;
  }
}

window.sg = harness;
console.log(
  "%cStorage harness ready.%c Try sg.smoke() — or sg.auth, sg.drive, sg.pick(), sg.draft.",
  "color:#4a9;font-weight:bold",
  "color:inherit",
);

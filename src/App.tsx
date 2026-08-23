import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import "./ui/app.css";
import { createStore } from "./core/store";
import { emptyPlan } from "./core/schema";
import { GanttView, type GanttHandle } from "./chart/GanttView";
import { Toolbar } from "./ui/Toolbar";
import { StructurePanel } from "./ui/StructurePanel";
import { OpenDialog } from "./ui/OpenDialog";
import { HistoryDialog } from "./ui/HistoryDialog";
import { SaveAsDialog } from "./ui/SaveAsDialog";
import { UnlockDialog } from "./ui/UnlockDialog";
import { ConflictBanner } from "./ui/ConflictBanner";
import { useDraftAutosave } from "./ui/useDraftAutosave";
import { useDirty } from "./ui/useStore";
import { usePanelCollapsed } from "./ui/usePanelCollapsed";
import { createSaveController } from "./ui/saveController";
import { setLocked } from "./core/mutations";
import {
  createAuth,
  defaultTokenClientFactory,
  PopupBlockedError,
} from "./storage/googleAuth";
import {
  createDriveClient,
  type PlanFile,
  type RevisionInfo,
} from "./storage/driveClient";
import { loadPickerApi, openPicker } from "./storage/picker";
import { loadDraft } from "./storage/localDraft";

export default function App() {
  const store = useMemo(
    () => createStore(loadDraft()?.doc ?? emptyPlan("Untitled plan")),
    [],
  );
  const auth = useMemo(
    () =>
      createAuth({
        clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        tokenClientFactory: defaultTokenClientFactory,
      }),
    [],
  );
  const drive = useMemo(
    () => createDriveClient({ fetch: window.fetch.bind(window), auth }),
    [auth],
  );
  const controller = useMemo(
    () => createSaveController({ store, drive }),
    [store, drive],
  );

  const status = useSyncExternalStore(
    controller.subscribe,
    controller.getStatus,
  );
  const dirty = useDirty(store);
  useDraftAutosave(store, status.fileId);

  const [panelCollapsed, togglePanel] = usePanelCollapsed();
  const gantt = useRef<GanttHandle | null>(null);
  const [dialog, setDialog] = useState<
    "none" | "open" | "history" | "saveAs" | "unlock"
  >("none");
  const [plans, setPlans] = useState<PlanFile[]>([]);
  const [revisions, setRevisions] = useState<RevisionInfo[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [popupBlocked, setPopupBlocked] = useState(false);

  useEffect(() => {
    // Try to pick the session back up without a popup. A silent request needs
    // no user gesture, so doing it on mount means an ordinary reload does not
    // cost a consent click before the first save. Failure is expected and
    // silent: the click path still prompts.
    void auth.requestToken({ silent: true }).catch(() => {});
  }, [auth]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  /**
   * The popup must be opened from the click that asked for it, so this is
   * called synchronously from the handler and only awaits afterwards. A
   * blocked popup can only be reopened from a fresh gesture, so it gets its
   * own banner with a button rather than the generic error path.
   */
  async function ensureAuthThen(fn: () => Promise<void>) {
    try {
      if (!auth.getToken()) await auth.requestToken();
    } catch (e) {
      setPopupBlocked(e instanceof PopupBlockedError);
      if (!(e instanceof PopupBlockedError)) throw e;
      return;
    }
    setPopupBlocked(false);
    await fn();
  }

  async function openDialog() {
    await ensureAuthThen(async () => {
      setDialog("open");
      setListLoading(true);
      try {
        setPlans(await drive.listPlans());
      } finally {
        setListLoading(false);
      }
    });
  }

  async function historyDialog() {
    if (!status.fileId) return;
    await ensureAuthThen(async () => {
      setDialog("history");
      setListLoading(true);
      try {
        setRevisions(await drive.listRevisions(status.fileId!));
      } finally {
        setListLoading(false);
      }
    });
  }

  async function browseDrive() {
    await loadPickerApi();
    const picked = await openPicker({
      apiKey: import.meta.env.VITE_GOOGLE_API_KEY,
      token: auth.getToken()!,
    });
    if (picked) {
      await controller.openFile(picked.id);
      setDialog("none");
    }
  }

  // Held in a ref so the window listener is registered once rather than on
  // every render, while still calling the current closure.
  const onSaveShortcut = useRef<() => void>(undefined);
  useEffect(() => {
    onSaveShortcut.current = () => void ensureAuthThen(() => controller.save());
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        onSaveShortcut.current?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="app">
      <Toolbar
        store={store}
        saving={status.saving}
        onOpen={() => void openDialog()}
        onSave={() => void ensureAuthThen(() => controller.save())}
        onSaveAs={() => setDialog("saveAs")}
        onHistory={() => void historyDialog()}
        onFit={() => gantt.current?.fit()}
        onUnlock={() => setDialog("unlock")}
        onTogglePanel={togglePanel}
        panelCollapsed={panelCollapsed}
      />

      {status.conflict && (
        <ConflictBanner onChoose={(c) => void controller.resolveConflict(c)} />
      )}
      {popupBlocked && (
        <div className="banner banner-error" role="alert">
          <span>
            Your browser blocked the Google sign-in popup. Allow popups for this
            site, then:
          </span>
          <button onClick={() => void ensureAuthThen(async () => {})}>
            Sign in
          </button>
        </div>
      )}
      {status.error && (
        <div className="banner banner-error" role="alert">
          <span>{status.error} Your work is saved locally.</span>
          <button onClick={() => void ensureAuthThen(() => controller.save())}>
            Retry
          </button>
          <button onClick={controller.dismissError}>Dismiss</button>
        </div>
      )}

      <div className="workspace">
        {!panelCollapsed && <StructurePanel store={store} />}
        <main className="chart-area">
          <GanttView store={store} handleRef={gantt} />
        </main>
      </div>

      {dialog === "open" && (
        <OpenDialog
          plans={plans}
          loading={listLoading}
          onOpen={(id) => {
            void controller.openFile(id);
            setDialog("none");
          }}
          onBrowseDrive={() => void browseDrive()}
          onClose={() => setDialog("none")}
        />
      )}
      {dialog === "saveAs" && (
        <SaveAsDialog
          initialName={store.get().name}
          onConfirm={(name) => {
            setDialog("none");
            void ensureAuthThen(() => controller.saveAs(name));
          }}
          onClose={() => setDialog("none")}
        />
      )}
      {dialog === "unlock" && (
        <UnlockDialog
          planName={store.get().name}
          onUnlock={() => {
            // allowLocked: this is the one mutation the gate must let past.
            store.apply(setLocked(false), { allowLocked: true });
            setDialog("none");
          }}
          onClose={() => setDialog("none")}
        />
      )}
      {dialog === "history" && (
        <HistoryDialog
          revisions={revisions}
          loading={listLoading}
          onRestore={(id) => {
            void controller.restore(id);
            setDialog("none");
          }}
          onClose={() => setDialog("none")}
        />
      )}
    </div>
  );
}

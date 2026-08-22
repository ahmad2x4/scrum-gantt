import { useMemo } from "react";
import "./ui/app.css";
import { createStore } from "./core/store";
import { emptyPlan } from "./core/schema";
import { addTeam, addStream, addItem, setRowColor, updateTask } from "./core/mutations";
import { GanttView } from "./chart/GanttView";
import { Toolbar } from "./ui/Toolbar";
import { StructurePanel } from "./ui/StructurePanel";
import { usePanelCollapsed } from "./ui/usePanelCollapsed";

const DAY = 86_400_000;

/** Seed data until Drive load lands; replaced in a later task. */
function demoStore() {
  const today = Date.now();
  let doc = addTeam("Team Falcon")(emptyPlan("Demo plan"));
  const falcon = doc.rows[0].id;
  doc = setRowColor(falcon, "#297373")(doc);

  doc = addStream(falcon, "Payments Modernisation")(doc);
  const payments = doc.rows[1].id;
  doc = addItem(payments, "Card tokenisation", today - DAY * 4, 10)(doc);
  const tokenisation = doc.rows[2].id;
  doc = addItem(payments, "3DS2 rollout", today + DAY * 8, 8)(doc);
  const threeds = doc.rows[3].id;

  doc = addTeam("Team Otter")(doc);
  const otter = doc.rows[4].id;
  doc = setRowColor(otter, "#e9724c")(doc);
  doc = addStream(otter, "Payments Modernisation")(doc);
  const otterPayments = doc.rows[5].id;
  doc = addItem(otterPayments, "Ledger migration", today, 14)(doc);
  doc = addItem(otterPayments, "Release 1.0", today + DAY * 20, 0)(doc);

  doc = updateTask(tokenisation, { progress: 70, linkTo: [threeds] })(doc);
  doc = updateTask(threeds, { progress: 15 })(doc);
  return createStore(doc);
}

const notYet = () => window.alert("Google Drive is wired up in a later task.");

export default function App() {
  const store = useMemo(() => demoStore(), []);
  const [panelCollapsed, togglePanel] = usePanelCollapsed();

  return (
    <div className="app">
      <Toolbar
        store={store}
        saving={false}
        onOpen={notYet}
        onSave={notYet}
        onSaveAs={notYet}
        onHistory={notYet}
        onTogglePanel={togglePanel}
        panelCollapsed={panelCollapsed}
      />
      <div className="workspace">
        {!panelCollapsed && <StructurePanel store={store} />}
        <main className="chart-area">
          <GanttView store={store} />
        </main>
      </div>
    </div>
  );
}

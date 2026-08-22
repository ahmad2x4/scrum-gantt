import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

// Dev-only storage console harness; tree-shaken out of production builds.
if (import.meta.env.DEV) void import("./devHarness");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Testing Library only auto-registers cleanup when Vitest globals are enabled.
// Without this, rendered DOM accumulates across tests and queries match
// elements left behind by earlier ones.
afterEach(cleanup);

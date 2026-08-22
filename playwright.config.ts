import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://localhost:5173/scrum-gantt/" },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173/scrum-gantt/",
    reuseExistingServer: !process.env.CI,
  },
});

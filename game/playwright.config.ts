// The page's replay tests (AGT-142): WebKit in CI, the nearest thing on Linux to the app's
// WKWebView (decision 0090). `PAGE_BROWSER=chromium PAGE_CHROMIUM=<path>` runs them on a local
// Chromium where WebKit is not installed.
import { defineConfig, devices } from "@playwright/test";

const chromium = process.env.PAGE_BROWSER === "chromium";

export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  fullyParallel: true,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  use: { baseURL: "http://127.0.0.1:4173", trace: "off" },
  webServer: { command: "node --experimental-strip-types --no-warnings e2e/serve.ts", url: "http://127.0.0.1:4173/index.html", reuseExistingServer: !process.env.CI },
  projects: [
    chromium
      ? { name: "chromium", use: { ...devices["Desktop Chrome"], launchOptions: { executablePath: process.env.PAGE_CHROMIUM, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] } } }
      : { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});

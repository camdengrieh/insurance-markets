// `playwright test` from app/ finds the configuration here; the suites live in e2e/ (pnpm --dir app run e2e uses
// e2e/playwright.config.ts directly).
export { default } from "./e2e/playwright.config";

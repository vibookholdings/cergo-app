import { test as setup } from "@playwright/test";
import { authFile, login, OWNER, RECEPTION, STAFF, type Who } from "./helpers";

const users: [Who, string, RegExp][] = [
  ["owner", OWNER, /\/h\//],
  ["reception", RECEPTION, /\/h\//],
  ["staff", STAFF, /\/admin/],
];

for (const [who, email, landing] of users) {
  setup(`entrar como ${who}`, async ({ page }) => {
    await login(page, email, landing);
    await page.context().storageState({ path: authFile(who) });
  });
}

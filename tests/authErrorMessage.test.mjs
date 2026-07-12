import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");

test("login shows invalid credentials only for an authentication rejection", () => {
  const start = appSource.indexOf("function AuthScreen");
  const end = appSource.indexOf("function AccountSetupModal", start);
  const authBlock = appSource.slice(start, end);

  assert.match(authBlock, /const loginResult = await callAPI\('auth-login'/);
  assert.match(authBlock, /loginResult\.status === 401/);
  assert.match(authBlock, /Invalid credentials\./);
  assert.match(authBlock, /Sign in is temporarily unavailable\. Please try again\./);
});

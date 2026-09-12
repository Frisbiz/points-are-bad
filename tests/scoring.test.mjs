import test from "node:test";
import assert from "node:assert/strict";

import { calcPts } from "../shared/scoring.js";

test("malformed scorelines do not poison aggregate standings", () => {
  assert.equal(calcPts("1", "0-0"), null);
  assert.equal(calcPts("one-nil", "0-0"), null);
  assert.equal(calcPts("1-0", "0"), null);
});

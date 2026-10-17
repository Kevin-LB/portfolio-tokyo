import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SECURITY_HEADERS } from "./security-headers.mjs";

describe("en-têtes de sécurité", () => {
  it("la CSP n'autorise ni script en ligne ni domaine tiers", () => {
    const csp = SECURITY_HEADERS["Content-Security-Policy"];
    assert.ok(!/script-src[^;]*unsafe-inline/.test(csp));
    assert.ok(!/https?:\/\//.test(csp));
    assert.ok(csp.includes("frame-ancestors 'none'"));
  });
});

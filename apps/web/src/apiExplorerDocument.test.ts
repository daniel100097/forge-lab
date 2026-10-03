import { describe, expect, it } from "vitest";
import { apiExplorerStyles } from "./apiExplorerDocument";

describe("native API explorer document", () => {
  it("styles both explicit themes without breaking fixed-position authorizations", () => {
    expect(apiExplorerStyles).toContain('html[data-theme="dark"]');
    expect(apiExplorerStyles).toContain('html[data-theme="light"]');
    expect(apiExplorerStyles).toContain(".swagger-ui{filter:none}");
    expect(apiExplorerStyles).toContain(":not(.scheme-container)");
    expect(apiExplorerStyles).toContain("max-height:calc(100vh - 32px)");
    expect(apiExplorerStyles).toContain("max-width:calc(100vw - 32px)");
  });
});

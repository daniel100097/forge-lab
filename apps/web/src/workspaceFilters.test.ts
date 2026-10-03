import { describe, expect, it } from "vitest";
import { repositorySorts } from "./WorkspaceRepoFilters";

describe("workspace repository sorts", () => {
  it("maps native ascending and descending sorts to the search API", () => {
    expect(repositorySorts.alphabetically).toEqual(["alpha", "asc"]);
    expect(repositorySorts.reversealphabetically).toEqual(["alpha", "desc"]);
    expect(repositorySorts.newest).toEqual(["created", "desc"]);
    expect(repositorySorts.oldest).toEqual(["created", "asc"]);
    expect(repositorySorts.moststars).toEqual(["stars", "desc"]);
    expect(repositorySorts.feweststars).toEqual(["stars", "asc"]);
  });
  it("retains native size and update direction", () => {
    expect(repositorySorts.size).toEqual(["size", "asc"]);
    expect(repositorySorts.reversesize).toEqual(["size", "desc"]);
    expect(repositorySorts.recentupdate).toEqual(["updated", "desc"]);
    expect(repositorySorts.leastupdate).toEqual(["updated", "asc"]);
  });
});

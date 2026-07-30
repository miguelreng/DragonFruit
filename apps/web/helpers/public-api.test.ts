import { getPublicApiBaseUrl } from "@plane/constants";
import { describe, expect, it } from "vitest";

describe("public API URL", () => {
  it("uses the public gateway on the branded public domain", () => {
    expect(
      getPublicApiBaseUrl({
        hostname: "dragonfruit.page",
        origin: "https://dragonfruit.page",
      })
    ).toBe("https://dragonfruit.page");
  });

  it("uses the public gateway on the www hostname", () => {
    expect(
      getPublicApiBaseUrl({
        hostname: "www.dragonfruit.page",
        origin: "https://www.dragonfruit.page",
      })
    ).toBe("https://www.dragonfruit.page");
  });
});

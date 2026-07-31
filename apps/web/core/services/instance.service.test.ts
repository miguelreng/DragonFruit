import { getPublicApiBaseUrl } from "@plane/constants";
import { describe, expect, it, vi } from "vitest";
import { InstanceService } from "./instance.service";

vi.mock("@plane/constants", () => ({
  getPublicApiBaseUrl: vi.fn(() => "https://dragonfruit.page"),
}));

describe("InstanceService", () => {
  it("uses the same-origin public API base on the public content domain", () => {
    const service = new InstanceService();

    expect(getPublicApiBaseUrl).toHaveBeenCalledOnce();
    expect((service as unknown as { baseURL: string }).baseURL).toBe("https://dragonfruit.page");
  });
});

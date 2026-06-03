import { describe, it, expect } from "vitest";
import { assertSafeOutboundUrl, isSafeOutboundUrl } from "@/lib/net/ssrf-guard";

describe("ssrf guard", () => {
  it("allows public http(s) URLs", () => {
    expect(isSafeOutboundUrl("https://api.example.com/data")).toBe(true);
    expect(isSafeOutboundUrl("http://data.acme.io/rows.json")).toBe(true);
  });

  it("blocks cloud-metadata, loopback, and private ranges", () => {
    for (const u of [
      "http://169.254.169.254/latest/meta-data/",
      "http://metadata.google.internal/computeMetadata/v1/",
      "http://localhost:8080/",
      "https://127.0.0.1/",
      "http://10.0.0.5/",
      "http://192.168.1.1/",
      "http://172.16.0.1/",
      "http://100.64.0.1/",
      "http://[::1]/",
    ]) {
      expect(isSafeOutboundUrl(u), u).toBe(false);
    }
  });

  it("blocks non-http(s) schemes and malformed input", () => {
    expect(isSafeOutboundUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeOutboundUrl("gopher://x/")).toBe(false);
    expect(isSafeOutboundUrl("ftp://10.0.0.1/")).toBe(false);
    expect(isSafeOutboundUrl("not a url")).toBe(false);
  });

  it("throws a clear error from the assert form", () => {
    expect(() => assertSafeOutboundUrl("http://169.254.169.254/")).toThrow(/not allowed/);
  });
});

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

  it("blocks loopback/metadata in legacy IP encodings (decimal, hex, octal, short)", () => {
    for (const u of [
      "http://2130706433/", // 127.0.0.1 decimal
      "http://0x7f000001/", // 127.0.0.1 hex
      "http://0177.0.0.1/", // 127.0.0.1 octal first octet
      "http://127.1/", // short form → 127.0.0.1
      "http://2852039166/", // 169.254.169.254 decimal (metadata)
      "http://[::ffff:127.0.0.1]/", // IPv4-mapped IPv6 loopback
    ]) {
      expect(isSafeOutboundUrl(u), u).toBe(false);
    }
  });

  it("still allows a genuine public IP", () => {
    expect(isSafeOutboundUrl("https://93.184.216.34/")).toBe(true); // example.com
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

import { describe, it, expect } from "vitest";
import { listInvoices } from "@/lib/billing/invoices";

describe("listInvoices", () => {
  it("returns [] when billing isn't configured (no Stripe call)", async () => {
    // No STRIPE_SECRET_KEY in the test env → billingConfigured() is false.
    expect(await listInvoices()).toEqual([]);
  });
});

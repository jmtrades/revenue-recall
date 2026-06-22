import { getSessionUser } from "@/lib/auth";

/**
 * The operator(s) who run this deployment — the owner(s) of the product, as
 * opposed to its customers. Two consequences flow from this: only an operator can
 * load demo sample data (it must never reach a real customer workspace), and an
 * operator is always fully entitled to the product, calling included — you
 * shouldn't be locked out of your own product by your own billing enforcement.
 *
 * Configured via SAMPLE_DATA_EMAILS (comma list) → OPERATOR_EMAIL (comma list) →
 * the built-in owner list below. Kept here as the single source of truth so the
 * sample-data gate and the entitlement/voice bypasses can't drift apart. An env
 * override REPLACES the built-in list, so include every owner email when setting one.
 */
// Both spellings of the second owner's address are included on purpose: the live
// account that actually signs in is "elixiiaperfumes@gmail.com" (el-i-xii…); the
// shorter "elxiiaperfumes@gmail.com" is kept as a harmless alias so a grant to
// either spelling resolves. Extra entries that no one signs in as are inert.
const DEFAULT_OPERATOR_EMAILS = ["jmtrades1990@gmail.com", "elixiiaperfumes@gmail.com", "elxiiaperfumes@gmail.com"];

export function operatorEmails(): string[] {
  const raw = process.env.SAMPLE_DATA_EMAILS || process.env.OPERATOR_EMAIL;
  const list = raw ? raw.split(",") : DEFAULT_OPERATOR_EMAILS;
  return list.map((e) => e.trim().toLowerCase()).filter(Boolean);
}

/** True when the signed-in user is an operator/owner of this deployment. */
export async function isOperator(): Promise<boolean> {
  const user = await getSessionUser().catch(() => null);
  const email = user?.email?.toLowerCase();
  return !!email && operatorEmails().includes(email);
}

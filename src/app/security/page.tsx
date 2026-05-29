import { LegalPage } from "@/components/marketing/LegalPage";

export const metadata = {
  title: "Security — Revenue Recall",
  description: "How Revenue Recall protects your data.",
};

export default function SecurityPage() {
  return (
    <LegalPage
      title="Security"
      updated="May 2026"
      intro="Security is foundational to a system that touches your entire pipeline. Here's how we protect your data."
      sections={[
        {
          heading: "Encryption",
          body: [
            "Data is encrypted in transit with TLS and at rest with AES-256. Security headers and a strict transport policy are enforced on every response.",
          ],
        },
        {
          heading: "Tenant isolation",
          body: [
            "Every organization's data is isolated. The database enforces row-level security scoped to each org, and the application independently scopes every query — defense in depth so one tenant can never read another's data.",
          ],
        },
        {
          heading: "Authentication and access",
          body: [
            "Sign-in is handled by a managed auth provider with email/password and Google OAuth. Sessions are refreshed securely and app routes are gated by middleware. Higher tiers add SSO and role-based access control.",
          ],
        },
        {
          heading: "Secrets and integrations",
          body: [
            "API keys for CRM, email/SMS, and AI providers are stored as server-side secrets, never exposed to the browser. Outbound integrations use scoped credentials you control and can revoke at any time.",
          ],
        },
        {
          heading: "Infrastructure",
          body: [
            "We run on reputable cloud infrastructure with automated backups and monitoring. Access to production is limited to authorized personnel and logged.",
          ],
        },
        {
          heading: "Reporting a vulnerability",
          body: [
            "Found an issue? We appreciate responsible disclosure. Email security@revenuerecall.com with details and we'll respond promptly.",
          ],
        },
      ]}
    />
  );
}

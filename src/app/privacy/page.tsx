import { LegalPage } from "@/components/marketing/LegalPage";

export const metadata = {
  title: "Privacy Policy — Revenue Recall",
  description: "How Revenue Recall collects, uses, and protects your data.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="June 2026"
      intro="This policy explains what information Revenue Recall collects, how we use it, and the choices you have. We collect the minimum needed to run the product and never sell your data."
      sections={[
        {
          heading: "Information we collect",
          body: [
            "Account data you provide — your name, work email, and organization — when you sign up.",
            "CRM and sales data you connect or import, such as contacts, deals, activities, and pipeline configuration. This is yours; we process it only to provide the service.",
            "Usage and device data (pages viewed, features used, IP address, browser) collected automatically to keep the product secure and improve it.",
          ],
        },
        {
          heading: "How we use information",
          body: [
            "To operate the product: surfacing at-risk revenue, drafting outreach, and syncing with your CRM.",
            "To secure accounts, prevent abuse, and provide support.",
            "To improve features. We do not use your customer or CRM data to train third-party models.",
          ],
        },
        {
          heading: "AI processing",
          body: [
            "When AI drafting is enabled, relevant deal context is sent to our AI provider solely to generate that draft. Content is not retained by the provider to train their models, and you can run the product on high-quality templates with AI disabled.",
          ],
        },
        {
          heading: "Sharing",
          body: [
            "We share data only with sub-processors that help us run the service (hosting, database, email/SMS delivery, AI drafting), each under contract. We do not sell personal information.",
          ],
        },
        {
          heading: "Sub-processors",
          body: [
            "We use a small set of vetted providers to operate the service, each under a data-processing agreement. The current list:",
            "Supabase — managed Postgres database and authentication; stores your account, CRM, and usage data.",
            "Vercel — application hosting and delivery; processes requests in transit.",
            "Anthropic — AI drafting; receives only the deal context needed to generate a draft, which is not retained to train its models.",
            "Resend or SendGrid — outbound and transactional email delivery; processes recipient addresses and message content.",
            "Stripe — subscription billing and payments; we never see or store full card numbers.",
            "Twilio — SMS and voice calling, only when you enable them; processes phone numbers and message/call content.",
            "Meta (WhatsApp, Messenger, Instagram), Telegram, X, and LinkedIn — social messaging, only for the channels you choose to connect.",
            "We keep this list current as providers change; email us to request notice of changes.",
          ],
        },
        {
          heading: "Data retention and deletion",
          body: [
            "We retain your data while your account is active. You can export everything, or permanently delete your account yourself, anytime from Settings → Billing → Your data — deletion is immediate and irreversible, except where law requires retention.",
          ],
        },
        {
          heading: "Your rights",
          body: [
            "Depending on where you live (including under GDPR and CCPA), you may have rights to access, correct, export, or delete your personal data. Access and erasure are self-serve in the app (Settings → Billing → Your data); for anything else, email us and we'll action it.",
            "We do not sell personal information, and we do not discriminate against you for exercising these rights.",
          ],
        },
      ]}
    />
  );
}

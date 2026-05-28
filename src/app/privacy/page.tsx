import { LegalPage } from "@/components/marketing/LegalPage";

export const metadata = {
  title: "Privacy Policy — Revenue Recall",
  description: "How Revenue Recall collects, uses, and protects your data.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="May 2026"
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
          heading: "Data retention and deletion",
          body: [
            "We retain your data while your account is active. You can export or request deletion at any time; we remove it within 30 days of a verified request, except where law requires retention.",
          ],
        },
        {
          heading: "Your rights",
          body: [
            "Depending on where you live, you may have rights to access, correct, export, or delete your personal data. Contact us to exercise them.",
          ],
        },
      ]}
    />
  );
}

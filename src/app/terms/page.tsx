import { LegalPage } from "@/components/marketing/LegalPage";

export const metadata = {
  title: "Terms of Service — Revenue Recall",
  description: "The terms that govern your use of Revenue Recall.",
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="May 2026"
      intro="These terms govern your access to and use of Revenue Recall. By using the product you agree to them."
      sections={[
        {
          heading: "Your account",
          body: [
            "You're responsible for the activity under your account and for keeping your credentials secure. You must provide accurate information and be authorized to act for your organization.",
          ],
        },
        {
          heading: "Acceptable use",
          body: [
            "Use Revenue Recall lawfully. Don't send messages you're not permitted to send, scrape or resell the service, attempt to breach security, or use it to harass or deceive recipients.",
            "You're responsible for complying with the laws that apply to your outreach, including consent and anti-spam rules (such as CAN-SPAM, TCPA, and GDPR) for the email, SMS, and calls you send through the product.",
          ],
        },
        {
          heading: "Your data",
          body: [
            "You retain all rights to the data you bring to or create in the product. You grant us the limited license needed to host and process it to provide the service.",
          ],
        },
        {
          heading: "Plans and billing",
          body: [
            "Paid plans are billed in advance on the cadence shown at checkout. Fees are non-refundable except where required by law. We'll give notice before any price change.",
          ],
        },
        {
          heading: "Availability and changes",
          body: [
            "We work to keep the service available but don't guarantee uninterrupted access. We may update features over time; we won't materially reduce core functionality of a paid plan without notice.",
          ],
        },
        {
          heading: "Disclaimers and liability",
          body: [
            "The service is provided \"as is.\" To the extent permitted by law, we disclaim implied warranties and our liability is limited to the amount you paid in the 12 months before the claim.",
          ],
        },
        {
          heading: "Termination",
          body: [
            "You may cancel anytime. We may suspend or terminate accounts that violate these terms. On termination you can export your data for a reasonable period.",
          ],
        },
      ]}
    />
  );
}

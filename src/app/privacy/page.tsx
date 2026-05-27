import { LegalLayout } from "@/components/marketing/LegalLayout";

export const metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" updated="May 27, 2026">
      <p>
        This Privacy Policy explains how Revenue Recall (&quot;we&quot;) collects, uses, and protects personal
        information when you use the Service.
      </p>

      <h2>1. Information we collect</h2>
      <p>
        <strong>Account data</strong> you provide (name, email, organization). <strong>Customer data</strong> you
        import or create (contacts, deals, messages). <strong>Usage data</strong> (logs, device/browser info,
        analytics). <strong>Payment data</strong> is processed by our payment provider; we do not store full card
        numbers.
      </p>

      <h2>2. How we use it</h2>
      <p>
        To provide and improve the Service, generate AI drafts and insights, process payments, communicate with you,
        ensure security, and comply with legal obligations. We do not sell your personal information.
      </p>

      <h2>3. AI processing</h2>
      <p>
        To generate drafts, briefs, and summaries, relevant deal context is sent to our AI provider (Anthropic) for
        processing. We do not use your customer data to train third-party foundation models.
      </p>

      <h2>4. Sharing</h2>
      <p>
        We share data with sub-processors that help run the Service (e.g., hosting, database, email/SMS, payments,
        AI, analytics), under contracts that require appropriate protection. We may disclose information if required
        by law or to protect rights and safety.
      </p>

      <h2>5. Retention &amp; security</h2>
      <p>
        We retain data for as long as your account is active or as needed to provide the Service and meet legal
        obligations. We use industry-standard safeguards (encryption in transit and at rest), though no method is
        100% secure.
      </p>

      <h2>6. Your rights</h2>
      <p>
        Depending on your location (e.g., GDPR, CCPA), you may have rights to access, correct, delete, or export your
        personal data, and to object to certain processing. To exercise these, contact us. You may unsubscribe from
        marketing emails at any time.
      </p>

      <h2>7. International transfers</h2>
      <p>
        Your information may be processed in countries other than your own. Where required, we use appropriate
        safeguards for such transfers.
      </p>

      <h2>8. Changes &amp; contact</h2>
      <p>
        We may update this policy; material changes will be communicated. Questions or requests? Contact us at
        privacy@revenue-recall.app.
      </p>
    </LegalLayout>
  );
}

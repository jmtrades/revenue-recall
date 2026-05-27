import { LegalLayout } from "@/components/marketing/LegalLayout";

export const metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <LegalLayout title="Terms of Service" updated="May 27, 2026">
      <p>
        These Terms of Service (&quot;Terms&quot;) govern your access to and use of Revenue Recall (the
        &quot;Service&quot;). By creating an account or using the Service, you agree to these Terms. If you are
        using the Service on behalf of an organization, you agree on its behalf.
      </p>

      <h2>1. Accounts</h2>
      <p>
        You are responsible for safeguarding your login credentials and for all activity under your account.
        Notify us promptly of any unauthorized use. You must provide accurate information and be at least 18.
      </p>

      <h2>2. Subscriptions &amp; billing</h2>
      <p>
        Paid plans are billed per seat, monthly or annually, in advance and are non-refundable except where
        required by law. AI usage beyond your plan&apos;s included actions, and telephony (calls/SMS), are billed
        as usage. Fees may change with notice; continued use after a change constitutes acceptance. You can cancel
        at any time, effective at the end of the current billing period.
      </p>

      <h2>3. Acceptable use</h2>
      <p>
        You agree not to misuse the Service, including: sending unlawful, deceptive, or unsolicited messages in
        violation of anti-spam laws (e.g., CAN-SPAM, TCPA, GDPR); infringing others&apos; rights; attempting to
        breach security or rate limits; or using the Service to build a competing product. You are responsible for
        obtaining any consents required to contact your leads.
      </p>

      <h2>4. Your data</h2>
      <p>
        You retain ownership of the data you submit. You grant us a limited license to process it solely to provide
        the Service. Our handling of personal data is described in our{" "}
        <a href="/privacy">Privacy Policy</a>.
      </p>

      <h2>5. AI-generated content</h2>
      <p>
        The Service uses AI to draft messages and summaries. You are responsible for reviewing AI output before
        sending. We do not guarantee the accuracy of generated content.
      </p>

      <h2>6. Third-party services</h2>
      <p>
        The Service integrates with third parties (e.g., CRMs, email/SMS providers, payment processors). Your use of
        those services is governed by their terms, and we are not responsible for them.
      </p>

      <h2>7. Disclaimers &amp; liability</h2>
      <p>
        The Service is provided &quot;as is&quot; without warranties of any kind. To the maximum extent permitted by
        law, our aggregate liability is limited to the amounts you paid in the 12 months preceding the claim, and we
        are not liable for indirect or consequential damages.
      </p>

      <h2>8. Termination</h2>
      <p>
        We may suspend or terminate access for violation of these Terms. You may stop using the Service at any time.
        Provisions that by their nature should survive termination will survive.
      </p>

      <h2>9. Changes &amp; contact</h2>
      <p>
        We may update these Terms; material changes will be communicated. Questions? Contact us at
        legal@revenue-recall.app.
      </p>
    </LegalLayout>
  );
}

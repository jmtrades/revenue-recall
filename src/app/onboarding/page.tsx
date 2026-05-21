import { INDUSTRIES } from "@/lib/industries";
import { OnboardingWizard } from "@/components/OnboardingWizard";

export const metadata = { title: "Get started — Revenue Recall" };

export default function OnboardingPage() {
  const industries = INDUSTRIES.map((i) => ({ id: i.id, label: i.label, blurb: i.blurb }));
  return <OnboardingWizard industries={industries} />;
}

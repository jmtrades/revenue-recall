import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader, Card } from "@/components/ui";
import { teamReport } from "@/lib/agent/team";
import { getSessionRole } from "@/lib/authz";
import { isAuthRequired } from "@/lib/config";
import { isAiConfigured } from "@/lib/ai/client";

export const metadata = { title: "Sales team — Revenue Recall" };
export const dynamic = "force-dynamic";

const LABEL: Record<string, string> = {
  sdr: "Speed-to-lead SDR",
  setter: "Setter",
  closer: "Closer assist",
  recovery: "Drop-off recovery",
  reactivation: "Reactivation",
};

export default async function TeamPage() {
  const role = await getSessionRole();
  if (isAuthRequired() && role !== "owner" && role !== "admin") redirect("/dashboard");
  const rows = teamReport();
  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Sales team"
        subtitle="Five roles share one timeline per lead. With an Anthropic key they write the line. Without it they use the tested templates. AI pauses when a lead says STOP or you set aiPaused on the contact."
      />
      <p className="mb-4 text-sm text-muted">Writer: {isAiConfigured() ? "Anthropic" : "Templates"}.</p>
      <Card title="Per agent">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-muted">
            <tr>
              <th className="py-2 font-medium">Role</th>
              <th className="py-2 font-medium">Replies</th>
              <th className="py-2 font-medium">Booked</th>
              <th className="py-2 font-medium">Recovered</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.role} className="border-t border-border">
                <td className="py-2 text-fg">{LABEL[row.role]}</td>
                <td className="py-2 tabular-nums">{row.replies}</td>
                <td className="py-2 tabular-nums">{row.booked}</td>
                <td className="py-2 tabular-nums">{row.recovered}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="mt-4 text-sm text-muted">Reply rate and booked rate are these counts over the replies that role sent. Recovered revenue stays on the Results page, where the money is recorded.</p>
      <p className="mt-4 text-sm"><Link href="/admin" className="text-brand hover:underline">Back to admin</Link></p>
    </div>
  );
}

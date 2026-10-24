import { createAdminClient } from "@/lib/supabase/admin";
import { createMailTransport, MAIL_FROM } from "@/lib/mailer";
import { RESPONSIBLE_PARTY_LABELS, type ResponsibleParty } from "@/lib/status";

// Emails the property's designated alert recipients that a case reached
// ai_review_completed. Called from the status action today; the triage
// pipeline calls this same helper when its verdict lands (item 13).
// Failures are logged, never thrown — an SMTP hiccup must not fail the
// status change that triggered it.
export async function sendMaintenanceAlert(caseId: string): Promise<void> {
  try {
    const admin = createAdminClient();

    const { data: kase } = await admin
      .from("cases")
      .select("id, description, responsible_party, property_id")
      .eq("id", caseId)
      .maybeSingle();
    if (!kase) return;

    const { data: property } = await admin
      .from("properties")
      .select("address_line1, address_line2, city, state")
      .eq("id", kase.property_id)
      .maybeSingle();
    if (!property) return;

    const { data: recipients } = await admin
      .from("property_alert_recipients")
      .select("user_id")
      .eq("property_id", kase.property_id);
    if (!recipients || recipients.length === 0) return;

    const emails: string[] = [];
    for (const { user_id } of recipients) {
      const { data } = await admin.auth.admin.getUserById(user_id);
      if (data?.user?.email) emails.push(data.user.email);
    }
    if (emails.length === 0) return;

    const address = [
      property.address_line1,
      property.address_line2,
      `${property.city}, ${property.state}`,
    ]
      .filter(Boolean)
      .join(", ");
    const verdict = kase.responsible_party
      ? RESPONSIBLE_PARTY_LABELS[kase.responsible_party as ResponsibleParty]
      : "No responsible party recorded";

    await createMailTransport().sendMail({
      from: MAIL_FROM,
      to: emails.join(", "),
      subject: `AI review completed — maintenance request at ${address}`,
      text:
        `The AI review for a maintenance request has completed.\n\n` +
        `Property: ${address}\n` +
        `Issue: ${kase.description}\n` +
        `Verdict: ${verdict}\n\n` +
        `This is an automated, informational assessment and not legal advice. ` +
        `Sign in to the PMS dashboard to review the case.`,
    });
  } catch (error) {
    // Baseline logging until the error-reporting decision (item 12).
    console.error("[alerts] failed to send maintenance alert:", error);
  }
}

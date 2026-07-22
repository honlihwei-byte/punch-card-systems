/**
 * Resend email delivery for daily reports.
 */

export async function sendResendEmail(opts: {
  to: string[];
  subject: string;
  html: string;
  text?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.REPORT_FROM_EMAIL?.trim();

  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY not configured" };
  }
  if (!from) {
    return { ok: false, error: "REPORT_FROM_EMAIL not configured" };
  }
  if (opts.to.length === 0) {
    return { ok: false, error: "No recipients" };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, error: body || `Resend HTTP ${res.status}` };
  }

  return { ok: true };
}

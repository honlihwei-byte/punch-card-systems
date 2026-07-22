import { sendResendEmail } from "@/lib/resend-email";
import {
  renderDailyReportHtml,
  renderDailyReportSubject,
  renderDailyReportText,
} from "./render-daily-report-email";
import type { DailyReportPayload } from "./types";
import type { Locale } from "@/lib/i18n/types";

export async function sendDailyReportEmail(params: {
  locale: Locale;
  payload: DailyReportPayload;
  recipients: string[];
}): Promise<{ ok: boolean; error?: string }> {
  const { locale, payload, recipients } = params;
  const subject = renderDailyReportSubject(locale, payload.date);
  const html = renderDailyReportHtml(locale, payload);
  const text = renderDailyReportText(locale, payload);

  return sendResendEmail({
    to: recipients,
    subject,
    html,
    text,
  });
}

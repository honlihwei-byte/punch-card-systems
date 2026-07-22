import { shopIdsForCompany } from "@/lib/company-db";
import { malaysiaDateYmd } from "@/lib/malaysia-time";
import type { createAdminClient } from "@/lib/supabase/admin";
import { buildDailyReport } from "./build-daily-report";
import {
  hasSuccessfulDailyReportLog,
  insertDailyReportLog,
  listEnabledDailyReportSettings,
} from "./daily-report-db";
import { sendDailyReportEmail } from "./send-daily-report";

type Supabase = ReturnType<typeof createAdminClient>;

/** Parse HH:mm:ss or HH:mm send_time and check if now (MYT) is within window. */
export function isSendTimeDue(
  sendTime: string,
  now: Date,
  windowMinutes = 15,
): boolean {
  const parts = sendTime.split(":");
  const sh = parseInt(parts[0] ?? "0", 10);
  const sm = parseInt(parts[1] ?? "0", 10);
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kuala_Lumpur",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const map: Record<string, string> = {};
  for (const p of formatter.formatToParts(now)) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  const currentMinutes = parseInt(map.hour ?? "0", 10) * 60 + parseInt(map.minute ?? "0", 10);
  const sendMinutes = sh * 60 + sm;
  return currentMinutes >= sendMinutes && currentMinutes < sendMinutes + windowMinutes;
}

export async function runDailyReportsCron(
  supabase: Supabase,
  now = new Date(),
): Promise<{
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
  errors: string[];
}> {
  const settings = await listEnabledDailyReportSettings(supabase);
  const reportDate = malaysiaDateYmd(now);
  let processed = 0;
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const row of settings) {
    if (!isSendTimeDue(row.send_time, now)) continue;
    if (row.recipient_emails.length === 0) {
      skipped += 1;
      continue;
    }

    processed += 1;

    const alreadySent = await hasSuccessfulDailyReportLog(supabase, row.company_id, reportDate);
    if (alreadySent) {
      skipped += 1;
      continue;
    }

    try {
      const companyShopIds = await shopIdsForCompany(supabase, row.company_id);
      const payload = await buildDailyReport({
        supabase,
        companyId: row.company_id,
        companyShopIds,
        reportDate,
        settings: row,
      });

      const result = await sendDailyReportEmail({
        locale: row.report_locale,
        payload,
        recipients: row.recipient_emails,
      });

      if (!result.ok) {
        failed += 1;
        errors.push(`${row.company_id}: ${result.error ?? "send failed"}`);
        await insertDailyReportLog(supabase, {
          company_id: row.company_id,
          report_date: reportDate,
          recipient_emails: row.recipient_emails,
          status: "failed",
          error_message: result.error ?? "send failed",
        });
        continue;
      }

      await insertDailyReportLog(supabase, {
        company_id: row.company_id,
        report_date: reportDate,
        recipient_emails: row.recipient_emails,
        status: "success",
      });
      sent += 1;
    } catch (e) {
      failed += 1;
      const msg = e instanceof Error ? e.message : "Server error";
      errors.push(`${row.company_id}: ${msg}`);
      try {
        await insertDailyReportLog(supabase, {
          company_id: row.company_id,
          report_date: reportDate,
          recipient_emails: row.recipient_emails,
          status: "failed",
          error_message: msg,
        });
      } catch {
        /* ignore log failure */
      }
    }
  }

  return { processed, sent, skipped, failed, errors };
}

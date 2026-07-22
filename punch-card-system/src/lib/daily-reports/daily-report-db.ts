import type { Locale } from "@/lib/i18n/types";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { DailyReportLogRow, DailyReportSettingsRow } from "./types";

type Supabase = ReturnType<typeof createAdminClient>;

const SETTINGS_SELECT =
  "id, company_id, enabled, recipient_emails, send_time, shop_ids, include_attendance, include_cleaning, report_locale, created_at, updated_at";

function rowFromDb(row: Record<string, unknown>): DailyReportSettingsRow {
  return {
    id: String(row.id),
    company_id: String(row.company_id),
    enabled: row.enabled === true,
    recipient_emails: Array.isArray(row.recipient_emails)
      ? row.recipient_emails.map(String)
      : [],
    send_time: String(row.send_time ?? "21:15:00"),
    shop_ids: Array.isArray(row.shop_ids) ? row.shop_ids.map(String) : [],
    include_attendance: row.include_attendance !== false,
    include_cleaning: row.include_cleaning !== false,
    report_locale: (row.report_locale === "zh" || row.report_locale === "ms"
      ? row.report_locale
      : "en") as Locale,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function normalizeRecipientEmails(emails: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of emails) {
    const e = raw.trim().toLowerCase();
    if (!e || !isValidEmail(e) || seen.has(e)) continue;
    seen.add(e);
    out.push(e);
  }
  return out;
}

export async function getDailyReportSettings(
  supabase: Supabase,
  companyId: string,
): Promise<DailyReportSettingsRow | null> {
  const { data, error } = await supabase
    .from("daily_report_settings")
    .select(SETTINGS_SELECT)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return rowFromDb(data as Record<string, unknown>);
}

export async function upsertDailyReportSettings(
  supabase: Supabase,
  companyId: string,
  input: {
    enabled: boolean;
    recipient_emails: string[];
    send_time: string;
    shop_ids: string[];
    include_attendance: boolean;
    include_cleaning: boolean;
    report_locale: Locale;
  },
): Promise<DailyReportSettingsRow> {
  const payload = {
    company_id: companyId,
    enabled: input.enabled,
    recipient_emails: input.recipient_emails,
    send_time: input.send_time,
    shop_ids: input.shop_ids,
    include_attendance: input.include_attendance,
    include_cleaning: input.include_cleaning,
    report_locale: input.report_locale,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("daily_report_settings")
    .upsert(payload, { onConflict: "company_id" })
    .select(SETTINGS_SELECT)
    .single();
  if (error) throw new Error(error.message);
  return rowFromDb(data as Record<string, unknown>);
}

export async function listEnabledDailyReportSettings(
  supabase: Supabase,
): Promise<DailyReportSettingsRow[]> {
  const { data, error } = await supabase
    .from("daily_report_settings")
    .select(SETTINGS_SELECT)
    .eq("enabled", true);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => rowFromDb(row as Record<string, unknown>));
}

export async function hasSuccessfulDailyReportLog(
  supabase: Supabase,
  companyId: string,
  reportDate: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("daily_report_logs")
    .select("id")
    .eq("company_id", companyId)
    .eq("report_date", reportDate)
    .eq("status", "success")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

export async function insertDailyReportLog(
  supabase: Supabase,
  row: {
    company_id: string;
    report_date: string;
    recipient_emails: string[];
    status: "success" | "failed";
    error_message?: string | null;
  },
): Promise<void> {
  const { error } = await supabase.from("daily_report_logs").insert({
    company_id: row.company_id,
    report_date: row.report_date,
    recipient_emails: row.recipient_emails,
    status: row.status,
    error_message: row.error_message ?? null,
    sent_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

export async function listDailyReportLogs(
  supabase: Supabase,
  companyId: string,
  limit = 20,
): Promise<DailyReportLogRow[]> {
  const { data, error } = await supabase
    .from("daily_report_logs")
    .select("id, company_id, report_date, recipient_emails, status, error_message, sent_at")
    .eq("company_id", companyId)
    .order("sent_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id),
      company_id: String(r.company_id),
      report_date: String(r.report_date).slice(0, 10),
      recipient_emails: Array.isArray(r.recipient_emails)
        ? r.recipient_emails.map(String)
        : [],
      status: r.status === "failed" ? "failed" : "success",
      error_message: r.error_message != null ? String(r.error_message) : null,
      sent_at: String(r.sent_at),
    };
  });
}

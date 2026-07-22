import { NextResponse } from "next/server";
import { isNextResponse } from "@/lib/admin-api-auth";
import { assertShopScope, requireCompanyFeatureAccess } from "@/lib/company-scope";
import {
  getDailyReportSettings,
  normalizeRecipientEmails,
  upsertDailyReportSettings,
} from "@/lib/daily-reports/daily-report-db";
import { isLocale } from "@/lib/i18n";
import { createAdminClient } from "@/lib/supabase/admin";

function parseSendTime(value: string): string | null {
  const trimmed = value.trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const h = parseInt(match[1]!, 10);
  const m = parseInt(match[2]!, 10);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

export async function GET(req: Request) {
  try {
    const supabase = createAdminClient();
    const scope = await requireCompanyFeatureAccess(req, supabase);
    if (isNextResponse(scope)) return scope;

    const [settings, shopsRes] = await Promise.all([
      getDailyReportSettings(supabase, scope.companyId),
      supabase
        .from("shops")
        .select("id, name")
        .eq("company_id", scope.companyId)
        .order("name"),
    ]);
    if (shopsRes.error) throw new Error(shopsRes.error.message);

    const shops = (shopsRes.data ?? []).map((s) => ({
      id: String((s as { id: string }).id),
      name: String((s as { name: string }).name),
    }));

    return NextResponse.json({
      settings: settings ?? {
        enabled: false,
        recipient_emails: [],
        send_time: "21:15:00",
        shop_ids: [],
        include_attendance: true,
        include_cleaning: true,
        report_locale: "en",
      },
      shops,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const supabase = createAdminClient();
    const scope = await requireCompanyFeatureAccess(req, supabase);
    if (isNextResponse(scope)) return scope;

    const body = (await req.json()) as Record<string, unknown>;
    const enabled = body.enabled === true;
    const recipient_emails = normalizeRecipientEmails(
      Array.isArray(body.recipient_emails) ? body.recipient_emails.map(String) : [],
    );
    const sendTimeRaw = String(body.send_time ?? "21:15");
    const send_time = parseSendTime(sendTimeRaw);
    if (!send_time) {
      return NextResponse.json({ error: "Invalid send time." }, { status: 400 });
    }

    const shop_ids = Array.isArray(body.shop_ids) ? body.shop_ids.map(String) : [];
    for (const shopId of shop_ids) {
      const check = await assertShopScope(supabase, shopId, scope.companyId);
      if (check) return check;
    }

    const include_attendance = body.include_attendance !== false;
    const include_cleaning = body.include_cleaning !== false;
    const report_locale = isLocale(body.report_locale) ? body.report_locale : "en";

    if (enabled && recipient_emails.length === 0) {
      return NextResponse.json({ error: "At least one recipient email is required." }, { status: 400 });
    }

    const saved = await upsertDailyReportSettings(supabase, scope.companyId, {
      enabled,
      recipient_emails,
      send_time,
      shop_ids,
      include_attendance,
      include_cleaning,
      report_locale,
    });

    return NextResponse.json({ settings: saved });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}

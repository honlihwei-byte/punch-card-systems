import { NextResponse } from "next/server";
import { isNextResponse } from "@/lib/admin-api-auth";
import { requireCompanyFeatureAccess } from "@/lib/company-scope";
import { buildDailyReport } from "@/lib/daily-reports/build-daily-report";
import { getDailyReportSettings } from "@/lib/daily-reports/daily-report-db";
import {
  renderDailyReportHtml,
  renderDailyReportText,
} from "@/lib/daily-reports/render-daily-report-email";
import { malaysiaDateYmd } from "@/lib/malaysia-time";
import { isLocale } from "@/lib/i18n";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  try {
    const supabase = createAdminClient();
    const scope = await requireCompanyFeatureAccess(req, supabase);
    if (isNextResponse(scope)) return scope;

    const url = new URL(req.url);
    const dateParam = url.searchParams.get("date")?.trim();
    const reportDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
      ? dateParam
      : malaysiaDateYmd(new Date());

    const settings = await getDailyReportSettings(supabase, scope.companyId);
    const effectiveSettings = {
      shop_ids: settings?.shop_ids ?? [],
      include_attendance: settings?.include_attendance ?? true,
      include_cleaning: settings?.include_cleaning ?? true,
    };
    const locale = settings?.report_locale && isLocale(settings.report_locale)
      ? settings.report_locale
      : "en";

    const payload = await buildDailyReport({
      supabase,
      companyId: scope.companyId,
      companyShopIds: scope.companyShopIds,
      reportDate,
      settings: effectiveSettings,
    });

    const html = renderDailyReportHtml(locale, payload);
    const text = renderDailyReportText(locale, payload);

    return NextResponse.json({ payload, html, text, locale });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}

import { tForLocale } from "@/lib/i18n";
import { formatTemplate } from "@/lib/i18n/format-template";
import type { Locale } from "@/lib/i18n/types";
import type { DailyReportPayload } from "./types";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderShopCleaningText(
  locale: Locale,
  cleaning: NonNullable<DailyReportPayload["shops"][0]["cleaning"]>,
): string {
  return formatTemplate(tForLocale(locale, "dailyReports.email.cleaningSummary"), {
    completed: cleaning.completed,
    total: cleaning.assigned,
  });
}

export function renderDailyReportSubject(locale: Locale, date: string): string {
  return formatTemplate(tForLocale(locale, "dailyReports.email.subject"), { date });
}

export function renderDailyReportText(locale: Locale, payload: DailyReportPayload): string {
  const out: string[] = [];
  out.push(tForLocale(locale, "dailyReports.email.title"));
  out.push(formatTemplate(tForLocale(locale, "dailyReports.email.dateLine"), { date: payload.date }));
  out.push("");

  for (const shop of payload.shops) {
    out.push(`🏬 ${shop.shop_name}`);
    if (payload.include_attendance && shop.attendance) {
      const a = shop.attendance;
      out.push(
        `✅ ${formatTemplate(tForLocale(locale, "dailyReports.email.staffPresent"), { count: a.present_count })}`,
      );
      if (a.late.length === 0) {
        out.push(`✅ ${tForLocale(locale, "dailyReports.email.noLate")}`);
      } else {
        for (const entry of a.late) {
          out.push(
            `⚠️ ${formatTemplate(tForLocale(locale, "dailyReports.email.lateStaff"), { name: entry.name, minutes: entry.detail ?? "0" })}`,
          );
        }
      }
      if (a.missing_clock_out.length === 0) {
        out.push(`✅ ${tForLocale(locale, "dailyReports.email.allClockedOut")}`);
      } else {
        for (const entry of a.missing_clock_out) {
          out.push(
            `❌ ${formatTemplate(tForLocale(locale, "dailyReports.email.missingClockOut"), { name: entry.name })}`,
          );
        }
      }
      for (const entry of a.never_clocked_in) {
        out.push(
          `❌ ${formatTemplate(tForLocale(locale, "dailyReports.email.neverClockedIn"), { name: entry.name })}`,
        );
      }
    }
    if (payload.include_cleaning && shop.cleaning) {
      out.push(`🧹 ${renderShopCleaningText(locale, shop.cleaning)}`);
    }
    out.push("");
  }

  out.push(tForLocale(locale, "dailyReports.email.overallTitle"));
  if (payload.include_attendance) {
    out.push(
      `✅ ${formatTemplate(tForLocale(locale, "dailyReports.email.overallPresent"), { count: payload.overall.present })}`,
    );
    out.push(
      `⚠️ ${formatTemplate(tForLocale(locale, "dailyReports.email.overallLate"), { count: payload.overall.late })}`,
    );
    out.push(
      `❌ ${formatTemplate(tForLocale(locale, "dailyReports.email.overallMissingOut"), { count: payload.overall.missing_clock_out })}`,
    );
  }
  if (payload.include_cleaning) {
    out.push(
      `🧹 ${formatTemplate(tForLocale(locale, "dailyReports.email.overallCleaning"), {
        completed: payload.overall.cleaning_completed,
        total: payload.overall.cleaning_total,
      })}`,
    );
  }

  return out.join("\n");
}

export function renderDailyReportHtml(locale: Locale, payload: DailyReportPayload): string {
  const shopBlocks = payload.shops
    .map((shop) => {
      const parts: string[] = [];
      parts.push(
        `<h2 style="margin:20px 0 8px;font-size:18px;color:#0f172a;">🏬 ${escapeHtml(shop.shop_name)}</h2>`,
      );
      parts.push('<div style="font-size:15px;line-height:1.6;color:#334155;">');

      if (payload.include_attendance && shop.attendance) {
        const a = shop.attendance;
        parts.push(
          `<p style="margin:4px 0;">✅ ${escapeHtml(formatTemplate(tForLocale(locale, "dailyReports.email.staffPresent"), { count: a.present_count }))}</p>`,
        );
        if (a.late.length === 0) {
          parts.push(
            `<p style="margin:4px 0;">✅ ${escapeHtml(tForLocale(locale, "dailyReports.email.noLate"))}</p>`,
          );
        } else {
          for (const entry of a.late) {
            parts.push(
              `<p style="margin:4px 0;">⚠️ ${escapeHtml(formatTemplate(tForLocale(locale, "dailyReports.email.lateStaff"), { name: entry.name, minutes: entry.detail ?? "0" }))}</p>`,
            );
          }
        }
        if (a.missing_clock_out.length === 0) {
          parts.push(
            `<p style="margin:4px 0;">✅ ${escapeHtml(tForLocale(locale, "dailyReports.email.allClockedOut"))}</p>`,
          );
        } else {
          for (const entry of a.missing_clock_out) {
            parts.push(
              `<p style="margin:4px 0;">❌ ${escapeHtml(formatTemplate(tForLocale(locale, "dailyReports.email.missingClockOut"), { name: entry.name }))}</p>`,
            );
          }
        }
        for (const entry of a.never_clocked_in) {
          parts.push(
            `<p style="margin:4px 0;">❌ ${escapeHtml(formatTemplate(tForLocale(locale, "dailyReports.email.neverClockedIn"), { name: entry.name }))}</p>`,
          );
        }
      }

      if (payload.include_cleaning && shop.cleaning) {
        parts.push(
          `<p style="margin:4px 0;">🧹 ${escapeHtml(renderShopCleaningText(locale, shop.cleaning))}</p>`,
        );
      }

      parts.push("</div>");
      return parts.join("");
    })
    .join("");

  const overallParts: string[] = [];
  overallParts.push(
    `<h2 style="margin:24px 0 8px;font-size:18px;color:#0f172a;">${escapeHtml(tForLocale(locale, "dailyReports.email.overallTitle"))}</h2>`,
  );
  overallParts.push('<div style="font-size:15px;line-height:1.6;color:#334155;">');
  if (payload.include_attendance) {
    overallParts.push(
      `<p style="margin:4px 0;">✅ ${escapeHtml(formatTemplate(tForLocale(locale, "dailyReports.email.overallPresent"), { count: payload.overall.present }))}</p>`,
    );
    overallParts.push(
      `<p style="margin:4px 0;">⚠️ ${escapeHtml(formatTemplate(tForLocale(locale, "dailyReports.email.overallLate"), { count: payload.overall.late }))}</p>`,
    );
    overallParts.push(
      `<p style="margin:4px 0;">❌ ${escapeHtml(formatTemplate(tForLocale(locale, "dailyReports.email.overallMissingOut"), { count: payload.overall.missing_clock_out }))}</p>`,
    );
  }
  if (payload.include_cleaning) {
    overallParts.push(
      `<p style="margin:4px 0;">🧹 ${escapeHtml(formatTemplate(tForLocale(locale, "dailyReports.email.overallCleaning"), { completed: payload.overall.cleaning_completed, total: payload.overall.cleaning_total }))}</p>`,
    );
  }
  overallParts.push("</div>");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:16px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px;border:1px solid #e2e8f0;">
    <h1 style="margin:0 0 8px;font-size:22px;color:#0f172a;">📊 ${escapeHtml(tForLocale(locale, "dailyReports.email.title"))}</h1>
    <p style="margin:0 0 16px;font-size:14px;color:#64748b;">${escapeHtml(formatTemplate(tForLocale(locale, "dailyReports.email.dateLine"), { date: payload.date }))}</p>
    ${shopBlocks}
    ${overallParts.join("")}
    <p style="margin:24px 0 0;font-size:12px;color:#94a3b8;">LW OpsFlow</p>
  </div>
</body>
</html>`;
}

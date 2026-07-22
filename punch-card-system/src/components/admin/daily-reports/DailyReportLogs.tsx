"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/LanguageProvider";

type LogRow = {
  id: string;
  report_date: string;
  recipient_emails: string[];
  status: "success" | "failed";
  error_message: string | null;
  sent_at: string;
};

export function DailyReportLogs() {
  const { t } = useI18n();
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/daily-reports/logs", { credentials: "include" });
      if (res.ok) {
        const j = (await res.json()) as { logs?: LogRow[] };
        setRows(j.logs ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
      <div className="border-b border-zinc-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-zinc-900">{t("dailyReports.logsTitle")}</h2>
      </div>
      {loading ? (
        <p className="p-4 text-sm text-zinc-500">{t("common.loading")}</p>
      ) : rows.length === 0 ? (
        <p className="p-4 text-sm text-zinc-500">{t("dailyReports.logsEmpty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs text-zinc-500">
              <tr>
                <th className="px-4 py-2 font-medium">{t("dailyReports.logsDate")}</th>
                <th className="px-4 py-2 font-medium">{t("dailyReports.logsRecipients")}</th>
                <th className="px-4 py-2 font-medium">{t("dailyReports.logsStatus")}</th>
                <th className="px-4 py-2 font-medium">{t("dailyReports.logsSentAt")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-2 whitespace-nowrap">{row.report_date}</td>
                  <td className="px-4 py-2 max-w-xs truncate">{row.recipient_emails.join(", ")}</td>
                  <td className="px-4 py-2">
                    <span
                      className={
                        row.status === "success"
                          ? "text-emerald-700"
                          : "text-red-600"
                      }
                    >
                      {row.status === "success"
                        ? t("dailyReports.statusSuccess")
                        : t("dailyReports.statusFailed")}
                    </span>
                    {row.error_message && (
                      <span className="block text-xs text-zinc-500 truncate max-w-[200px]">
                        {row.error_message}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-zinc-600">
                    {new Date(row.sent_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

"use client";

import { useI18n } from "@/components/i18n/LanguageProvider";

type Props = {
  html: string;
};

export function DailyReportPreview({ html }: Props) {
  const { t } = useI18n();

  return (
    <div className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
      <div className="border-b border-zinc-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-zinc-900">{t("dailyReports.previewTitle")}</h2>
      </div>
      <div
        className="max-h-[70vh] overflow-auto p-4 bg-slate-50"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

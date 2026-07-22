"use client";

import { useI18n } from "@/components/i18n/LanguageProvider";

/** CSS-only Retail Operations Intelligence dashboard mockup for hero section. */
export function DashboardPreview() {
  const { t } = useI18n();

  const scores = [
    {
      label: t("landing.dashboardPreview.scoreReliability"),
      value: "84",
      delta: "+3",
      color: "text-emerald-700 bg-emerald-50 border-emerald-100",
    },
    {
      label: t("landing.dashboardPreview.scoreTask"),
      value: "91",
      delta: "+7",
      color: "text-blue-700 bg-blue-50 border-blue-100",
    },
    {
      label: t("landing.dashboardPreview.scoreCompliance"),
      value: "76",
      delta: "−2",
      color: "text-amber-800 bg-amber-50 border-amber-100",
    },
  ];

  const staffRows = [
    { name: "Aina M.", score: 94, color: "bg-emerald-500" },
    { name: "Daniel T.", score: 72, color: "bg-amber-400" },
    { name: "Priya S.", score: 88, color: "bg-emerald-500" },
    { name: "Marcus L.", score: 55, color: "bg-red-400" },
  ];

  const outletRows = [
    { shop: t("landing.dashboardPreview.mainBranch"), score: 91, dot: "bg-emerald-500" },
    { shop: t("landing.dashboardPreview.mallOutlet"), score: 63, dot: "bg-amber-400" },
    { shop: t("landing.dashboardPreview.subangPj"), score: 78, dot: "bg-emerald-400" },
  ];

  const taskRows = [
    { label: t("landing.dashboardPreview.taskCompleted"), count: 14, color: "text-emerald-700" },
    { label: t("landing.dashboardPreview.taskPending"), count: 3, color: "text-amber-700" },
    { label: t("landing.dashboardPreview.taskOverdue"), count: 1, color: "text-red-600" },
  ];

  const alertChips = [
    t("landing.dashboardPreview.alertMallOutlet"),
    t("landing.dashboardPreview.alertDanielReliability"),
  ];

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
      aria-hidden
    >
      {/* Title bar */}
      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
        <span className="ml-3 text-[11px] font-semibold text-slate-500">
          {t("landing.dashboardPreview.titleBar")}
        </span>
      </div>

      <div className="space-y-3 p-4 sm:p-5">
        {/* Score row */}
        <div className="grid grid-cols-3 gap-2">
          {scores.map((s) => (
            <div key={s.label} className={`rounded-xl border p-2.5 ${s.color}`}>
              <p className="text-[9px] font-bold uppercase tracking-wide opacity-70">{s.label}</p>
              <p className="mt-0.5 text-xl font-bold leading-none">{s.value}</p>
              <p className="mt-0.5 text-[9px] font-semibold opacity-70">
                {s.delta} {t("landing.dashboardPreview.thisWeekSuffix")}
              </p>
            </div>
          ))}
        </div>

        {/* Staff reliability bars */}
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
            {t("landing.dashboardPreview.staffReliabilityHeading")}
          </p>
          <div className="mt-2 space-y-2">
            {staffRows.map((row) => (
              <div key={row.name} className="flex items-center gap-2">
                <span className="w-14 shrink-0 text-[10px] font-medium text-slate-700">
                  {row.name}
                </span>
                <div className="flex-1 overflow-hidden rounded-full bg-slate-100" style={{ height: 6 }}>
                  <div
                    className={`h-full rounded-full ${row.color}`}
                    style={{ width: `${row.score}%` }}
                  />
                </div>
                <span className="w-7 text-right text-[10px] font-bold text-slate-600">
                  {row.score}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Outlet health + task completion side by side */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-slate-200 bg-white p-2.5">
            <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">
              {t("landing.dashboardPreview.outletHealthHeading")}
            </p>
            <div className="mt-1.5 space-y-1">
              {outletRows.map((o) => (
                <div key={o.shop} className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${o.dot}`} />
                    <span className="text-[9px] font-medium text-slate-700">{o.shop}</span>
                  </div>
                  <span className="text-[10px] font-bold text-slate-600">{o.score}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-2.5">
            <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">
              {t("landing.dashboardPreview.tasksTodayHeading")}
            </p>
            <div className="mt-1.5 space-y-1">
              {taskRows.map((row) => (
                <div key={row.label} className="flex items-center justify-between">
                  <span className="text-[9px] text-slate-500">{row.label}</span>
                  <span className={`text-[11px] font-bold ${row.color}`}>{row.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Alert strip */}
        <div className="rounded-xl border border-amber-100 bg-amber-50/80 px-3 py-2">
          <p className="text-[9px] font-bold uppercase tracking-wide text-amber-800">
            {t("landing.dashboardPreview.needsAttention")}
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {alertChips.map((chip) => (
              <span
                key={chip}
                className="rounded-full border border-amber-200 bg-white px-2 py-0.5 text-[9px] font-semibold text-amber-900"
              >
                {chip}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Decorative glows */}
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-blue-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-teal-400/10 blur-2xl" />
    </div>
  );
}

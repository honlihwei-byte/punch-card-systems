"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/LanguageProvider";
import {
  OperationsScoreDrillDownHost,
  useOperationsScoreDrillDown,
} from "@/components/admin/operations/OperationsScoreDrillDown";
import { TodaysAttentionSection } from "@/components/admin/TodaysAttentionSection";
import type { HealthReasonKey, HealthStatusBand } from "@/lib/operations-dashboard";
import type { TodaysAttentionPayload } from "@/lib/todays-attention";
import type {
  EmployeeRankingRow,
  OutletRankingRow,
  PerformanceAnalyticsPayload,
  PerformancePeriod,
  ScoreComparison,
} from "@/lib/performance-analytics";

const PERIODS: PerformancePeriod[] = ["month", "week", "day"];

type HealthReason = { key: HealthReasonKey; count: number };

type TodayShopRow = {
  shop_id: string;
  shop_name: string;
  present_count: number;
  scheduled_count: number;
  health_score: number;
  status: HealthStatusBand;
  reasons: HealthReason[];
  task_count_today: number;
};

type StaffAttentionRow = {
  staff_id: string;
  staff_name: string;
  shop_label: string;
  reliability_score: number | null;
  today_reasons: string[];
};

type TodayOpsPayload = {
  date: string;
  shops: TodayShopRow[];
  risks: {
    late_count: number;
    missing_clock_out_count: number;
    overdue_tasks_count: number;
    task_exceptions_count: number;
  };
  staff_needs_attention: StaffAttentionRow[];
};

function formatDelta(delta: number | null): string {
  if (delta == null) return "—";
  if (delta > 0) return `+${delta}`;
  return String(delta);
}

function deltaTone(delta: number | null): string {
  if (delta == null) return "text-[#64748B]";
  if (delta > 0) return "text-emerald-700";
  if (delta < 0) return "text-red-600";
  return "text-[#64748B]";
}

function SectionHeading({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-sm font-semibold text-[#0F172A]">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs text-[#64748B]">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

function ScoreCard({
  label,
  comparison,
  loading,
}: {
  label: string;
  comparison: ScoreComparison | null;
  loading?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[#E2E8F0] bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-[#64748B]">{label}</p>
      {loading ? (
        <div className="mt-3 h-9 w-16 animate-pulse rounded-lg bg-zinc-100" />
      ) : (
        <>
          <p className="mt-2 text-2xl font-bold tabular-nums text-[#0F172A]">
            {comparison?.current ?? "—"}
          </p>
          <p className="mt-1.5 text-[11px] text-[#64748B]">
            {comparison?.previous != null ? (
              <>
                Prev {comparison.previous}
                <span className={`ml-2 font-semibold ${deltaTone(comparison.delta)}`}>
                  {formatDelta(comparison.delta)}
                </span>
              </>
            ) : (
              "—"
            )}
          </p>
        </>
      )}
    </div>
  );
}

function TodayStat({
  label,
  value,
  tone = "default",
  href,
  loading,
}: {
  label: string;
  value: number | string;
  tone?: "default" | "warn" | "good";
  href?: string;
  loading?: boolean;
}) {
  const toneClass =
    tone === "warn"
      ? "border-amber-200 bg-amber-50/80"
      : tone === "good"
        ? "border-emerald-200 bg-emerald-50/80"
        : "border-[#E2E8F0] bg-white";

  const inner = (
    <>
      <p className="text-[11px] font-medium text-[#64748B]">{label}</p>
      {loading ? (
        <div className="mt-2 h-8 w-10 animate-pulse rounded bg-zinc-100" />
      ) : (
        <p className="mt-1 text-2xl font-bold tabular-nums text-[#0F172A]">{value}</p>
      )}
    </>
  );

  const className = `rounded-xl border p-4 shadow-sm transition ${toneClass}${href ? " hover:border-[#2563EB]/40 hover:shadow-md" : ""}`;

  if (href) {
    return (
      <Link href={href} className={className}>
        {inner}
      </Link>
    );
  }

  return <div className={className}>{inner}</div>;
}

const STATUS_DOT: Record<HealthStatusBand, string> = {
  excellent: "bg-emerald-500",
  good: "bg-blue-500",
  needs_attention: "bg-amber-500",
  critical: "bg-red-500",
};

export function OperationsDashboard() {
  const { t } = useI18n();
  const drillDown = useOperationsScoreDrillDown();
  const [period, setPeriod] = useState<PerformancePeriod>("month");
  const [performance, setPerformance] = useState<PerformanceAnalyticsPayload | null>(null);
  const [today, setToday] = useState<TodayOpsPayload | null>(null);
  const [todaysAttention, setTodaysAttention] = useState<TodaysAttentionPayload | null>(null);
  const [perfLoading, setPerfLoading] = useState(true);
  const [todayLoading, setTodayLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPerformance = useCallback(async () => {
    setPerfLoading(true);
    try {
      const res = await fetch(`/api/admin/performance-analytics?period=${period}`, {
        credentials: "include",
      });
      const json = (await res.json()) as PerformanceAnalyticsPayload & {
        error?: string;
        redirect?: string;
      };
      if (res.status === 402 && json.redirect) {
        window.location.href = json.redirect;
        return;
      }
      if (!res.ok) throw new Error(json.error || t("dashboard.operations.loadError"));
      setPerformance(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("dashboard.operations.loadError"));
    } finally {
      setPerfLoading(false);
    }
  }, [period, t]);

  const loadToday = useCallback(async () => {
    setTodayLoading(true);
    try {
      const [summaryRes, analyticsRes] = await Promise.all([
        fetch("/api/admin/operations-dashboard?view=summary", { credentials: "include" }),
        fetch("/api/admin/operations-dashboard?view=analytics", { credentials: "include" }),
      ]);
      const summary = (await summaryRes.json()) as TodayOpsPayload & {
        error?: string;
        todays_attention?: TodaysAttentionPayload;
      };
      const analytics = (await analyticsRes.json()) as { staff_needs_attention?: StaffAttentionRow[] };
      if (!summaryRes.ok && !summary.shops) {
        throw new Error(summary.error || t("dashboard.operations.loadError"));
      }
      setTodaysAttention(summary.todays_attention ?? null);
      setToday({
        date: summary.date,
        shops: summary.shops ?? [],
        risks: summary.risks ?? {
          late_count: 0,
          missing_clock_out_count: 0,
          overdue_tasks_count: 0,
          task_exceptions_count: 0,
        },
        staff_needs_attention: analytics.staff_needs_attention ?? [],
      });
    } catch (e) {
      console.warn("[operations-dashboard] today load failed", e);
    } finally {
      setTodayLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadPerformance();
  }, [loadPerformance]);

  useEffect(() => {
    void loadToday();
  }, [loadToday]);

  const periodLabel = (p: PerformancePeriod) => {
    const key = `dashboard.operations.performance.period.${p}`;
    const label = t(key);
    return label === key ? p : label;
  };

  const todayMetrics = useMemo(() => {
    if (!today) {
      return {
        present: 0,
        late: 0,
        missing: 0,
        tasksDue: 0,
        overdue: 0,
      };
    }
    return {
      present: today.shops.reduce((sum, s) => sum + s.present_count, 0),
      late: today.risks.late_count,
      missing: today.risks.missing_clock_out_count,
      tasksDue: today.shops.reduce((sum, s) => sum + s.task_count_today, 0),
      overdue: today.risks.overdue_tasks_count,
    };
  }, [today]);

  const outletsNeedingAttention = useMemo(() => {
    if (!today) return [];
    return [...today.shops]
      .filter(
        (s) =>
          s.reasons.length > 0 ||
          s.status === "needs_attention" ||
          s.status === "critical",
      )
      .sort((a, b) => a.health_score - b.health_score);
  }, [today]);

  const formatHealthReason = useCallback(
    (reason: HealthReason) => {
      const base = `dashboard.operations.healthReason.${reason.key}`;
      const key = reason.count === 1 ? base : `${base}_plural`;
      return t(key).replace("{count}", String(reason.count));
    },
    [t],
  );

  const reasonLabel = useCallback(
    (reason: string) => {
      const map: Record<string, string> = {
        late: t("dashboard.operations.reasonLate"),
        missing_clock_out: t("dashboard.operations.reasonMissingOut"),
        location: t("dashboard.operations.reasonLocation"),
        review: t("dashboard.operations.reasonReview"),
      };
      return map[reason] ?? reason;
    },
    [t],
  );

  return (
    <div className="space-y-8">
      <OperationsScoreDrillDownHost target={drillDown.target} onClose={drillDown.close} />

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4">
          <p className="text-sm font-semibold text-red-700">{error}</p>
          <button
            type="button"
            onClick={() => void loadPerformance()}
            className="mt-3 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
          >
            {t("button.refresh")}
          </button>
        </div>
      ) : null}

      <TodaysAttentionSection data={todaysAttention} loading={todayLoading} />

      {/* 1. Operations Overview */}
      <section className="space-y-4">
        <SectionHeading
          title={t("dashboard.operations.layout.operationsOverview")}
          subtitle={
            perfLoading
              ? t("dashboard.operations.loading")
              : `${performance?.period_label ?? ""} · ${t("dashboard.operations.performance.vsPrevious")} ${performance?.previous_period_label ?? ""}`
          }
          action={
            <div className="inline-flex rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-1 shadow-sm">
              {PERIODS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    period === p
                      ? "bg-white text-[#0F172A] shadow-sm"
                      : "text-[#64748B] hover:text-[#0F172A]"
                  }`}
                >
                  {periodLabel(p)}
                </button>
              ))}
            </div>
          }
        />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ScoreCard
            label={t("dashboard.operations.layout.attendanceScore")}
            comparison={performance?.scores.attendance_health ?? null}
            loading={perfLoading}
          />
          <ScoreCard
            label={t("dashboard.operations.performance.taskScore")}
            comparison={performance?.scores.task ?? null}
            loading={perfLoading}
          />
          <ScoreCard
            label={t("dashboard.operations.performance.reliability")}
            comparison={performance?.scores.reliability ?? null}
            loading={perfLoading}
          />
          <ScoreCard
            label={t("dashboard.operations.performance.compliance")}
            comparison={performance?.scores.compliance ?? null}
            loading={perfLoading}
          />
        </div>
      </section>

      {/* 2. Today's Operations */}
      <section className="space-y-4">
        <SectionHeading
          title={t("dashboard.operations.layout.todaysOperations")}
          subtitle={today?.date ? `${t("dashboard.operations.layout.asOf")} ${today.date}` : undefined}
        />
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
          <TodayStat
            label={t("dashboard.operations.layout.presentStaff")}
            value={todayMetrics.present}
            tone="good"
            href="/admin/attendance"
            loading={todayLoading}
          />
          <TodayStat
            label={t("dashboard.operations.layout.lateStaff")}
            value={todayMetrics.late}
            tone={todayMetrics.late > 0 ? "warn" : "default"}
            href="/admin/attendance"
            loading={todayLoading}
          />
          <TodayStat
            label={t("dashboard.operations.layout.missingPunches")}
            value={todayMetrics.missing}
            tone={todayMetrics.missing > 0 ? "warn" : "default"}
            href="/admin/attendance?issue_type=missing_clock_out"
            loading={todayLoading}
          />
          <TodayStat
            label={t("dashboard.operations.layout.tasksDueToday")}
            value={todayMetrics.tasksDue}
            href="/admin/tasks"
            loading={todayLoading}
          />
          <TodayStat
            label={t("dashboard.operations.layout.overdueTasks")}
            value={todayMetrics.overdue}
            tone={todayMetrics.overdue > 0 ? "warn" : "default"}
            href="/admin/tasks"
            loading={todayLoading}
          />
        </div>
      </section>

      {/* 3. Needs Attention */}
      <section className="space-y-4">
        <SectionHeading title={t("dashboard.operations.layout.needsAttention")} />
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">
              {t("dashboard.operations.layout.outletsWithIssues")}
            </h3>
            {todayLoading ? (
              <div className="mt-3 h-20 animate-pulse rounded-xl bg-zinc-100" />
            ) : outletsNeedingAttention.length === 0 ? (
              <p className="mt-3 text-sm text-emerald-700">{t("dashboard.operations.noIssuesToday")}</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {outletsNeedingAttention.slice(0, 8).map((shop) => (
                  <li key={shop.shop_id}>
                    <button
                      type="button"
                      className="flex w-full items-start gap-3 rounded-xl border border-amber-100 bg-amber-50/50 px-3 py-2.5 text-left transition hover:bg-amber-50"
                      onClick={() =>
                        drillDown.openShop(shop.shop_id, shop.shop_name, t("drilldown.tapForDetails"))
                      }
                    >
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[shop.status]}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-[#0F172A]">{shop.shop_name}</p>
                        <p className="mt-0.5 text-xs text-[#64748B]">
                          {t(`dashboard.operations.statusBand.${shop.status}`)} ·{" "}
                          {t("dashboard.operations.healthScore")} {shop.health_score}
                        </p>
                        {shop.reasons.length > 0 ? (
                          <p className="mt-1 text-xs text-amber-900">
                            {shop.reasons.slice(0, 3).map(formatHealthReason).join(" · ")}
                          </p>
                        ) : null}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">
              {t("dashboard.operations.layout.employeesWithIssues")}
            </h3>
            {todayLoading ? (
              <div className="mt-3 h-20 animate-pulse rounded-xl bg-zinc-100" />
            ) : (today?.staff_needs_attention.length ?? 0) === 0 ? (
              <p className="mt-3 text-sm text-emerald-700">{t("dashboard.operations.noStaffAttention")}</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {(today?.staff_needs_attention ?? []).slice(0, 8).map((row) => (
                  <li key={row.staff_id}>
                    <button
                      type="button"
                      className="flex w-full items-start gap-3 rounded-xl border border-amber-100 bg-amber-50/50 px-3 py-2.5 text-left transition hover:bg-amber-50"
                      onClick={() =>
                        drillDown.openStaff(
                          row.staff_id,
                          row.staff_name,
                          row.shop_label,
                          row.reliability_score,
                        )
                      }
                    >
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-800">
                        {row.staff_name.charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-[#0F172A]">{row.staff_name}</p>
                        <p className="text-xs text-[#64748B]">{row.shop_label}</p>
                        {row.today_reasons.length > 0 ? (
                          <p className="mt-1 text-xs text-amber-900">
                            {row.today_reasons.map(reasonLabel).join(" · ")}
                          </p>
                        ) : null}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* 4–5. Secondary rankings */}
      <section className="space-y-4 border-t border-[#E2E8F0] pt-8">
        <SectionHeading
          title={t("dashboard.operations.layout.secondaryAnalytics")}
          subtitle={t("dashboard.operations.layout.secondaryAnalyticsDesc")}
        />
        {perfLoading ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="h-48 animate-pulse rounded-2xl bg-zinc-100" />
            <div className="h-48 animate-pulse rounded-2xl bg-zinc-100" />
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <CompactRanking
              title={t("dashboard.operations.performance.outletRanking")}
              emptyLabel={t("dashboard.operations.noShops")}
              rows={(performance?.outlet_ranking ?? []).slice(0, 6).map((r) => ({
                id: r.shop_id,
                name: r.shop_name,
                score: r.score,
                delta: r.delta,
              }))}
              onSelect={(id, name) =>
                drillDown.openShop(id, name, t("drilldown.tapForDetails"))
              }
            />
            <CompactRanking
              title={t("dashboard.operations.performance.employeeRanking")}
              emptyLabel={t("dashboard.operations.noReliableStaff")}
              rows={(performance?.employee_ranking ?? []).slice(0, 6).map((r) => ({
                id: r.staff_id,
                name: r.staff_name,
                sub: r.shop_label,
                score: r.reliability_score,
                delta: r.delta,
              }))}
              onSelect={(id, name, sub) => {
                const row = performance?.employee_ranking.find((r) => r.staff_id === id);
                drillDown.openStaff(id, name, sub ?? row?.shop_label ?? "", row?.reliability_score ?? null);
              }}
            />
          </div>
        )}
      </section>

      <p className="text-xs text-[#94A3B8]">{t("dashboard.operations.scoreDisclaimer")}</p>
    </div>
  );
}

function CompactRanking({
  title,
  rows,
  emptyLabel,
  onSelect,
}: {
  title: string;
  rows: Array<{ id: string; name: string; sub?: string; score: number; delta: number | null }>;
  emptyLabel: string;
  onSelect: (id: string, name: string, sub?: string) => void;
}) {
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC]/50 p-4">
      <h3 className="text-xs font-semibold text-[#64748B]">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-2 text-xs text-[#64748B]">{emptyLabel}</p>
      ) : (
        <ul className="mt-2 divide-y divide-[#E2E8F0]">
          {rows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 py-2.5 text-left text-sm transition hover:text-[#2563EB]"
                onClick={() => onSelect(row.id, row.name, row.sub)}
              >
                <span className="min-w-0 truncate font-medium text-[#0F172A]">
                  {row.name}
                  {row.sub ? (
                    <span className="ml-1 font-normal text-[#94A3B8]">· {row.sub}</span>
                  ) : null}
                </span>
                <span className="shrink-0 tabular-nums text-xs text-[#64748B]">
                  {row.score}
                  {row.delta != null ? (
                    <span className={`ml-1.5 ${deltaTone(row.delta)}`}>
                      {formatDelta(row.delta)}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

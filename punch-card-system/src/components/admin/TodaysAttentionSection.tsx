"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/LanguageProvider";
import type { AttentionAlert, TodaysAttentionPayload } from "@/lib/todays-attention";

function AlertBlock({
  title,
  alert,
  tone,
  href,
  emptyLabel,
}: {
  title: string;
  alert: AttentionAlert;
  tone: "critical" | "warning" | "healthy";
  href?: string;
  emptyLabel?: string;
}) {
  const border =
    tone === "critical"
      ? "border-red-200 bg-red-50/60"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50/60"
        : "border-emerald-200 bg-emerald-50/60";
  const countClass =
    tone === "critical"
      ? "text-red-700"
      : tone === "warning"
        ? "text-amber-800"
        : "text-emerald-700";

  return (
    <div className={`rounded-xl border p-3 ${border}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-[#0F172A]">{title}</p>
        <span className={`text-lg font-bold tabular-nums ${countClass}`}>{alert.count}</span>
      </div>
      {alert.count === 0 ? (
        <p className="mt-2 text-xs text-[#64748B]">{emptyLabel ?? "—"}</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {alert.items.map((item) => (
            <li key={item.id} className="text-xs text-[#334155]">
              <span className="font-medium text-[#0F172A]">{item.label}</span>
              {item.sublabel ? (
                <span className="text-[#64748B]"> · {item.sublabel}</span>
              ) : null}
            </li>
          ))}
          {alert.count > alert.items.length ? (
            <li className="text-[11px] text-[#94A3B8]">
              +{alert.count - alert.items.length} more
            </li>
          ) : null}
        </ul>
      )}
      {href && alert.count > 0 ? (
        <Link href={href} className="mt-2 inline-block text-[11px] font-semibold text-[#2563EB]">
          View →
        </Link>
      ) : null}
    </div>
  );
}

export function TodaysAttentionSection({
  data,
  loading,
}: {
  data: TodaysAttentionPayload | null;
  loading?: boolean;
}) {
  const { t } = useI18n();

  if (loading) {
    return (
      <section className="space-y-3">
        <div className="h-6 w-48 animate-pulse rounded bg-zinc-100" />
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="h-32 animate-pulse rounded-2xl bg-zinc-100" />
          <div className="h-32 animate-pulse rounded-2xl bg-zinc-100" />
          <div className="h-32 animate-pulse rounded-2xl bg-zinc-100" />
        </div>
      </section>
    );
  }

  if (!data) return null;

  const criticalTotal =
    data.critical.absent.count +
    data.critical.missing_clock_out.count +
    data.critical.overdue_tasks.count;
  const warningTotal =
    data.warning.late.count + data.warning.forgot_punch.count + data.warning.pending_tasks.count;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-[#0F172A]">
          {t("dashboard.operations.layout.todaysAttention")}
        </h2>
        <p className="mt-0.5 text-xs text-[#64748B]">
          {t("dashboard.operations.layout.todaysAttentionDesc").replace("{date}", data.date)}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-red-200 bg-white p-4 shadow-sm">
          <h3 className="text-xs font-bold uppercase tracking-wide text-red-700">
            {t("dashboard.operations.attention.critical")} ({criticalTotal})
          </h3>
          <div className="mt-3 space-y-2">
            <AlertBlock
              title={t("dashboard.operations.attention.absent")}
              alert={data.critical.absent}
              tone="critical"
              href="/admin/attendance"
              emptyLabel={t("dashboard.operations.attention.none")}
            />
            <AlertBlock
              title={t("dashboard.operations.attention.missingClockOut")}
              alert={data.critical.missing_clock_out}
              tone="critical"
              href="/admin/attendance?issue_type=missing_clock_out"
              emptyLabel={t("dashboard.operations.attention.none")}
            />
            <AlertBlock
              title={t("dashboard.operations.attention.overdueTasks")}
              alert={data.critical.overdue_tasks}
              tone="critical"
              href="/admin/tasks"
              emptyLabel={t("dashboard.operations.attention.none")}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm">
          <h3 className="text-xs font-bold uppercase tracking-wide text-amber-800">
            {t("dashboard.operations.attention.warning")} ({warningTotal})
          </h3>
          <div className="mt-3 space-y-2">
            <AlertBlock
              title={t("dashboard.operations.attention.late")}
              alert={data.warning.late}
              tone="warning"
              href="/admin/attendance"
              emptyLabel={t("dashboard.operations.attention.none")}
            />
            <AlertBlock
              title={t("dashboard.operations.attention.forgotPunch")}
              alert={data.warning.forgot_punch}
              tone="warning"
              href="/admin/attendance?tab=forgot"
              emptyLabel={t("dashboard.operations.attention.none")}
            />
            <AlertBlock
              title={t("dashboard.operations.attention.pendingTasks")}
              alert={data.warning.pending_tasks}
              tone="warning"
              href="/admin/tasks"
              emptyLabel={t("dashboard.operations.attention.none")}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm">
          <h3 className="text-xs font-bold uppercase tracking-wide text-emerald-700">
            {t("dashboard.operations.attention.healthy")} ({data.healthy.count})
          </h3>
          {data.healthy.count === 0 ? (
            <p className="mt-3 text-xs text-[#64748B]">
              {t("dashboard.operations.attention.noHealthyShops")}
            </p>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {data.healthy.shops.map((shop) => (
                <li
                  key={shop.id}
                  className="flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50/50 px-2.5 py-1.5 text-xs font-medium text-emerald-900"
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                  {shop.label}
                </li>
              ))}
              {data.healthy.count > data.healthy.shops.length ? (
                <li className="text-[11px] text-[#94A3B8]">
                  +{data.healthy.count - data.healthy.shops.length} more
                </li>
              ) : null}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/LanguageProvider";
import { translateEmployeeStatus } from "@/lib/i18n/employee-translate";
import type {
  EmployeeAttendanceDay,
  EmployeeAttendanceRange,
  EmployeeAttendanceSummary,
} from "@/lib/employee-attendance-history";
import type { ForgotPunchRequestType } from "@/lib/forgot-punch";

type Props = {
  shopId: string;
  staffId: string;
  staffIdentifier?: string;
  useManualCode?: boolean;
  punchQrToken?: string | null;
  useEmployeeSession?: boolean;
  /** Bump after a successful punch / correction to refresh. */
  refreshKey?: number;
  deferredMs?: number;
  onRequestCorrection?: (opts: {
    suggestedType: ForgotPunchRequestType | null;
    dateYmd?: string;
  }) => void;
};

function statusBadgeClass(status: string): string {
  switch (status) {
    case "working_now":
    case "completed":
    case "on_time":
    case "correction_approved":
      return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100";
    case "late":
    case "early_leave":
    case "partial_attendance":
      return "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100";
    case "missing_clock_in":
    case "missing_clock_out":
    case "absent":
    case "pending_correction":
      return "bg-orange-100 text-orange-900 dark:bg-orange-950/40 dark:text-orange-100";
    default:
      return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200";
  }
}

const RANGES: EmployeeAttendanceRange[] = ["last_7_days", "this_month", "previous_month"];

export function StaffMyAttendanceSection({
  shopId,
  staffId,
  staffIdentifier = "",
  useManualCode = false,
  punchQrToken,
  useEmployeeSession = false,
  refreshKey = 0,
  deferredMs = 400,
  onRequestCorrection,
}: Props) {
  const { t } = useI18n();
  const [range, setRange] = useState<EmployeeAttendanceRange>("last_7_days");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<EmployeeAttendanceDay[]>([]);
  const [summary, setSummary] = useState<EmployeeAttendanceSummary | null>(null);
  const [ready, setReady] = useState(false);

  const hasStaff = useManualCode ? Boolean(staffIdentifier.trim()) : Boolean(staffId);

  const load = useCallback(async () => {
    if (!shopId || !hasStaff) {
      setDays([]);
      setSummary(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        shop_id: shopId,
        range,
      });
      if (punchQrToken) params.set("punch_qr_token", punchQrToken);
      if (useManualCode) params.set("staff_identifier", staffIdentifier.trim());
      else params.set("staff_id", staffId);

      const res = await fetch(`/api/attendance/my-history?${params}`, {
        credentials: useEmployeeSession ? "include" : "same-origin",
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        days?: EmployeeAttendanceDay[];
        summary?: EmployeeAttendanceSummary;
      };
      if (!res.ok) throw new Error(j.error || t("employee.attendanceHistory.failedLoad"));
      setDays(j.days ?? []);
      setSummary(j.summary ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("employee.attendanceHistory.failedLoad"));
      setDays([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [
    shopId,
    hasStaff,
    range,
    punchQrToken,
    useManualCode,
    staffIdentifier,
    staffId,
    useEmployeeSession,
    t,
  ]);

  // Defer history load so today's card / punch UI stays snappy.
  useEffect(() => {
    if (!hasStaff) {
      setReady(false);
      setDays([]);
      setSummary(null);
      return;
    }
    setReady(false);
    const timer = window.setTimeout(() => setReady(true), deferredMs);
    return () => window.clearTimeout(timer);
  }, [hasStaff, deferredMs, staffId, staffIdentifier, shopId]);

  useEffect(() => {
    if (!ready) return;
    void load();
  }, [ready, load, refreshKey]);

  if (!hasStaff) return null;

  return (
    <section className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          {t("employee.attendanceHistory.myAttendance")}
        </h2>
        {loading ? (
          <span className="text-[11px] text-zinc-400">{t("employee.common.loading")}</span>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRange(r)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              range === r
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "border border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
            }`}
          >
            {t(`employee.attendanceHistory.range.${r}`)}
          </button>
        ))}
      </div>

      {summary && !loading ? (
        <dl className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-zinc-100 bg-zinc-50/80 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-950/40 sm:grid-cols-3">
          <div>
            <dt className="text-zinc-500">{t("employee.attendanceHistory.summary.scheduledDays")}</dt>
            <dd className="text-base font-bold text-zinc-900 dark:text-zinc-50">
              {summary.scheduled_working_days}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">{t("employee.attendanceHistory.summary.presentDays")}</dt>
            <dd className="text-base font-bold text-zinc-900 dark:text-zinc-50">
              {summary.present_days}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">{t("employee.attendanceHistory.summary.lateDays")}</dt>
            <dd className="text-base font-bold text-zinc-900 dark:text-zinc-50">
              {summary.late_days}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">{t("employee.attendanceHistory.summary.missingDays")}</dt>
            <dd className="text-base font-bold text-zinc-900 dark:text-zinc-50">
              {summary.missing_punch_days}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">{t("employee.attendanceHistory.summary.absentDays")}</dt>
            <dd className="text-base font-bold text-zinc-900 dark:text-zinc-50">
              {summary.absent_days}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">{t("employee.attendanceHistory.summary.recordedHours")}</dt>
            <dd className="text-base font-bold text-zinc-900 dark:text-zinc-50">
              {summary.recorded_hours_label}
            </dd>
          </div>
          <div className="col-span-2 sm:col-span-3">
            <dt className="text-zinc-500">{t("employee.attendanceHistory.summary.payrollHours")}</dt>
            <dd className="text-base font-bold text-zinc-900 dark:text-zinc-50">
              {summary.payroll_hours_label}
            </dd>
          </div>
        </dl>
      ) : null}

      {error ? (
        <p className="mt-3 text-xs font-medium text-red-600 dark:text-red-300">{error}</p>
      ) : null}

      {!loading && days.length === 0 && !error ? (
        <p className="mt-3 text-xs text-zinc-500">{t("employee.attendance.empty")}</p>
      ) : null}

      <ul className="mt-3 space-y-2">
        {days.map((day) => (
          <li
            key={day.date}
            className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950/40"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-bold text-zinc-900 dark:text-zinc-50">{day.date}</p>
                {day.scheduled_label ? (
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {t("employee.attendanceHistory.scheduled")}: {day.scheduled_label}
                  </p>
                ) : (
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {translateEmployeeStatus(t, day.day_status)}
                  </p>
                )}
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${statusBadgeClass(day.day_status)}`}
              >
                {translateEmployeeStatus(t, day.day_status)}
              </span>
            </div>

            {day.sessions.length > 0 ? (
              <div className="mt-2 space-y-2">
                {day.sessions.map((s) => (
                  <div
                    key={`${day.date}-${s.session_index}`}
                    className="rounded-lg bg-zinc-50 px-2.5 py-2 text-xs dark:bg-zinc-900"
                  >
                    <p className="font-semibold text-zinc-700 dark:text-zinc-200">
                      {t("employee.attendanceHistory.session")} {s.session_index}
                      <span className="ml-2 font-normal text-zinc-500">
                        {translateEmployeeStatus(t, s.status)}
                      </span>
                    </p>
                    <p className="mt-0.5 text-zinc-600 dark:text-zinc-400">
                      {t("employee.attendanceHistory.scheduled")}:{" "}
                      <span className="font-mono">
                        {s.scheduled_start ?? t("employee.common.emDash")}–
                        {s.scheduled_end ?? t("employee.common.emDash")}
                      </span>
                    </p>
                    <p className="text-zinc-600 dark:text-zinc-400">
                      {t("employee.attendanceHistory.recorded")}:{" "}
                      <span className="font-mono">
                        {s.recorded_in ?? t("employee.common.emDash")}–
                        {s.recorded_out ?? t("employee.common.emDash")}
                      </span>
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
                {t("employee.attendanceHistory.recorded")}:{" "}
                <span className="font-mono">
                  {day.first_clock_in ?? t("employee.common.emDash")}–
                  {day.last_clock_out ?? t("employee.common.emDash")}
                </span>
              </p>
            )}

            <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
              {t("employee.attendanceHistory.hours")}:{" "}
              <span className="font-semibold">{day.recorded_hours_label}</span>
              {day.payroll_hours_ms > 0 ? (
                <>
                  {" · "}
                  {t("employee.attendanceHistory.payrollHoursShort")}:{" "}
                  <span className="font-semibold">{day.payroll_hours_label}</span>
                </>
              ) : null}
            </p>

            {day.can_request_correction && onRequestCorrection ? (
              <button
                type="button"
                onClick={() =>
                  onRequestCorrection({
                    suggestedType: day.suggested_correction_type,
                    dateYmd: day.date,
                  })
                }
                className="mt-2 w-full rounded-lg border border-teal-300 bg-teal-50 py-2 text-xs font-semibold text-teal-900 dark:border-teal-800 dark:bg-teal-950/30 dark:text-teal-100"
              >
                {t("employee.attendanceHistory.requestCorrection")}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

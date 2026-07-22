"use client";

import { useI18n } from "@/components/i18n/LanguageProvider";
import { translateEmployeeStatus } from "@/lib/i18n/employee-translate";
import { staffPunchLocationClassName } from "@/lib/staff-punch-display";
import type { StaffTodayStatusSummary } from "@/lib/staff-day-status";

export type TodayAttendanceSession = {
  id?: string;
  shift_index?: number;
  start_time: string;
  end_time: string;
  actual_clock_in?: string | null;
  actual_clock_out?: string | null;
  shift_status?: string | null;
  status_label?: string | null;
  is_current_shop?: boolean;
  shop_name?: string | null;
};

type Props = {
  staffName: string;
  summary: StaffTodayStatusSummary | null;
  sessions?: TodayAttendanceSession[];
  fixedSchedule?: { start_time: string; end_time: string } | null;
  loading?: boolean;
  error?: string | null;
  canRequestCorrection?: boolean;
  onRequestCorrection?: () => void;
};

function statusBadgeClass(status: string): string {
  switch (status) {
    case "in_shop":
    case "working_now":
    case "in_shift":
    case "open_shift":
      return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100";
    case "out":
    case "completed":
    case "on_time":
      return "bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100";
    case "missing_clock_out":
    case "missing_clock_in":
    case "absent":
      return "bg-orange-100 text-orange-900 dark:bg-orange-950/50 dark:text-orange-100";
    case "late":
    case "early_leave":
      return "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-100";
    default:
      return "bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-100";
  }
}

function displayStatusCode(
  summary: StaffTodayStatusSummary | null,
  sessions: TodayAttendanceSession[],
): string {
  if (summary?.pending_clock_in_verification) return "pending_clock_in_verification";
  if (summary?.status === "missing_clock_out") return "missing_clock_out";
  if (summary?.status === "in_shop") return "working_now";
  if (summary?.status === "out") return "completed";
  if (summary?.status === "not_clocked_in") {
    const active = sessions.find((s) =>
      ["in_shift", "open_shift", "late", "missing_clock_out"].includes(
        String(s.shift_status ?? ""),
      ),
    );
    if (active?.shift_status === "missing_clock_out") return "missing_clock_out";
    if (active) return "working_now";
    const missed = sessions.find((s) => s.shift_status === "absent");
    if (missed) return "missing_clock_in";
    return "not_clocked_in";
  }
  return summary?.status ?? "not_clocked_in";
}

function sessionDisplayStatus(s: TodayAttendanceSession): string {
  const raw = String(s.shift_status ?? "").trim();
  if (raw === "in_shift" || raw === "open_shift") return "working_now";
  if (raw === "absent" && !s.actual_clock_in) return "missing_clock_in";
  if (raw) return raw;
  if (s.actual_clock_in && !s.actual_clock_out) return "working_now";
  if (s.actual_clock_in && s.actual_clock_out) return "completed";
  return "upcoming";
}

export function StaffTodayStatusCard({
  staffName,
  summary,
  sessions = [],
  fixedSchedule = null,
  loading,
  error,
  canRequestCorrection,
  onRequestCorrection,
}: Props) {
  const { t } = useI18n();

  if (!staffName && !loading) return null;

  const statusCode = displayStatusCode(summary, sessions);
  const scheduleLines =
    sessions.length > 0
      ? sessions.map((s) => `${s.start_time}–${s.end_time}`)
      : fixedSchedule
        ? [`${fixedSchedule.start_time}–${fixedSchedule.end_time}`]
        : [];

  const warnings: string[] = [];
  if (summary?.attendance_issues?.missing_clock_in) {
    warnings.push(t("employee.status.missing_clock_in"));
  }
  if (summary?.attendance_issues?.missing_clock_out) {
    warnings.push(t("employee.status.missing_clock_out"));
  }
  for (const s of sessions) {
    const st = sessionDisplayStatus(s);
    if (st === "missing_clock_out") {
      warnings.push(
        `${t("employee.attendanceHistory.session")} ${s.shift_index ?? ""}: ${t("employee.status.missing_clock_out")}`.trim(),
      );
    }
    if (st === "missing_clock_in") {
      warnings.push(
        `${t("employee.attendanceHistory.session")} ${s.shift_index ?? ""}: ${t("employee.status.missing_clock_in")}`.trim(),
      );
    }
  }
  const uniqueWarnings = [...new Set(warnings.filter(Boolean))];

  return (
    <section className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-100">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide opacity-80">
            {t("employee.attendanceHistory.todaysAttendance")}
          </p>
          <p className="mt-0.5 text-xs opacity-75">
            {summary?.day_ymd ?? t("employee.common.emDash")} · {staffName}
          </p>
        </div>
        {loading ? (
          <span className="text-xs opacity-70">{t("employee.common.updating")}</span>
        ) : summary || sessions.length > 0 ? (
          <span
            className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${statusBadgeClass(statusCode)}`}
          >
            {translateEmployeeStatus(t, statusCode)}
          </span>
        ) : null}
      </div>

      {error ? (
        <p className="mt-2 text-xs text-red-700 dark:text-red-300">{error}</p>
      ) : null}

      {(summary || scheduleLines.length > 0) && !loading ? (
        <>
          <div className="mt-3 space-y-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">
                {t("employee.attendanceHistory.todaysSchedule")}
              </p>
              {scheduleLines.length > 0 ? (
                <ul className="mt-1 space-y-0.5">
                  {scheduleLines.map((line) => (
                    <li key={line} className="font-mono text-sm font-semibold">
                      {line}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm opacity-75">{t("employee.schedule.noShiftToday")}</p>
              )}
            </div>

            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
              <div>
                <dt className="font-medium opacity-75">
                  {t("employee.attendanceHistory.firstClockIn")}
                </dt>
                <dd className="font-mono font-semibold">
                  {summary?.first_in?.slice(0, 5) ?? t("employee.common.emDash")}
                </dd>
              </div>
              <div>
                <dt className="font-medium opacity-75">
                  {t("employee.attendanceHistory.lastClockOut")}
                </dt>
                <dd className="font-mono font-semibold">
                  {summary?.last_out?.slice(0, 5) ?? t("employee.common.emDash")}
                </dd>
              </div>
              <div>
                <dt className="font-medium opacity-75">
                  {t("employee.attendanceHistory.currentStatus")}
                </dt>
                <dd className="font-semibold">{translateEmployeeStatus(t, statusCode)}</dd>
              </div>
              <div>
                <dt className="font-medium opacity-75">{t("employee.punchLog.hoursSoFar")}</dt>
                <dd className="font-semibold">
                  {summary?.total_hours_label ?? t("employee.common.emDash")}
                </dd>
              </div>
            </dl>
          </div>

          {sessions.length > 1 ? (
            <div className="mt-3 space-y-2 border-t border-sky-200/80 pt-3 dark:border-sky-800">
              {sessions.map((s, idx) => {
                const st = sessionDisplayStatus(s);
                return (
                  <div
                    key={s.id ?? `${s.start_time}-${idx}`}
                    className="rounded-lg border border-sky-200/70 bg-white/60 px-3 py-2 dark:border-sky-800 dark:bg-sky-950/20"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-bold uppercase tracking-wide opacity-70">
                        {t("employee.attendanceHistory.session")} {s.shift_index ?? idx + 1}
                      </p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusBadgeClass(st)}`}
                      >
                        {translateEmployeeStatus(t, st)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs">
                      <span className="opacity-70">{t("employee.attendanceHistory.scheduled")}: </span>
                      <span className="font-mono font-semibold">
                        {s.start_time}–{s.end_time}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs">
                      <span className="opacity-70">{t("employee.attendanceHistory.recorded")}: </span>
                      <span className="font-mono font-semibold">
                        {s.actual_clock_in ?? t("employee.common.emDash")}–
                        {s.actual_clock_out ?? t("employee.common.emDash")}
                      </span>
                    </p>
                  </div>
                );
              })}
            </div>
          ) : null}

          {uniqueWarnings.length > 0 ? (
            <div className="mt-3 space-y-1">
              {uniqueWarnings.map((w) => (
                <p
                  key={w}
                  className="rounded-lg bg-rose-50 px-2 py-1.5 text-xs font-medium text-rose-900 dark:bg-rose-950/40 dark:text-rose-100"
                >
                  {t("employee.attendanceHistory.warning")}: {w}
                </p>
              ))}
            </div>
          ) : null}

          {canRequestCorrection && onRequestCorrection ? (
            <button
              type="button"
              onClick={onRequestCorrection}
              className="mt-3 w-full rounded-xl border border-teal-300 bg-teal-50 py-2.5 text-sm font-semibold text-teal-900 dark:border-teal-800 dark:bg-teal-950/30 dark:text-teal-100"
            >
              {t("employee.attendanceHistory.requestCorrection")}
            </button>
          ) : null}

          {summary && summary.history.length > 0 ? (
            <div className="mt-3 border-t border-sky-200/80 pt-3 dark:border-sky-800">
              <p className="text-xs font-semibold uppercase tracking-wide opacity-80">
                {t("employee.punchLog.todayPunchLog")}
              </p>
              <ul className="mt-2 space-y-1.5 text-xs">
                {summary.history.map((h) => (
                  <li key={h.id} className="leading-snug">
                    <span className="font-mono tabular-nums">{h.time_label}</span>{" "}
                    <span className="font-semibold">
                      {translateEmployeeStatus(t, h.action_type)}
                    </span>
                    <span className="text-zinc-500"> — </span>
                    <span
                      className={`font-semibold ${staffPunchLocationClassName(h.gps_status_code)}`}
                    >
                      {translateEmployeeStatus(t, h.gps_status_code)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : summary && !loading ? (
            <p className="mt-3 text-xs opacity-75">{t("employee.punchLog.noPunches")}</p>
          ) : null}
        </>
      ) : loading && !summary ? (
        <p className="mt-3 text-xs opacity-75">{t("employee.punchLog.loading")}</p>
      ) : null}
    </section>
  );
}

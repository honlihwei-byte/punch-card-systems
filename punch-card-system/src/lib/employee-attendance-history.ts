/**
 * Shared employee attendance history builder for QR clock + portal.
 * Reuses matchMultiShiftDay / punch sessions — does not invent parallel math.
 */
import {
  attendanceForTotals,
  computeWorkHoursWithBreaks,
  firstClockIn,
  formatDuration,
  lastClockOut,
  type AttendanceRecord,
} from "@/lib/attendance";
import { matchesEventDate, recordEventTime } from "@/lib/attendance-db";
import { malaysiaDateYmd } from "@/lib/malaysia-time";
import { payrollHoursMs, type PayrollMode } from "@/lib/payroll-mode";
import {
  matchMultiShiftDay,
  type PerShiftDayResult,
} from "@/lib/shifts/multi-shift-match";
import type { StaffScheduleRow } from "@/lib/shifts/staff-schedules-db";

export type EmployeeAttendanceRange = "last_7_days" | "this_month" | "previous_month";

/** Staff-facing status codes (translated via employee.status.*). */
export type EmployeeDayStatusCode =
  | "on_time"
  | "late"
  | "working_now"
  | "completed"
  | "missing_clock_in"
  | "missing_clock_out"
  | "absent"
  | "no_schedule"
  | "pending_correction"
  | "correction_approved"
  | "upcoming"
  | "early_leave"
  | "partial_attendance"
  | "off_day";

export type EmployeeAttendanceSession = {
  session_index: number;
  schedule_id: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  recorded_in: string | null;
  recorded_out: string | null;
  status: EmployeeDayStatusCode;
  can_request_clock_in: boolean;
  can_request_clock_out: boolean;
};

export type EmployeeAttendanceDay = {
  date: string;
  day_status: EmployeeDayStatusCode;
  scheduled_label: string | null;
  scheduled_lines: string[];
  first_clock_in: string | null;
  last_clock_out: string | null;
  recorded_hours_ms: number;
  recorded_hours_label: string;
  payroll_hours_ms: number;
  payroll_hours_label: string;
  sessions: EmployeeAttendanceSession[];
  correction: {
    pending: boolean;
    approved: boolean;
    pending_types: string[];
  };
  can_request_correction: boolean;
  suggested_correction_type: "forgot_clock_in" | "forgot_clock_out" | null;
};

export type EmployeeAttendanceSummary = {
  scheduled_working_days: number;
  present_days: number;
  late_days: number;
  missing_punch_days: number;
  absent_days: number;
  recorded_hours_ms: number;
  recorded_hours_label: string;
  payroll_hours_ms: number;
  payroll_hours_label: string;
};

export type ForgotPunchHistoryRow = {
  id: string;
  request_type: string;
  status: string;
  requested_time: string;
  shop_id: string;
};

export function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00+08:00`);
  d.setDate(d.getDate() + days);
  return malaysiaDateYmd(d);
}

export function resolveAttendanceRange(
  range: EmployeeAttendanceRange,
  todayYmd: string = malaysiaDateYmd(new Date()),
): { from: string; to: string } {
  if (range === "last_7_days") {
    return { from: addDaysYmd(todayYmd, -6), to: todayYmd };
  }
  const [y, m] = todayYmd.split("-").map(Number);
  if (range === "this_month") {
    const from = `${y}-${String(m).padStart(2, "0")}-01`;
    return { from, to: todayYmd };
  }
  // previous_month
  const prev = new Date(Date.UTC(y!, m! - 1, 1));
  prev.setUTCMonth(prev.getUTCMonth() - 1);
  const py = prev.getUTCFullYear();
  const pm = prev.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(py, pm, 0)).getUTCDate();
  return {
    from: `${py}-${String(pm).padStart(2, "0")}-01`,
    to: `${py}-${String(pm).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
  };
}

function eachYmdInclusive(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  while (cur <= to) {
    out.push(cur);
    cur = addDaysYmd(cur, 1);
  }
  return out;
}

function mapPerShiftStatus(
  ps: PerShiftDayResult,
  nowMs: number,
  startMs: number | null,
  endGraceMs: number | null,
  isToday: boolean,
): EmployeeDayStatusCode {
  if (ps.status === "upcoming") return "upcoming";
  if (ps.status === "missing_clock_out") return "missing_clock_out";
  if (ps.status === "absent") {
    // Only mark missing clock-in / absent after shift start has passed
    if (isToday && startMs != null && nowMs < startMs) return "upcoming";
    return "absent";
  }
  if (ps.status === "in_shift" || ps.status === "open_shift") return "working_now";
  if (ps.status === "late") {
    if (ps.actual_clock_in && !ps.actual_clock_out) {
      if (isToday && (endGraceMs == null || nowMs <= endGraceMs)) return "working_now";
      if (ps.missing_clock_out) return "missing_clock_out";
    }
    return "late";
  }
  if (ps.status === "early_leave") return "early_leave";
  if (ps.status === "completed" || ps.status === "on_time") return "completed";
  if (ps.actual_clock_in && !ps.actual_clock_out) {
    if (isToday && (endGraceMs == null || nowMs <= endGraceMs)) return "working_now";
    return "missing_clock_out";
  }
  if (!ps.actual_clock_in) {
    if (isToday && startMs != null && nowMs < startMs) return "upcoming";
    return "missing_clock_in";
  }
  return "completed";
}

function dayStatusPriority(code: EmployeeDayStatusCode): number {
  switch (code) {
    case "missing_clock_out":
      return 100;
    case "missing_clock_in":
      return 90;
    case "absent":
      return 80;
    case "pending_correction":
      return 70;
    case "late":
      return 60;
    case "early_leave":
      return 55;
    case "partial_attendance":
      return 50;
    case "working_now":
      return 40;
    case "correction_approved":
      return 30;
    case "completed":
      return 20;
    case "on_time":
      return 15;
    case "upcoming":
      return 5;
    case "off_day":
    case "no_schedule":
    default:
      return 0;
  }
}

function pickDayStatus(codes: EmployeeDayStatusCode[]): EmployeeDayStatusCode {
  if (codes.length === 0) return "no_schedule";
  return [...codes].sort((a, b) => dayStatusPriority(b) - dayStatusPriority(a))[0]!;
}

function hhmmLabel(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = String(v).trim();
  return s.length >= 5 ? s.slice(0, 5) : s || null;
}

function correctionsForDay(
  dayYmd: string,
  forgot: ForgotPunchHistoryRow[],
): EmployeeAttendanceDay["correction"] {
  const dayRows = forgot.filter((r) => malaysiaDateYmd(new Date(r.requested_time)) === dayYmd);
  const pending = dayRows.filter((r) => r.status === "pending");
  const approved = dayRows.filter((r) => r.status === "approved");
  return {
    pending: pending.length > 0,
    approved: approved.length > 0 && pending.length === 0,
    pending_types: pending.map((r) => r.request_type),
  };
}

export function buildEmployeeAttendanceHistory(params: {
  from: string;
  to: string;
  attendance: AttendanceRecord[];
  schedulesByDate: Map<string, StaffScheduleRow[]>;
  forgotRequests?: ForgotPunchHistoryRow[];
  payrollMode?: PayrollMode;
  nowMs?: number;
  shopIdFilter?: string | null;
}): { days: EmployeeAttendanceDay[]; summary: EmployeeAttendanceSummary } {
  const nowMs = params.nowMs ?? Date.now();
  const todayYmd = malaysiaDateYmd(new Date(nowMs));
  const payrollMode = params.payrollMode ?? "scheduled_hours";
  const forgot = params.forgotRequests ?? [];
  const days: EmployeeAttendanceDay[] = [];

  for (const ymd of eachYmdInclusive(params.from, params.to).reverse()) {
    const isFuture = ymd > todayYmd;
    const isToday = ymd === todayYmd;
    const dayRows = params.attendance.filter((r) => matchesEventDate(r, ymd));
    let schedules = params.schedulesByDate.get(ymd) ?? [];
    if (params.shopIdFilter) {
      schedules = schedules.filter((s) => s.shop_id === params.shopIdFilter);
    }
    const working = schedules.filter(
      (s) => s.status === "active" && !s.is_off_day && s.start_time && s.end_time,
    );
    const offDay = schedules.some((s) => s.is_off_day);
    const correction = correctionsForDay(ymd, forgot);

    if (working.length === 0) {
      const totals = attendanceForTotals(dayRows);
      const hours = computeWorkHoursWithBreaks(totals);
      const fi = firstClockIn(totals);
      const lo = lastClockOut(totals);
      const hasPunches = dayRows.length > 0;
      let day_status: EmployeeDayStatusCode = offDay
        ? "off_day"
        : hasPunches
          ? "completed"
          : "no_schedule";
      if (correction.pending) day_status = "pending_correction";
      else if (correction.approved && hasPunches) day_status = "correction_approved";

      days.push({
        date: ymd,
        day_status,
        scheduled_label: null,
        scheduled_lines: [],
        first_clock_in: fi ? hhmmLabel(recordEventTime(fi)) : null,
        last_clock_out: lo ? hhmmLabel(recordEventTime(lo)) : null,
        recorded_hours_ms: hours.workedMs,
        recorded_hours_label: formatDuration(hours.workedMs),
        payroll_hours_ms: 0,
        payroll_hours_label: formatDuration(0),
        sessions: [],
        correction,
        can_request_correction: false,
        suggested_correction_type: null,
      });
      continue;
    }

    if (isFuture) {
      const lines = working.map(
        (s) => `${hhmmLabel(s.start_time)}–${hhmmLabel(s.end_time)}`,
      );
      days.push({
        date: ymd,
        day_status: "upcoming",
        scheduled_label: lines.join(" + "),
        scheduled_lines: lines.filter(Boolean) as string[],
        first_clock_in: null,
        last_clock_out: null,
        recorded_hours_ms: 0,
        recorded_hours_label: formatDuration(0),
        payroll_hours_ms: 0,
        payroll_hours_label: formatDuration(0),
        sessions: working.map((s, idx) => ({
          session_index: idx + 1,
          schedule_id: s.id,
          scheduled_start: hhmmLabel(s.start_time),
          scheduled_end: hhmmLabel(s.end_time),
          recorded_in: null,
          recorded_out: null,
          status: "upcoming",
          can_request_clock_in: false,
          can_request_clock_out: false,
        })),
        correction,
        can_request_correction: false,
        suggested_correction_type: null,
      });
      continue;
    }

    const multi = matchMultiShiftDay({
      ymd,
      schedules: working,
      history: dayRows,
      nowMs,
      shopIdFilter: params.shopIdFilter,
    });

    const sessions: EmployeeAttendanceSession[] = multi.per_shift.map((ps, idx) => {
      // Reconstruct window timing roughly from scheduled times for "future shift" gating
      const start = ps.scheduled_start;
      const end = ps.scheduled_end;
      const startMs = start
        ? new Date(`${ymd}T${start}:00+08:00`).getTime()
        : null;
      const endMs = end ? new Date(`${ymd}T${end}:00+08:00`).getTime() : null;
      const endGraceMs = endMs != null ? endMs + 30 * 60_000 : null;
      let status = mapPerShiftStatus(ps, nowMs, startMs, endGraceMs, isToday);

      // No clock-in after shift started → missing_clock_in (not only full absent)
      if (
        status === "absent" &&
        !ps.actual_clock_in &&
        (!isToday || (startMs != null && nowMs >= startMs))
      ) {
        status = "missing_clock_in";
      }

      const can_request_clock_in =
        status === "missing_clock_in" &&
        !correction.pending_types.includes("forgot_clock_in");
      const can_request_clock_out =
        status === "missing_clock_out" &&
        !correction.pending_types.includes("forgot_clock_out");

      return {
        session_index: idx + 1,
        schedule_id: ps.schedule_id,
        scheduled_start: ps.scheduled_start,
        scheduled_end: ps.scheduled_end,
        recorded_in: ps.actual_clock_in,
        recorded_out: ps.actual_clock_out,
        status,
        can_request_clock_in,
        can_request_clock_out,
      };
    });

    let day_status = pickDayStatus(sessions.map((s) => s.status));
    if (correction.pending) day_status = "pending_correction";
    else if (correction.approved && day_status === "completed") {
      day_status = "correction_approved";
    }

    const totals = attendanceForTotals(dayRows);
    const hours = computeWorkHoursWithBreaks(totals);
    const fi = firstClockIn(totals);
    const lo = lastClockOut(totals);
    const scheduledMs = multi.scheduled_hours_ms;
    const paidMs = payrollHoursMs(payrollMode, scheduledMs, hours.workedMs);

    const canIn = sessions.some((s) => s.can_request_clock_in);
    const canOut = sessions.some((s) => s.can_request_clock_out);

    days.push({
      date: ymd,
      day_status,
      scheduled_label: multi.scheduled_label,
      scheduled_lines: multi.scheduled_label_lines,
      first_clock_in:
        fi ? hhmmLabel(recordEventTime(fi)) : hhmmLabel(multi.actual_clock_in),
      last_clock_out:
        lo ? hhmmLabel(recordEventTime(lo)) : hhmmLabel(multi.actual_clock_out),
      recorded_hours_ms: hours.workedMs,
      recorded_hours_label: formatDuration(hours.workedMs),
      payroll_hours_ms: paidMs,
      payroll_hours_label: formatDuration(paidMs),
      sessions,
      correction,
      can_request_correction: canIn || canOut,
      suggested_correction_type: canIn
        ? "forgot_clock_in"
        : canOut
          ? "forgot_clock_out"
          : null,
    });
  }

  const summary = summarizeEmployeeAttendanceDays(days);
  return { days, summary };
}

export function summarizeEmployeeAttendanceDays(
  days: EmployeeAttendanceDay[],
): EmployeeAttendanceSummary {
  let scheduled_working_days = 0;
  let present_days = 0;
  let late_days = 0;
  let missing_punch_days = 0;
  let absent_days = 0;
  let recorded_hours_ms = 0;
  let payroll_hours_ms = 0;

  for (const d of days) {
    const hasSchedule = d.sessions.length > 0 || Boolean(d.scheduled_label);
    if (!hasSchedule || d.day_status === "no_schedule" || d.day_status === "off_day") {
      recorded_hours_ms += d.recorded_hours_ms;
      continue;
    }
    if (d.day_status === "upcoming") continue;

    scheduled_working_days += 1;
    recorded_hours_ms += d.recorded_hours_ms;
    payroll_hours_ms += d.payroll_hours_ms;

    if (
      d.day_status === "missing_clock_in" ||
      d.day_status === "missing_clock_out" ||
      d.day_status === "pending_correction"
    ) {
      missing_punch_days += 1;
    }
    if (d.day_status === "absent") absent_days += 1;
    if (d.day_status === "late") late_days += 1;

    const presentStatuses = new Set<EmployeeDayStatusCode>([
      "on_time",
      "late",
      "working_now",
      "completed",
      "early_leave",
      "partial_attendance",
      "missing_clock_out",
      "pending_correction",
      "correction_approved",
    ]);
    if (presentStatuses.has(d.day_status) || d.first_clock_in) {
      present_days += 1;
    }
  }

  return {
    scheduled_working_days,
    present_days,
    late_days,
    missing_punch_days,
    absent_days,
    recorded_hours_ms,
    recorded_hours_label: formatDuration(recorded_hours_ms),
    payroll_hours_ms,
    payroll_hours_label: formatDuration(payroll_hours_ms),
  };
}

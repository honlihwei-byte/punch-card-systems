import { sortByEventTime, staffHasPunchRows, type AttendanceRecord } from "@/lib/attendance";
import {
  analyzeDayIssuesWithShift,
  type DayIssueStats,
} from "@/lib/attendance-report";
import { matchStaffDayWithShopSchedule } from "@/lib/shop-schedule-resolve";
import { pickPrimaryScheduleForDay } from "@/lib/shifts/schedule-attendance-match";
import { isStaffScheduleWorkingShift } from "@/lib/shifts/schedule-off-day";
import type { StaffScheduleRow } from "@/lib/shifts/staff-schedules-db";
import type { ShopHealthRow } from "@/lib/operations-intelligence";
import { displayTaskStatus } from "@/lib/retail-tasks/task-status";
import type { TaskStatus } from "@/lib/retail-tasks/types";
import type { createAdminClient } from "@/lib/supabase/admin";

type Supabase = ReturnType<typeof createAdminClient>;

type StaffRow = { id: string; staff_name: string; staff_code: string };

export type AttentionEntry = {
  id: string;
  label: string;
  sublabel?: string;
};

export type AttentionAlert = {
  count: number;
  items: AttentionEntry[];
};

export type TodaysAttentionPayload = {
  date: string;
  critical: {
    absent: AttentionAlert;
    missing_clock_out: AttentionAlert;
    overdue_tasks: AttentionAlert;
  };
  warning: {
    late: AttentionAlert;
    forgot_punch: AttentionAlert;
    pending_tasks: AttentionAlert;
  };
  healthy: {
    count: number;
    shops: AttentionEntry[];
  };
};

function emptyAlert(): AttentionAlert {
  return { count: 0, items: [] };
}

function punchStaffIdsToday(punches: AttendanceRecord[], dayYmd: string): Set<string> {
  const ids = new Set<string>();
  for (const p of punches) {
    if (p.event_date?.slice(0, 10) === dayYmd) ids.add(p.staff_id);
  }
  return ids;
}

function buildAbsentToday(
  staff: StaffRow[],
  dayYmd: string,
  punches: AttendanceRecord[],
  schedulesByStaffDay: Map<string, Map<string, StaffScheduleRow[]>>,
  shopNameById: Map<string, string>,
): AttentionEntry[] {
  const punched = punchStaffIdsToday(punches, dayYmd);
  const entries: AttentionEntry[] = [];

  for (const s of staff) {
    if (punched.has(s.id)) continue;
    const schedules = (schedulesByStaffDay.get(s.id)?.get(dayYmd) ?? []).filter((r) =>
      isStaffScheduleWorkingShift(r),
    );
    if (schedules.length === 0) continue;

    const shopLabels = [
      ...new Set(schedules.map((sch) => shopNameById.get(sch.shop_id) ?? sch.shop_id)),
    ];
    entries.push({
      id: s.id,
      label: s.staff_name,
      sublabel: shopLabels.join(", "),
    });
  }

  return entries.sort((a, b) => a.label.localeCompare(b.label));
}

type StaffDayInsight = {
  staff_id: string;
  staff_name: string;
  shop_label: string;
  late_minutes: number;
  issues: DayIssueStats;
};

function buildStaffDayInsights(
  staff: StaffRow[],
  dayYmd: string,
  punches: AttendanceRecord[],
  schedulesByStaffDay: Map<string, Map<string, StaffScheduleRow[]>>,
  shopNameById: Map<string, string>,
): StaffDayInsight[] {
  const byStaff = new Map<string, AttendanceRecord[]>();
  for (const p of punches) {
    if (p.event_date?.slice(0, 10) !== dayYmd) continue;
    const arr = byStaff.get(p.staff_id) ?? [];
    arr.push(p);
    byStaff.set(p.staff_id, arr);
  }

  const staffById = new Map(staff.map((s) => [s.id, s]));
  const rows: StaffDayInsight[] = [];

  for (const s of staff) {
    const dayRows = sortByEventTime(byStaff.get(s.id) ?? []);
    if (!staffHasPunchRows(dayRows)) continue;

    const daySchedules = (schedulesByStaffDay.get(s.id)?.get(dayYmd) ?? []).filter(
      (r) => r.status === "active",
    );
    const explicit = pickPrimaryScheduleForDay({
      schedules: daySchedules,
      dayRows,
      shopIdFilter: null,
    });
    const matched = matchStaffDayWithShopSchedule({
      ymd: dayYmd,
      shop: null,
      explicitRow: explicit,
      explicitRows: daySchedules,
      allSchedulesForDay: daySchedules,
      history: dayRows,
      shopIdFilter: null,
    });
    const issues = analyzeDayIssuesWithShift(dayRows, matched.status);
    const shopIds = [...new Set(dayRows.map((r) => r.shop_id).filter(Boolean))] as string[];
    rows.push({
      staff_id: s.id,
      staff_name: s.staff_name,
      shop_label: shopIds.map((id) => shopNameById.get(id) ?? id).join(", ") || "—",
      late_minutes: matched.late_minutes ?? 0,
      issues,
    });
  }

  return rows;
}

function healthyShops(shopRows: ShopHealthRow[]): AttentionEntry[] {
  return shopRows
    .filter(
      (s) =>
        s.reasons.length === 0 &&
        (s.scheduled_count > 0 || s.present_count > 0 || s.task_count_today > 0),
    )
    .map((s) => ({ id: s.shop_id, label: s.shop_name }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

async function loadForgotPunchPending(
  supabase: Supabase,
  shopIds: string[],
): Promise<AttentionEntry[]> {
  if (shopIds.length === 0) return [];

  const { data, error } = await supabase
    .from("forgot_punch_requests")
    .select("id, staff_id, shop_id, staff:staff_id(staff_name), shop:shop_id(name)")
    .in("shop_id", shopIds)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const staff = r.staff as { staff_name?: string } | null;
    const shop = r.shop as { name?: string } | null;
    return {
      id: String(r.id),
      label: staff?.staff_name ?? String(r.staff_id),
      sublabel: shop?.name ?? undefined,
    };
  });
}

async function loadTaskAlerts(
  supabase: Supabase,
  companyId: string,
  today: string,
  shopNameById: Map<string, string>,
  staffNameById: Map<string, string>,
): Promise<{ overdue: AttentionEntry[]; pending: AttentionEntry[] }> {
  const { data, error } = await supabase
    .from("retail_tasks")
    .select("id, title, shop_id, assigned_staff_id, due_date, due_time, status")
    .eq("company_id", companyId)
    .lte("due_date", today)
    .in("status", ["pending", "in_progress", "rejected", "overdue"]);
  if (error) throw new Error(error.message);

  const overdue: AttentionEntry[] = [];
  const pending: AttentionEntry[] = [];

  for (const row of data ?? []) {
    const status = String(row.status) as TaskStatus;
    const dueDate = String(row.due_date);
    const dueTime = row.due_time != null ? String(row.due_time).slice(0, 5) : null;
    const display = displayTaskStatus(status, dueDate, dueTime);
    const shopName = shopNameById.get(String(row.shop_id)) ?? "Shop";
    const assignee = row.assigned_staff_id
      ? staffNameById.get(String(row.assigned_staff_id))
      : null;
    const sublabel = assignee ? `${shopName} · ${assignee}` : shopName;
    const entry: AttentionEntry = {
      id: String(row.id),
      label: String(row.title ?? "Task"),
      sublabel,
    };

    if (display === "overdue") {
      overdue.push(entry);
    } else if (dueDate === today && ["pending", "in_progress", "rejected"].includes(status)) {
      pending.push(entry);
    }
  }

  overdue.sort((a, b) => a.label.localeCompare(b.label));
  pending.sort((a, b) => a.label.localeCompare(b.label));
  return { overdue, pending };
}

export async function buildTodaysAttention(params: {
  supabase: Supabase;
  companyId: string;
  companyShopIds: string[];
  today: string;
  staff: StaffRow[];
  dayPunches: AttendanceRecord[];
  schedulesByStaffDay: Map<string, Map<string, StaffScheduleRow[]>>;
  shopNameById: Map<string, string>;
  todayShopRows: ShopHealthRow[];
}): Promise<TodaysAttentionPayload> {
  const {
    supabase,
    companyId,
    companyShopIds,
    today,
    staff,
    dayPunches,
    schedulesByStaffDay,
    shopNameById,
    todayShopRows,
  } = params;

  const staffNameById = new Map(staff.map((s) => [s.id, s.staff_name]));
  const dayInsights = buildStaffDayInsights(
    staff,
    today,
    dayPunches,
    schedulesByStaffDay,
    shopNameById,
  );

  const absentItems = buildAbsentToday(
    staff,
    today,
    dayPunches,
    schedulesByStaffDay,
    shopNameById,
  );
  const lateItems = dayInsights
    .filter((r) => r.late_minutes > 0)
    .map((r) => ({
      id: r.staff_id,
      label: r.staff_name,
      sublabel: r.shop_label,
    }));
  const missingOutItems = dayInsights
    .filter((r) => r.issues.missing_clock_out)
    .map((r) => ({
      id: r.staff_id,
      label: r.staff_name,
      sublabel: r.shop_label,
    }));

  let forgotItems: AttentionEntry[] = [];
  let overdueItems: AttentionEntry[] = [];
  let pendingItems: AttentionEntry[] = [];

  try {
    forgotItems = await loadForgotPunchPending(supabase, companyShopIds);
  } catch (e) {
    console.warn("[todays-attention] forgot punch load failed", e);
  }

  try {
    const tasks = await loadTaskAlerts(
      supabase,
      companyId,
      today,
      shopNameById,
      staffNameById,
    );
    overdueItems = tasks.overdue;
    pendingItems = tasks.pending;
  } catch (e) {
    console.warn("[todays-attention] task alerts load failed", e);
  }

  const healthyShopItems = healthyShops(todayShopRows);

  return {
    date: today,
    critical: {
      absent: { count: absentItems.length, items: absentItems.slice(0, 12) },
      missing_clock_out: { count: missingOutItems.length, items: missingOutItems.slice(0, 12) },
      overdue_tasks: { count: overdueItems.length, items: overdueItems.slice(0, 12) },
    },
    warning: {
      late: { count: lateItems.length, items: lateItems.slice(0, 12) },
      forgot_punch: { count: forgotItems.length, items: forgotItems.slice(0, 12) },
      pending_tasks: { count: pendingItems.length, items: pendingItems.slice(0, 12) },
    },
    healthy: {
      count: healthyShopItems.length,
      shops: healthyShopItems.slice(0, 12),
    },
  };
}

import { sortByEventTime, staffHasPunchRows, type AttendanceRecord } from "@/lib/attendance";
import { fetchAttendanceForDay } from "@/lib/attendance-db";
import {
  analyzeDayIssuesWithShift,
} from "@/lib/attendance-report";
import { fetchCompanyById } from "@/lib/company-db";
import { matchStaffDayWithShopSchedule } from "@/lib/shop-schedule-resolve";
import { pickPrimaryScheduleForDay } from "@/lib/shifts/schedule-attendance-match";
import { isStaffScheduleWorkingShift } from "@/lib/shifts/schedule-off-day";
import { loadSchedulesForStaffIdsInRange, type StaffScheduleRow } from "@/lib/shifts/staff-schedules-db";
import { computeShopHealthRows } from "@/lib/operations-intelligence";
import type { createAdminClient } from "@/lib/supabase/admin";
import { getCleaningStatsByShop } from "./cleaning-stats";
import type { DailyReportPayload, DailyReportSettingsRow, DailyReportShopSection } from "./types";

type Supabase = ReturnType<typeof createAdminClient>;

type StaffRow = { id: string; staff_name: string; staff_code: string };

function punchStaffIdsToday(punches: AttendanceRecord[], dayYmd: string): Set<string> {
  const ids = new Set<string>();
  for (const p of punches) {
    if (p.event_date?.slice(0, 10) === dayYmd) ids.add(p.staff_id);
  }
  return ids;
}

type StaffDayInsight = {
  staff_id: string;
  staff_name: string;
  shop_id: string;
  late_minutes: number;
  missing_clock_out: boolean;
};

function buildStaffDayInsightsByShop(
  staff: StaffRow[],
  dayYmd: string,
  punches: AttendanceRecord[],
  schedulesByStaffDay: Map<string, Map<string, StaffScheduleRow[]>>,
): StaffDayInsight[] {
  const byStaff = new Map<string, AttendanceRecord[]>();
  for (const p of punches) {
    if (p.event_date?.slice(0, 10) !== dayYmd) continue;
    const arr = byStaff.get(p.staff_id) ?? [];
    arr.push(p);
    byStaff.set(p.staff_id, arr);
  }

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
    const shopId =
      explicit?.shop_id ??
      daySchedules[0]?.shop_id ??
      dayRows.find((r) => r.shop_id)?.shop_id ??
      "";

    rows.push({
      staff_id: s.id,
      staff_name: s.staff_name,
      shop_id: shopId,
      late_minutes: matched.late_minutes ?? 0,
      missing_clock_out: issues.missing_clock_out,
    });
  }

  return rows;
}

function buildNeverClockedInByShop(
  staff: StaffRow[],
  dayYmd: string,
  punches: AttendanceRecord[],
  schedulesByStaffDay: Map<string, Map<string, StaffScheduleRow[]>>,
): Map<string, Array<{ name: string }>> {
  const punched = punchStaffIdsToday(punches, dayYmd);
  const byShop = new Map<string, Array<{ name: string }>>();

  for (const s of staff) {
    if (punched.has(s.id)) continue;
    const schedules = (schedulesByStaffDay.get(s.id)?.get(dayYmd) ?? []).filter((r) =>
      isStaffScheduleWorkingShift(r),
    );
    for (const sched of schedules) {
      const list = byShop.get(sched.shop_id) ?? [];
      list.push({ name: s.staff_name });
      byShop.set(sched.shop_id, list);
    }
  }

  for (const [shopId, list] of byShop) {
    list.sort((a, b) => a.name.localeCompare(b.name));
    byShop.set(shopId, list);
  }
  return byShop;
}

function resolveShopIds(
  settings: Pick<DailyReportSettingsRow, "shop_ids">,
  companyShopIds: string[],
): string[] {
  if (settings.shop_ids.length === 0) return companyShopIds;
  const allowed = new Set(companyShopIds);
  return settings.shop_ids.filter((id) => allowed.has(id));
}

export async function buildDailyReport(params: {
  supabase: Supabase;
  companyId: string;
  companyShopIds: string[];
  reportDate: string;
  settings: Pick<
    DailyReportSettingsRow,
    "shop_ids" | "include_attendance" | "include_cleaning"
  >;
}): Promise<DailyReportPayload> {
  const { supabase, companyId, companyShopIds, reportDate, settings } = params;
  const shopIds = resolveShopIds(settings, companyShopIds);

  const company = await fetchCompanyById(supabase, companyId);
  const companyName = company?.name ?? "Company";

  const { data: shopRows, error: shopErr } = await supabase
    .from("shops")
    .select("id, name")
    .eq("company_id", companyId)
    .in("id", shopIds.length > 0 ? shopIds : companyShopIds)
    .order("name");
  if (shopErr) throw new Error(shopErr.message);

  const shops = (shopRows ?? []).map((s) => ({
    id: String((s as { id: string }).id),
    name: String((s as { name: string }).name),
  }));
  const selectedShopIds = shops.map((s) => s.id);

  const { data: staffData, error: staffErr } = await supabase
    .from("staff")
    .select("id, staff_name, staff_code")
    .eq("company_id", companyId)
    .eq("active", true);
  if (staffErr) throw new Error(staffErr.message);

  const staff = (staffData ?? []).map((s) => {
    const r = s as { id: string; staff_name: string; staff_code: string };
    return { id: r.id, staff_name: r.staff_name, staff_code: r.staff_code };
  });
  const staffIds = staff.map((s) => s.id);

  const dayPunches = await fetchAttendanceForDay(
    supabase,
    reportDate,
    null,
    selectedShopIds.length > 0 ? selectedShopIds : companyShopIds,
  );

  const schedulesByStaffDay =
    staffIds.length > 0
      ? await loadSchedulesForStaffIdsInRange(supabase, {
          staffIds,
          from: reportDate,
          to: reportDate,
        })
      : new Map<string, Map<string, StaffScheduleRow[]>>();

  const emptyTaskMap = new Map();
  const healthRows = settings.include_attendance
    ? computeShopHealthRows({
        shops,
        staff,
        dayYmd: reportDate,
        punches: dayPunches,
        schedulesByStaffDay,
        taskByShop: emptyTaskMap,
      })
    : [];

  const healthByShop = new Map(healthRows.map((r) => [r.shop_id, r]));

  const dayInsights = settings.include_attendance
    ? buildStaffDayInsightsByShop(staff, reportDate, dayPunches, schedulesByStaffDay)
    : [];

  const neverClockedByShop = settings.include_attendance
    ? buildNeverClockedInByShop(staff, reportDate, dayPunches, schedulesByStaffDay)
    : new Map<string, Array<{ name: string }>>();

  const cleaningByShop = settings.include_cleaning
    ? await getCleaningStatsByShop(supabase, companyId, selectedShopIds, reportDate)
    : new Map();

  const shopSections: DailyReportShopSection[] = shops.map((shop) => {
    const section: DailyReportShopSection = {
      shop_id: shop.id,
      shop_name: shop.name,
    };

    if (settings.include_attendance) {
      const health = healthByShop.get(shop.id);
      const shopLate = dayInsights
        .filter((r) => r.shop_id === shop.id && r.late_minutes > 0)
        .map((r) => ({
          name: r.staff_name,
          detail: String(r.late_minutes),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      const shopMissingOut = dayInsights
        .filter((r) => r.shop_id === shop.id && r.missing_clock_out)
        .map((r) => ({ name: r.staff_name }))
        .sort((a, b) => a.name.localeCompare(b.name));

      const neverClocked = (neverClockedByShop.get(shop.id) ?? []).map((r) => ({
        name: r.name,
      }));

      section.attendance = {
        present_count: health?.present_count ?? 0,
        late: shopLate,
        missing_clock_out: shopMissingOut,
        never_clocked_in: neverClocked,
      };
    }

    if (settings.include_cleaning) {
      const cleaning = cleaningByShop.get(shop.id) ?? {
        assigned: 0,
        completed: 0,
        incomplete: 0,
        missing_photo_uploads: 0,
      };
      section.cleaning = cleaning;
    }

    return section;
  });

  let overallPresent = 0;
  let overallLate = 0;
  let overallMissingOut = 0;
  let cleaningCompleted = 0;
  let cleaningTotal = 0;

  for (const s of shopSections) {
    if (s.attendance) {
      overallPresent += s.attendance.present_count;
      overallLate += s.attendance.late.length;
      overallMissingOut += s.attendance.missing_clock_out.length;
    }
    if (s.cleaning) {
      cleaningCompleted += s.cleaning.completed;
      cleaningTotal += s.cleaning.assigned;
    }
  }

  return {
    date: reportDate,
    company_name: companyName,
    shops: shopSections,
    overall: {
      present: overallPresent,
      late: overallLate,
      missing_clock_out: overallMissingOut,
      cleaning_completed: cleaningCompleted,
      cleaning_total: cleaningTotal,
    },
    include_attendance: settings.include_attendance,
    include_cleaning: settings.include_cleaning,
  };
}

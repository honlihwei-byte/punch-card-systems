import { NextResponse } from "next/server";
import { addDaysYmd, shopNamesVisited, type AttendanceRecord } from "@/lib/attendance";
import { fetchAttendanceForDay, fetchAttendanceInRange } from "@/lib/attendance-db";
import {
  blockSuperAdminFromOps,
  isNextResponse,
  requireCompanyAdmin,
} from "@/lib/admin-api-auth";
import { companyFeatureAccess, getSubscriptionForCompany } from "@/lib/billing";
import { fetchCompanyById, shopIdsForCompany } from "@/lib/company-db";
import { malaysiaDateYmd } from "@/lib/malaysia-time";
import { staffReliabilityDateRange } from "@/lib/staff-reliability";
import {
  aggregateTodayRisks,
  buildDayStaffAttention,
  computeMostImprovedShops,
  computeShopHealthRows,
  computeStaffReliabilityRows,
  computeWorkloadInsights,
  type ShopHealthRow,
  type ShopTaskCounts,
} from "@/lib/operations-intelligence";
import {
  loadOperationsIntelligenceSchemaReport,
  safeGetAverageFinalTaskScoresByStaff,
  safeGetRejectedProofCountsByStaff,
  safeGetTaskReviewCountsByStaff,
  safeGetTaskShopStatsForDates,
} from "@/lib/operations-intelligence-queries";
import {
  logOpsWidgetFailure,
  runSafeWidget,
  type OpsWidgetWarning,
} from "@/lib/operations-intelligence-schema";
import { loadSchedulesForStaffIdsInRange, type StaffScheduleRow } from "@/lib/shifts/staff-schedules-db";
import {
  getOperationsDashboardCache,
  operationsDashboardCacheKey,
  setOperationsDashboardCache,
} from "@/lib/operations-dashboard-cache";
import { buildTodaysAttention } from "@/lib/todays-attention";
import { endDevTimer, startDevTimer } from "@/lib/performance-timing";
import { createAdminClient } from "@/lib/supabase/admin";

type StaffRow = {
  id: string;
  staff_name: string;
  staff_code: string;
};

function punchesForDay(all: AttendanceRecord[], ymd: string): AttendanceRecord[] {
  return all.filter((p) => p.event_date?.slice(0, 10) === ymd);
}

function taskMapForDay(
  taskByDate: Map<string, Map<string, ShopTaskCounts>>,
  ymd: string,
  shopIds: string[],
): Map<string, ShopTaskCounts> {
  const dayMap = taskByDate.get(ymd) ?? new Map<string, ShopTaskCounts>();
  const result = new Map<string, ShopTaskCounts>();
  for (const shopId of shopIds) {
    result.set(shopId, dayMap.get(shopId) ?? { task_count: 0, overdue: 0, exceptions: 0 });
  }
  return result;
}

const EMPTY_RESPONSE = {
  risks: {
    late_count: 0,
    missing_clock_out_count: 0,
    gps_issues_count: 0,
    review_required_count: 0,
    overdue_tasks_count: 0,
    task_exceptions_count: 0,
  },
  shops: [],
  staff_reliable: [],
  staff_needs_attention: [],
  most_improved: { has_enough_data: false, shops: [] },
  workload: { performing_well: [], needs_support: [] },
  warnings: [] as OpsWidgetWarning[],
  schema_audit: null as Awaited<ReturnType<typeof loadOperationsIntelligenceSchemaReport>> | null,
};

export async function GET(req: Request) {
  const session = requireCompanyAdmin(req);
  if (isNextResponse(session)) return session;
  const opsBlock = blockSuperAdminFromOps(session);
  if (opsBlock) return opsBlock;

  const companyId = session.companyId!;
  const warnings: OpsWidgetWarning[] = [];
  const view = new URL(req.url).searchParams.get("view") ?? "full";
  const isSummary = view === "summary";
  const isAnalytics = view === "analytics";
  const isFull = !isSummary && !isAnalytics;

  startDevTimer("dashboard_total");
  const cacheKey = operationsDashboardCacheKey(companyId, view);
  const cached = getOperationsDashboardCache<Record<string, unknown>>(cacheKey);
  if (cached) {
    endDevTimer("dashboard_total");
    return NextResponse.json(cached);
  }

  try {
    const supabase = createAdminClient();
    const company = await fetchCompanyById(supabase, companyId);
    if (company) {
      const sub = await getSubscriptionForCompany(supabase, company);
      if (companyFeatureAccess(company, sub) !== "full") {
        return NextResponse.json(
          {
            error: "Subscription required.",
            code: "SUBSCRIPTION_REQUIRED",
            redirect: "/subscription-required",
          },
          { status: 402 },
        );
      }
    }

    const schema_audit = isFull
      ? await loadOperationsIntelligenceSchemaReport(supabase).catch((error) => {
          console.warn("[operations-intelligence] schema audit failed", error);
          return null;
        })
      : null;

    const today = malaysiaDateYmd(new Date());
    const { from: reliabilityFrom, to: reliabilityTo } = staffReliabilityDateRange();
    const fourteenDaysAgo = addDaysYmd(today, -13);

    const historicalDates: string[] = [];
    for (let i = 13; i >= 0; i--) {
      historicalDates.push(addDaysYmd(today, -i));
    }

    const companyShopIds = await shopIdsForCompany(supabase, companyId);
    if (companyShopIds.length === 0) {
      const emptyPayload = {
        date: today,
        summary: {
          average_shop_health: null,
          today_risks_total: 0,
          staff_needing_attention: 0,
          most_improved_shop_name: null,
        },
        ...EMPTY_RESPONSE,
        schema_audit,
      };
      endDevTimer("dashboard_total");
      return NextResponse.json(emptyPayload);
    }

    const shopsResult = await runSafeWidget(
      "shop_health",
      "shops.select(id, name)",
      async () => {
        const { data: shopRows, error } = await supabase
          .from("shops")
          .select("id, name")
          .in("id", companyShopIds)
          .order("name", { ascending: true });
        if (error) throw new Error(error.message);
        return (shopRows ?? []).map((s) => ({
          id: String(s.id),
          name: String(s.name ?? "Shop"),
        }));
      },
      [] as Array<{ id: string; name: string }>,
    );
    if (shopsResult.warning) warnings.push(shopsResult.warning);
    const shops = shopsResult.data;
    const shopNameById = new Map(shops.map((s) => [s.id, s.name]));

    const staffResult = await runSafeWidget(
      "shop_health",
      "staff.select(id, staff_name, staff_code)",
      async () => {
        const { data: staffData, error: staffErr } = await supabase
          .from("staff")
          .select("id, staff_name, staff_code")
          .eq("company_id", companyId)
          .eq("status", "active")
          .order("staff_name", { ascending: true });
        if (staffErr) throw new Error(staffErr.message);
        return (staffData ?? []) as StaffRow[];
      },
      [] as StaffRow[],
    );
    if (staffResult.warning) warnings.push(staffResult.warning);
    const staff = staffResult.data;
    const staffIds = staff.map((s) => s.id);

    const attendanceResult = await runSafeWidget(
      "shop_health",
      "attendance (today + 14d range)",
      async () => {
        startDevTimer("operations_summary");
        const dayPunches = await fetchAttendanceForDay(supabase, today, null, companyShopIds);
        endDevTimer("operations_summary");
        if (isSummary) {
          return {
            dayPunches,
            rangePunches: [] as AttendanceRecord[],
            reliabilityPunches: [] as AttendanceRecord[],
          };
        }
        startDevTimer("staff_reliability");
        const [rangePunches, reliabilityPunches] = await Promise.all([
          staffIds.length > 0
            ? fetchAttendanceInRange(supabase, fourteenDaysAgo, today, null, companyShopIds)
            : Promise.resolve([]),
          staffIds.length > 0
            ? fetchAttendanceInRange(supabase, reliabilityFrom, reliabilityTo, null, companyShopIds)
            : Promise.resolve([]),
        ]);
        endDevTimer("staff_reliability");
        return { dayPunches, rangePunches, reliabilityPunches };
      },
      {
        dayPunches: [] as AttendanceRecord[],
        rangePunches: [] as AttendanceRecord[],
        reliabilityPunches: [] as AttendanceRecord[],
      },
    );
    if (attendanceResult.warning) warnings.push(attendanceResult.warning);
    const { dayPunches, rangePunches, reliabilityPunches } = attendanceResult.data;

    const schedulesResult = await runSafeWidget(
      "shop_health",
      "staff_schedules (30d reliability + 14d health)",
      async () => {
        if (staffIds.length === 0) {
          return new Map<string, Map<string, StaffScheduleRow[]>>();
        }
        if (isSummary) {
          return loadSchedulesForStaffIdsInRange(supabase, {
            staffIds,
            from: today,
            to: today,
          });
        }
        const [schedules14, schedulesReliability] = await Promise.all([
          loadSchedulesForStaffIdsInRange(supabase, {
            staffIds,
            from: fourteenDaysAgo,
            to: today,
          }),
          loadSchedulesForStaffIdsInRange(supabase, {
            staffIds,
            from: reliabilityFrom,
            to: reliabilityTo,
          }),
        ]);
        const merged = new Map(schedulesReliability);
        for (const [staffId, days] of schedules14) {
          const existing = merged.get(staffId) ?? new Map<string, StaffScheduleRow[]>();
          for (const [ymd, rows] of days) {
            if (!existing.has(ymd)) existing.set(ymd, rows);
          }
          merged.set(staffId, existing);
        }
        return merged;
      },
      new Map<string, Map<string, StaffScheduleRow[]>>(),
    );
    if (schedulesResult.warning) warnings.push(schedulesResult.warning);
    const schedulesRange = schedulesResult.data;

    const taskDates = isSummary ? [today] : historicalDates;
    startDevTimer("task_metrics");
    const taskStatsResult = await safeGetTaskShopStatsForDates(supabase, companyId, taskDates);
    endDevTimer("task_metrics");
    if (taskStatsResult.warning) warnings.push(taskStatsResult.warning);
    const taskByDate = taskStatsResult.data;

    const rejectedByStaff = new Map<string, number>();
    const taskReviewsByStaff = new Map<
      string,
      import("@/lib/retail-tasks/retail-tasks-db").StaffTaskReviewCounts
    >();
    const avgFinalTaskScoresByStaff = new Map<string, number>();
    if (!isSummary) {
      const sinceIso = `${reliabilityFrom}T00:00:00+08:00`;
      const [reviewResult, avgScoreResult] = await Promise.all([
        safeGetTaskReviewCountsByStaff(supabase, companyId, sinceIso),
        safeGetAverageFinalTaskScoresByStaff(supabase, companyId, sinceIso),
      ]);
      if (reviewResult.warning) warnings.push(reviewResult.warning);
      if (avgScoreResult.warning) warnings.push(avgScoreResult.warning);
      for (const [k, v] of reviewResult.counts) {
        taskReviewsByStaff.set(k, v);
        rejectedByStaff.set(k, v.rejected);
      }
      for (const [k, v] of avgScoreResult.scores) {
        avgFinalTaskScoresByStaff.set(k, v);
      }
    }

    type WorkloadShop = {
      shop_id: string;
      shop_name: string;
      health_score: number;
      task_count_today: number;
      scheduled_count: number;
      exception_count: number;
    };

    let todayShopRows: ShopHealthRow[] = [];
    let risks = EMPTY_RESPONSE.risks;
    let todayDayStaff: ReturnType<typeof buildDayStaffAttention> = [];
    let staff_reliable: ReturnType<typeof computeStaffReliabilityRows> = [];
    let staff_needs_attention: Array<{
      staff_id: string;
      staff_name: string;
      shop_label: string;
      reliability_score: number | null;
      today_reasons: string[];
    }> = [];
    let mostImproved = {
      hasEnoughData: false,
      shops: [] as Array<{
        shop_id: string;
        shop_name: string;
        current_avg: number;
        previous_avg: number;
        improvement: number;
      }>,
    };
    let workload: { performing_well: WorkloadShop[]; needs_support: WorkloadShop[] } = {
      performing_well: [],
      needs_support: [],
    };

    try {
      startDevTimer("shop_health");
      const todayTaskByShop = taskMapForDay(taskByDate, today, companyShopIds);
      todayShopRows = computeShopHealthRows({
        shops,
        staff,
        dayYmd: today,
        punches: dayPunches,
        schedulesByStaffDay: schedulesRange,
        taskByShop: todayTaskByShop,
      });

      risks = aggregateTodayRisks(staff, today, dayPunches, schedulesRange, todayShopRows);

      todayDayStaff = buildDayStaffAttention(
        staff,
        today,
        dayPunches,
        schedulesRange,
        shopNameById,
      );
      endDevTimer("shop_health");
    } catch (error) {
      endDevTimer("shop_health");
      warnings.push(
        logOpsWidgetFailure({
          widget: "shop_health",
          query: "computeShopHealthRows + buildDayStaffAttention",
          error,
        }),
      );
    }

    if (isSummary) {
      const average_shop_health =
        todayShopRows.length > 0
          ? Math.round(
              todayShopRows.reduce((sum, s) => sum + s.health_score, 0) / todayShopRows.length,
            )
          : null;
      const today_risks_total =
        risks.late_count +
        risks.missing_clock_out_count +
        risks.gps_issues_count +
        risks.review_required_count +
        risks.overdue_tasks_count +
        risks.task_exceptions_count;
      const todays_attention = await buildTodaysAttention({
        supabase,
        companyId,
        companyShopIds,
        today,
        staff,
        dayPunches,
        schedulesByStaffDay: schedulesRange,
        shopNameById,
        todayShopRows,
      });

      const summaryPayload = {
        view: "summary",
        date: today,
        summary: {
          average_shop_health,
          today_risks_total,
          staff_needing_attention: todayDayStaff.length,
          most_improved_shop_name: null,
        },
        todays_attention,
        risks,
        shops: todayShopRows.map((s) => ({
          shop_id: s.shop_id,
          shop_name: s.shop_name,
          present_count: s.present_count,
          scheduled_count: s.scheduled_count,
          health_score: s.health_score,
          status: s.status,
          reasons: s.reasons,
          task_count_today: s.task_count_today,
        })),
        staff_reliable: [],
        staff_needs_attention: [],
        most_improved: { has_enough_data: false, shops: [] },
        workload: { performing_well: [], needs_support: [] },
        warnings: dedupeWarnings(warnings),
      };
      setOperationsDashboardCache(cacheKey, summaryPayload);
      endDevTimer("dashboard_total");
      return NextResponse.json(summaryPayload);
    }

    try {
      const reliabilityRows = computeStaffReliabilityRows({
        staff,
        punches: reliabilityPunches,
        schedulesByStaffDay: schedulesRange,
        rejectedProofsByStaff: rejectedByStaff,
        taskReviewsByStaff,
        avgFinalTaskScoresByStaff,
        shopNamesFromPunches: shopNamesVisited,
      });

      staff_reliable = [...reliabilityRows]
        .filter((r) => r.score_available && r.reliability_score != null)
        .sort((a, b) => b.reliability_score! - a.reliability_score!)
        .slice(0, 5);

      const lowReliability = [...reliabilityRows]
        .filter((r) => r.score_available && r.reliability_score != null && r.reliability_score < 75)
        .sort((a, b) => a.reliability_score! - b.reliability_score!)
        .slice(0, 8);

      staff_needs_attention =
        lowReliability.length > 0
          ? lowReliability.map((r) => ({
              staff_id: r.staff_id,
              staff_name: r.staff_name,
              shop_label: r.shop_label,
              reliability_score: r.reliability_score,
              today_reasons: todayDayStaff.find((a) => a.staff_id === r.staff_id)?.reasons ?? [],
            }))
          : todayDayStaff.slice(0, 8).map((row) => {
              const rel = reliabilityRows.find((r) => r.staff_id === row.staff_id);
              return {
                staff_id: row.staff_id,
                staff_name: row.staff_name,
                shop_label: row.shop_label,
                reliability_score: rel?.reliability_score ?? null,
                today_reasons: row.reasons,
              };
            });
    } catch (error) {
      warnings.push(
        logOpsWidgetFailure({
          widget: "staff_reliability",
          query: "computeStaffReliabilityRows",
          error,
        }),
      );
    }

    try {
      const dailyScoresByShop = new Map<string, number[]>();
      for (const ymd of historicalDates) {
        const dayPunchesForDate = punchesForDay(rangePunches, ymd);
        const taskMap = taskMapForDay(taskByDate, ymd, companyShopIds);
        const dayShops = computeShopHealthRows({
          shops,
          staff,
          dayYmd: ymd,
          punches: dayPunchesForDate,
          schedulesByStaffDay: schedulesRange,
          taskByShop: taskMap,
        });
        for (const row of dayShops) {
          const arr = dailyScoresByShop.get(row.shop_id) ?? [];
          arr.push(row.health_score);
          dailyScoresByShop.set(row.shop_id, arr);
        }
      }
      mostImproved = computeMostImprovedShops(shops, dailyScoresByShop, 7, 7);
    } catch (error) {
      warnings.push(
        logOpsWidgetFailure({
          widget: "most_improved",
          query: "computeMostImprovedShops (14d health history)",
          error,
        }),
      );
    }

    try {
      workload = computeWorkloadInsights(todayShopRows);
    } catch (error) {
      warnings.push(
        logOpsWidgetFailure({
          widget: "workload_insights",
          query: "computeWorkloadInsights",
          error,
        }),
      );
    }

    const average_shop_health =
      todayShopRows.length > 0
        ? Math.round(
            todayShopRows.reduce((sum, s) => sum + s.health_score, 0) / todayShopRows.length,
          )
        : null;

    const today_risks_total =
      risks.late_count +
      risks.missing_clock_out_count +
      risks.gps_issues_count +
      risks.review_required_count +
      risks.overdue_tasks_count +
      risks.task_exceptions_count;

    const dedupedWarnings = dedupeWarnings(warnings);

    if (dedupedWarnings.length > 0) {
      console.warn("[operations-intelligence] partial dashboard load", {
        warning_count: dedupedWarnings.length,
        widgets: dedupedWarnings.map((w) => w.widget),
      });
    }

    const fullPayload = {
      view: isAnalytics ? "analytics" : "full",
      date: today,
      summary: {
        average_shop_health,
        today_risks_total,
        staff_needing_attention: staff_needs_attention.length,
        most_improved_shop_name: mostImproved.shops[0]?.shop_name ?? null,
      },
      risks,
      shops: todayShopRows.map((s) => ({
        shop_id: s.shop_id,
        shop_name: s.shop_name,
        present_count: s.present_count,
        scheduled_count: s.scheduled_count,
        health_score: s.health_score,
        status: s.status,
        reasons: s.reasons,
        task_count_today: s.task_count_today,
      })),
      staff_reliable: staff_reliable.map((r) => ({
        staff_id: r.staff_id,
        staff_name: r.staff_name,
        shop_label: r.shop_label,
        reliability_score: r.reliability_score,
        score_available: r.score_available,
      })),
      staff_needs_attention,
      most_improved: {
        has_enough_data: mostImproved.hasEnoughData,
        shops: mostImproved.shops,
      },
      workload,
      warnings: dedupedWarnings,
      schema_audit,
    };

    const responsePayload = isAnalytics
      ? {
          view: "analytics",
          date: today,
          summary: fullPayload.summary,
          staff_reliable: fullPayload.staff_reliable,
          staff_needs_attention: fullPayload.staff_needs_attention,
          most_improved: fullPayload.most_improved,
          workload: fullPayload.workload,
          warnings: fullPayload.warnings,
        }
      : fullPayload;

    setOperationsDashboardCache(cacheKey, responsePayload);
    endDevTimer("dashboard_total");
    return NextResponse.json(responsePayload);
  } catch (e) {
    endDevTimer("dashboard_total");
    console.error("[operations-intelligence] fatal dashboard error", e);
    return NextResponse.json({
      date: malaysiaDateYmd(new Date()),
      summary: {
        average_shop_health: null,
        today_risks_total: 0,
        staff_needing_attention: 0,
        most_improved_shop_name: null,
      },
      ...EMPTY_RESPONSE,
      warnings: [
        logOpsWidgetFailure({
          widget: "shop_health",
          query: "operations-dashboard GET",
          error: e,
        }),
      ],
    });
  }
}

function dedupeWarnings(warnings: OpsWidgetWarning[]): OpsWidgetWarning[] {
  const seen = new Set<string>();
  return warnings.filter((w) => {
    const key = `${w.widget}:${w.missing_column ?? w.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

import { NextResponse } from "next/server";
import { normalizeAttendanceRecord } from "@/lib/attendance-db";
import {
  loadShopForPunch,
  validateStaffForPunch,
} from "@/lib/attendance-punch";
import { employeeSessionFromRequest } from "@/lib/employee-auth";
import {
  buildEmployeeAttendanceHistory,
  resolveAttendanceRange,
  type EmployeeAttendanceRange,
  type ForgotPunchHistoryRow,
} from "@/lib/employee-attendance-history";
import { validatePunchAccess } from "@/lib/punch-access-gate";
import { malaysiaDateYmd } from "@/lib/malaysia-time";
import { normalizePayrollMode } from "@/lib/payroll-mode";
import { normalizePunchQrToken } from "@/lib/punch-qr-url";
import { loadSchedulesForStaffIdsInRange } from "@/lib/shifts/staff-schedules-db";
import { createAdminClient } from "@/lib/supabase/admin";
import { bodyFromCaught } from "@/lib/supabase/errors";

function parseRange(raw: string | null): EmployeeAttendanceRange {
  if (raw === "this_month" || raw === "previous_month" || raw === "last_7_days") {
    return raw;
  }
  return "last_7_days";
}

/**
 * Employee (or QR-authenticated staff) attendance history with session matching.
 * Always scopes to the authenticated staff identity — never trusts a foreign employee_id.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const shopId = String(url.searchParams.get("shop_id") ?? "").trim();
    const staffId = String(url.searchParams.get("staff_id") ?? "").trim();
    const staffIdentifier = String(url.searchParams.get("staff_identifier") ?? "").trim();
    const punchQrToken =
      normalizePunchQrToken(url.searchParams.get("punch_qr_token")) ??
      normalizePunchQrToken(url.searchParams.get("t"));
    const range = parseRange(url.searchParams.get("range"));
    const filterShop =
      url.searchParams.get("filter_shop") === "1" ||
      url.searchParams.get("current_shop_only") === "1";

    if (!shopId) {
      return NextResponse.json({ error: "shop_id is required" }, { status: 400 });
    }
    if (!staffId && !staffIdentifier) {
      return NextResponse.json(
        { error: "staff_id or staff_identifier is required" },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();
    const employeeSession = employeeSessionFromRequest(req);

    const [shopResult, staffResult] = await Promise.all([
      loadShopForPunch(supabase, shopId),
      validateStaffForPunch(supabase, shopId, {
        staffId: staffId || undefined,
        staffIdentifier: staffIdentifier || undefined,
        employeePortalShopAccess: Boolean(employeeSession),
      }),
    ]);

    if ("error" in shopResult) {
      return NextResponse.json({ error: shopResult.error }, { status: shopResult.status });
    }
    if ("error" in staffResult) {
      return NextResponse.json({ error: staffResult.error }, { status: staffResult.status });
    }

    const { shop } = shopResult;
    const { staff: staffRow } = staffResult;

    // Session staff must match requested staff (prevent viewing others).
    if (employeeSession && employeeSession.staffId !== staffRow.id) {
      return NextResponse.json({ error: "Not authorized for this staff." }, { status: 403 });
    }

    const accessCheck = validatePunchAccess({
      shopId,
      storedToken: shop.punchQrToken,
      providedQr: punchQrToken,
      employeeSession,
      staffId: staffRow.id,
      staffAssignedToShop: true,
    });
    if (!accessCheck.ok) {
      return NextResponse.json({ error: accessCheck.error }, { status: 403 });
    }

    const todayYmd = malaysiaDateYmd(new Date());
    const { from, to } = resolveAttendanceRange(range, todayYmd);

    const companyId =
      (staffRow as { company_id?: string | null }).company_id ??
      shop.companyId ??
      null;

    let payrollMode = normalizePayrollMode(undefined);
    if (companyId) {
      const { data: company } = await supabase
        .from("companies")
        .select("payroll_mode")
        .eq("id", companyId)
        .maybeSingle();
      if (company) payrollMode = normalizePayrollMode((company as { payroll_mode?: unknown }).payroll_mode);
    }

    const [attRes, scheduleMap, forgotRes] = await Promise.all([
      supabase
        .from("attendance")
        .select("*")
        .eq("staff_id", staffRow.id)
        .gte("event_date", from)
        .lte("event_date", to)
        .order("event_date", { ascending: true })
        .order("created_at", { ascending: true }),
      loadSchedulesForStaffIdsInRange(supabase, {
        staffIds: [staffRow.id],
        from,
        to,
      }),
      supabase
        .from("forgot_punch_requests")
        .select("id, request_type, status, requested_time, shop_id")
        .eq("staff_id", staffRow.id)
        .gte("requested_time", `${from}T00:00:00+08:00`)
        .lte("requested_time", `${to}T23:59:59+08:00`),
    ]);

    if (attRes.error) throw new Error(attRes.error.message);

    const attendance = (attRes.data ?? []).map((r) =>
      normalizeAttendanceRecord(r as Record<string, unknown>),
    );

    const byDate = scheduleMap.get(staffRow.id) ?? new Map();
    const schedulesByDate = new Map(
      [...byDate.entries()].map(([ymd, rows]) => [ymd, rows]),
    );

    const forgotRequests: ForgotPunchHistoryRow[] = (forgotRes.data ?? []).map((r) => ({
      id: String(r.id),
      request_type: String(r.request_type),
      status: String(r.status),
      requested_time: String(r.requested_time),
      shop_id: String(r.shop_id),
    }));

    const { days, summary } = buildEmployeeAttendanceHistory({
      from,
      to,
      attendance,
      schedulesByDate,
      forgotRequests,
      payrollMode,
      shopIdFilter: filterShop ? shopId : null,
    });

    return NextResponse.json({
      staff_id: staffRow.id,
      staff_name: staffRow.staff_name,
      shop_id: shopId,
      range,
      from,
      to,
      summary,
      days,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(bodyFromCaught(e), { status: 500 });
  }
}

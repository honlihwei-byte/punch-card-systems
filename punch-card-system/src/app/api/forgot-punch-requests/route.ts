import { NextResponse } from "next/server";
import { buildAttendanceEventFields } from "@/lib/attendance-event-time";
import { loadShopForPunch, validateStaffForPunch } from "@/lib/attendance-punch";
import { employeeSessionFromRequest } from "@/lib/employee-auth";
import { validatePunchAccess } from "@/lib/punch-access-gate";
import {
  forgotPunchTypeLabel,
  parseForgotPunchReason,
  parseForgotPunchRequestType,
} from "@/lib/forgot-punch";
import { formatMalaysiaRecordedAt, malaysiaDateYmd } from "@/lib/malaysia-time";
import { normalizePunchQrToken } from "@/lib/punch-qr-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { bodyFromCaught } from "@/lib/supabase/errors";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const shopId = String(body.shop_id ?? "").trim();
    const staffId = String(body.staff_id ?? "").trim();
    const staffIdentifier = String(body.staff_identifier ?? "").trim();
    const requestType = parseForgotPunchRequestType(String(body.request_type ?? ""));
    const reason = parseForgotPunchReason(String(body.reason ?? ""));
    const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 500) : "";
    const requestedTimeRaw = String(body.requested_time ?? "").trim();
    const punchQrToken =
      normalizePunchQrToken(body.punch_qr_token) ?? normalizePunchQrToken(body.t);

    if (!shopId || !requestType || !reason) {
      return NextResponse.json(
        { error: "shop_id, request_type, and reason are required." },
        { status: 400 },
      );
    }
    if (!requestedTimeRaw) {
      return NextResponse.json({ error: "requested_time is required." }, { status: 400 });
    }

    const requestedAt = new Date(requestedTimeRaw);
    if (Number.isNaN(requestedAt.getTime())) {
      return NextResponse.json({ error: "Invalid requested_time." }, { status: 400 });
    }

    const supabase = createAdminClient();

    const [shopResult, staffResult] = await Promise.all([
      loadShopForPunch(supabase, shopId),
      validateStaffForPunch(supabase, shopId, {
        staffId: staffId || undefined,
        staffIdentifier: staffIdentifier || undefined,
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

    const employeeSession = employeeSessionFromRequest(req);
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

    const dayYmd = malaysiaDateYmd(requestedAt);
    const todayYmd = malaysiaDateYmd(new Date());
    if (dayYmd > todayYmd) {
      return NextResponse.json({ error: "Requested time cannot be in the future." }, { status: 400 });
    }

    const { data: pendingRows } = await supabase
      .from("forgot_punch_requests")
      .select("id, requested_time")
      .eq("staff_id", staffRow.id)
      .eq("shop_id", shopId)
      .eq("request_type", requestType)
      .eq("status", "pending");

    const sameDayPending = (pendingRows ?? []).find(
      (r) => malaysiaDateYmd(new Date(String(r.requested_time))) === dayYmd,
    );
    if (sameDayPending) {
      return NextResponse.json(
        {
          error: `You already have a pending ${forgotPunchTypeLabel(requestType)} request for this date.`,
        },
        { status: 409 },
      );
    }

    // Also block a second pending request of the same type for this shop (any day)
    // so the queue stays manageable — existing behaviour.
    if ((pendingRows ?? []).length > 0) {
      return NextResponse.json(
        {
          error: `You already have a pending ${forgotPunchTypeLabel(requestType)} request for this shop.`,
        },
        { status: 409 },
      );
    }

    const { event_date, event_time } = buildAttendanceEventFields(requestedAt);

    const { data, error } = await supabase
      .from("forgot_punch_requests")
      .insert({
        staff_id: staffRow.id,
        shop_id: shopId,
        request_type: requestType,
        requested_time: requestedAt.toISOString(),
        reason,
        notes: notes || null,
        status: "pending",
      })
      .select("id, status, created_at")
      .single();

    if (error || !data) {
      console.error(error);
      return NextResponse.json(
        { error: error?.message || "Could not save request." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      id: data.id,
      status: data.status,
      request_type: requestType,
      request_type_label: forgotPunchTypeLabel(requestType),
      requested_display: `${event_date} ${event_time}`,
      created_at: formatMalaysiaRecordedAt(String(data.created_at)),
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(bodyFromCaught(e), { status: 500 });
  }
}

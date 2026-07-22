"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { LocationStatusCard } from "@/components/LocationStatusCard";
import {
  PhotoProofCapture,
  type PhotoProofPreview,
} from "@/components/clock/PhotoProofCapture";
import { ClockPunchButton } from "@/components/clock/ClockPunchButton";
import {
  SelfieProofCapture,
  type SelfieProofPreview,
} from "@/components/clock/SelfieProofCapture";
import type { SelfieUploadedForPunch } from "@/lib/selfie-clock-upload";
import { logSelfiePipeline } from "@/lib/selfie-proof-debug";
import {
  flushPendingSelfieUploadsFromDevice,
  scheduleSelfieBackgroundUpload,
} from "@/lib/selfie-background-upload";
import { Toast } from "@/components/Toast";
import {
  getClockGpsVerifyServerSnapshot,
  getClockGpsVerifySnapshot,
  getVerifiedGpsForPunch,
  isGpsVerifiedForPunch,
  startClockGpsVerification,
  setClockGpsVerifyStaff,
  subscribeClockGpsVerify,
} from "@/lib/clock-verified-gps";
import {
  canShowPhotoProofOption,
  isPhotoProofEnabledForShop,
} from "@/lib/photo-proof-eligibility";
import { formatPhotoProofGpsStatus } from "@/lib/photo-proof-gps-label";
import {
  uploadPhotoProofWithProgress,
  type PhotoProofUploadMetrics,
} from "@/lib/photo-proof-upload-client";
import {
  getIndoorVerifyFailureSnapshot,
  indoorVerifyAttemptLabel,
  PHOTO_PROOF_MIN_FAILURES,
  resetIndoorVerifyFailures,
  subscribeIndoorVerifyFailures,
} from "@/lib/photo-proof-failure-counter";
import {
  getCachedGpsPositionForDisplay,
} from "@/lib/geolocation-client";
import { readIndoorGpsSession } from "@/lib/gps-indoor-session";
import { collectPunchDeviceMetaFromClient, deviceMetaToInsertFields } from "@/lib/punch-device-meta";
import type { ShopForPunch, ShopGpsLocation, ShopGpsLocationType } from "@/lib/gps-shop-verify";
import {
  clearRememberedStaff,
  readRememberedStaff,
  saveRememberedStaff,
  staffOptionToRemembered,
  type RememberedStaff,
} from "@/lib/remembered-staff";
import { isValidShopId } from "@/lib/shop-id";
import {
  isPunchTimingEnabled,
  punchMark,
  punchTime,
  punchTimeSectionEnd,
  punchTimeSectionStart,
  punchTimeStart,
} from "@/lib/punch-timing";
import { endDevTimer, startDevTimer } from "@/lib/performance-timing";
import { ClockOutTasksWarning } from "@/components/clock/ClockOutTasksWarning";
import { ClockTodayTasksPanel } from "@/components/clock/ClockTodayTasksPanel";
import { ForgotPunchRequestDialog } from "@/components/clock/ForgotPunchRequestDialog";
import { StaffMyAttendanceSection } from "@/components/clock/StaffMyAttendanceSection";
import { StaffTodayStatusCard } from "@/components/clock/StaffTodayStatusCard";
import type { AttendanceRecord, PunchActionType } from "@/lib/attendance";
import type { ForgotPunchRequestType } from "@/lib/forgot-punch";
import {
  applyOptimisticPunchToTodayStatus,
  type StaffTodayStatusSummary,
} from "@/lib/staff-day-status";
import {
  translatePunchSuccessToast,
} from "@/lib/i18n/employee-translate";
import { SMART_PUNCH_DUPLICATE_WINDOW_MS, validateSmartPunch } from "@/lib/smart-punch";
import { SubscriptionRequired } from "@/components/clock/SubscriptionRequired";
import { ClockScreenSkeleton } from "./ClockScreenSkeleton";
import { formatMalaysiaRecordedAt, malaysiaDateYmd } from "@/lib/malaysia-time";
import { normalizeAttendanceVerificationMode } from "@/lib/shop-anti-buddy";
import { useI18n } from "@/components/i18n/LanguageProvider";

type ClockStaffOption = {
  id: string;
  staff_name: string;
  staff_code: string;
};

const STAFF_CACHE_KEY = (shopId: string) => `punch-staff-${shopId}`;
const ENRICH_DELAY_MS_MIN = 3000;
const ENRICH_DELAY_MS_MAX = 5000;
const PUNCH_DEBOUNCE_MS = 3_000;
const GPS_START_DELAY_MS = 150;

function parseGpsLocationsFromApi(
  raw: unknown,
  shop: Record<string, unknown> | undefined,
  shopId: string,
): ShopGpsLocation[] {
  const types = new Set<ShopGpsLocationType>(["main", "office", "parking", "loading", "backup"]);
  const fromApi: ShopGpsLocation[] = [];
  if (Array.isArray(raw)) {
    for (const row of raw) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const lat = typeof r.latitude === "number" ? r.latitude : null;
      const lng = typeof r.longitude === "number" ? r.longitude : null;
      const type = String(r.location_type ?? "main");
      if (lat == null || lng == null || !types.has(type as ShopGpsLocationType)) continue;
      fromApi.push({
        id: String(r.id ?? ""),
        name: String(r.name ?? "Location"),
        latitude: lat,
        longitude: lng,
        allowed_radius_meters:
          typeof r.allowed_radius_meters === "number" ? r.allowed_radius_meters : 50,
        location_type: type as ShopGpsLocationType,
      });
    }
  }
  if (fromApi.length > 0) return fromApi;

  const lat = typeof shop?.latitude === "number" ? shop.latitude : null;
  const lng = typeof shop?.longitude === "number" ? shop.longitude : null;
  if (lat == null || lng == null) return [];

  return [
    {
      id: `legacy-${shopId}`,
      name: "Main Entrance",
      latitude: lat,
      longitude: lng,
      allowed_radius_meters:
        typeof shop?.allowed_radius_meters === "number" ? shop.allowed_radius_meters : 50,
      location_type: "main",
    },
  ];
}

function readStaffCache(shopId: string): ClockStaffOption[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(STAFF_CACHE_KEY(shopId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ClockStaffOption[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStaffCache(shopId: string, staff: ClockStaffOption[]) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STAFF_CACHE_KEY(shopId), JSON.stringify(staff));
  } catch {
    /* ignore */
  }
}

function findStaffInList(
  list: ClockStaffOption[],
  remembered: RememberedStaff,
): ClockStaffOption | undefined {
  return list.find((s) => s.id === remembered.staff_id);
}

function findStaffByCode(list: ClockStaffOption[], code: string): ClockStaffOption | undefined {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return undefined;
  return list.find((s) => s.staff_code.trim().toUpperCase() === normalized);
}

function applyRememberedToList(
  list: ClockStaffOption[],
  remembered: RememberedStaff | null,
): { staffId: string; usingRemembered: boolean; activeRemembered: RememberedStaff | null } {
  if (!remembered || list.length === 0) {
    return { staffId: list[0]?.id ?? "", usingRemembered: false, activeRemembered: null };
  }
  const match = findStaffInList(list, remembered);
  if (match) {
    return { staffId: match.id, usingRemembered: true, activeRemembered: remembered };
  }
  clearRememberedStaff();
  return { staffId: list[0]?.id ?? "", usingRemembered: false, activeRemembered: null };
}

function enrichDelayMs(): number {
  return (
    ENRICH_DELAY_MS_MIN +
    Math.floor(Math.random() * (ENRICH_DELAY_MS_MAX - ENRICH_DELAY_MS_MIN + 1))
  );
}

function scheduleBackgroundEnrich(
  attendanceId: string,
  shopId: string,
  accuracyMeters: number,
) {
  const delay = enrichDelayMs();
  window.setTimeout(() => {
    void fetch(`/api/attendance/${attendanceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shop_id: shopId,
        mode: "enrich",
        gps_accuracy_meters: Math.round(accuracyMeters * 100) / 100,
        client_device_time: new Date().toISOString(),
      }),
    }).catch(() => {
      /* non-blocking */
    });
  }, delay);
}

function subscribeGpsVerified(listener: () => void): () => void {
  return subscribeClockGpsVerify(listener);
}

function getGpsVerifiedSnapshot(): boolean {
  return isGpsVerifiedForPunch();
}

export function ClockScreen({
  shopId,
  punchQrToken,
  employeePortalMode = false,
  qrRequiresEmployeeLogin = false,
  initialEmployeeSession = null,
}: {
  shopId: string;
  punchQrToken: string | null;
  employeePortalMode?: boolean;
  /** Shop QR flow: employee must be logged in; staff picker is hidden. */
  qrRequiresEmployeeLogin?: boolean;
  initialEmployeeSession?: { staffId: string; staffName: string | null } | null;
}) {
  const { t } = useI18n();
  const validShopId = isValidShopId(shopId);

  const [employeeSessionStaffId, setEmployeeSessionStaffId] = useState<string | null>(
    initialEmployeeSession?.staffId ?? null,
  );
  const [employeeSessionName, setEmployeeSessionName] = useState<string | null>(
    initialEmployeeSession?.staffName ?? null,
  );
  const employeeSessionStaffIdRef = useRef<string | null>(
    initialEmployeeSession?.staffId ?? null,
  );
  const hasPunchGate = Boolean(punchQrToken) || Boolean(employeeSessionStaffId) || employeePortalMode;

  const [shopName, setShopName] = useState("");
  const [shopForPunch, setShopForPunch] = useState<ShopForPunch | null>(null);
  const [shopStaff, setShopStaff] = useState<ClockStaffOption[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState(initialEmployeeSession?.staffId ?? "");
  const [identifier, setIdentifier] = useState("");
  const [useManualCode, setUseManualCode] = useState(false);
  const usingEmployeeSession =
    Boolean(employeeSessionStaffId) && !useManualCode && !employeePortalMode;
  const [usingRememberedStaff, setUsingRememberedStaff] = useState(false);
  const [staffPickerExpanded, setStaffPickerExpanded] = useState(true);
  const [rememberedStaff, setRememberedStaff] = useState<RememberedStaff | null>(null);
  const hideStaffIdentityPicker =
    usingEmployeeSession || qrRequiresEmployeeLogin || (usingRememberedStaff && !staffPickerExpanded);
  const [pageLoading, setPageLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showGpsCard, setShowGpsCard] = useState(false);
  const [tapLocked, setTapLocked] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [toastVariant, setToastVariant] = useState<"success" | "warning" | "error">("success");
  const [punchError, setPunchError] = useState<string | null>(null);
  const [qrTokenError, setQrTokenError] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<PhotoProofPreview | null>(null);
  const [photoProofPath, setPhotoProofPath] = useState<string | null>(null);
  const [photoProofUploadedAt, setPhotoProofUploadedAt] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoUploadProgress, setPhotoUploadProgress] = useState(0);
  const [photoUploadSlow, setPhotoUploadSlow] = useState(false);
  const [photoUploadError, setPhotoUploadError] = useState<string | null>(null);
  const [photoUploadMetrics, setPhotoUploadMetrics] = useState<PhotoProofUploadMetrics | null>(
    null,
  );
  const [photoProofActive, setPhotoProofActive] = useState(false);
  const [selfieProofRequired, setSelfieProofRequired] = useState(false);
  const [selfieChallengeToken, setSelfieChallengeToken] = useState<string | null>(null);
  const [selfieProofPreview, setSelfieProofPreview] = useState<SelfieProofPreview | null>(null);
  const [selfieCapturedAt, setSelfieCapturedAt] = useState<string | null>(null);
  const [selfieProofForAction, setSelfieProofForAction] = useState<"clock_in" | "clock_out" | null>(
    null,
  );
  const [selfieProofError, setSelfieProofError] = useState<string | null>(null);
  const [selfieUploadWarning, setSelfieUploadWarning] = useState<string | null>(null);
  const [selfieUploading, setSelfieUploading] = useState(false);
  const [todayStatus, setTodayStatus] = useState<StaffTodayStatusSummary | null>(null);
  const [todayStatusLoading, setTodayStatusLoading] = useState(false);
  const [todayStatusError, setTodayStatusError] = useState<string | null>(null);
  const [scheduleInfo, setScheduleInfo] = useState<{
    mode: "fixed" | "shift_based";
    shop_name?: string;
    warning?: string | null;
    today_shifts?: Array<{
      id: string;
      shift_date: string;
      start_time: string;
      end_time: string;
      break_minutes: number;
      shop_id: string;
      shop_name: string | null;
      shift_name: string | null;
      is_current_shop?: boolean;
      shift_index?: number;
      shift_status?: string;
      status_label?: string;
      actual_clock_in?: string | null;
      actual_clock_out?: string | null;
    }>;
    today?: { shift_date: string; start_time: string; end_time: string; shift_name?: string | null } | null;
    tomorrow?: { shift_date: string; start_time: string; end_time: string; shift_name?: string | null } | null;
    upcoming?: { shift_date: string; start_time: string; end_time: string; shift_name?: string | null } | null;
    schedule?: { shift_date: string; start_time: string; end_time: string; shift_name?: string | null } | null;
    current_shift_label?: string | null;
    next_shift_label?: string | null;
    day_status?: string | null;
    shifts_today?: number;
  } | null>(null);
  const [forgotPunchOpen, setForgotPunchOpen] = useState(false);
  const [forgotPunchSuggestedOverride, setForgotPunchSuggestedOverride] =
    useState<ForgotPunchRequestType | null>(null);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [missingRestInConfirm, setMissingRestInConfirm] = useState(false);
  const skipMissingRestInConfirmRef = useRef(false);
  const [unfinishedTaskCount, setUnfinishedTaskCount] = useState(0);
  const [clockOutTasksWarning, setClockOutTasksWarning] = useState(false);
  const skipClockOutTaskWarningRef = useRef(false);
  const [subscriptionBlocked, setSubscriptionBlocked] = useState<{
    message: string;
    companyName?: string;
    statusLabel?: string;
  } | null>(null);

  const [punchProcessing, setPunchProcessing] = useState(false);
  const [tasksRefreshKey, setTasksRefreshKey] = useState(0);
  const punchLockRef = useRef(false);
  const selfieBgCancelRef = useRef<(() => void) | null>(null);
  const precheckCacheRef = useRef<{
    key: string;
    at: number;
    result: { ok: boolean; requireSelfieProof: boolean };
  } | null>(null);
  const photoUploadAbortRef = useRef<(() => void) | null>(null);
  const photoUploadInFlightRef = useRef(false);
  const hasLoadedRef = useRef(false);
  const hasStartedGpsRef = useRef(false);
  const stopGpsRef = useRef<(() => void) | null>(null);
  const gpsStartTimerRef = useRef<number | null>(null);

  const gpsVerified = useSyncExternalStore(
    subscribeGpsVerified,
    getGpsVerifiedSnapshot,
    () => false,
  );

  const gpsSnap = useSyncExternalStore(
    subscribeClockGpsVerify,
    getClockGpsVerifySnapshot,
    getClockGpsVerifyServerSnapshot,
  );

  const effectiveStaffId = useManualCode
    ? (findStaffByCode(shopStaff, identifier.trim())?.id ?? "")
    : usingEmployeeSession && employeeSessionStaffId
      ? employeeSessionStaffId
      : selectedStaffId;

  const indoorFailCount = useSyncExternalStore(
    subscribeIndoorVerifyFailures,
    () => getIndoorVerifyFailureSnapshot(shopId, effectiveStaffId),
    () => 0,
  );

  const hasStaffForPunch = useManualCode
    ? identifier.trim().length > 0
    : usingEmployeeSession
      ? Boolean(employeeSessionStaffId)
      : Boolean(selectedStaffId) && shopStaff.length > 0;

  const photoProofUnlocked =
    indoorFailCount >= PHOTO_PROOF_MIN_FAILURES &&
    canShowPhotoProofOption(shopForPunch, shopId, effectiveStaffId, gpsSnap, gpsVerified);

  const showPhotoProof = photoProofUnlocked && photoProofActive;

  const showIndoorAttemptStatus =
    isPhotoProofEnabledForShop(shopForPunch) &&
    hasStaffForPunch &&
    !gpsVerified &&
    !photoProofUnlocked &&
    indoorFailCount < PHOTO_PROOF_MIN_FAILURES;

  const photoProofReady = Boolean(photoProofPath && photoPreview && !photoUploading);

  const smartPunchAction: "clock_in" | "clock_out" =
    todayStatus?.smart_punch_action ?? "clock_in";
  const smartPunchIsClockIn = smartPunchAction === "clock_in";
  const attendancePhaseNow = todayStatus?.attendance_phase ?? "not_active";
  const onBreakNow = attendancePhaseNow === "on_break";
  const isClockedIn =
    todayStatus?.status === "in_shop" ||
    todayStatus?.status === "pending_clock_in_verification" ||
    todayStatus?.smart_punch_action === "clock_out";

  const selfieLocalReady =
    !selfieProofRequired ||
    Boolean(
      selfieProofPreview &&
        selfieCapturedAt &&
        selfieProofForAction === smartPunchAction,
    );
  const selfieProofReady = selfieLocalReady;
  const canPunchNow = (gpsVerified || photoProofReady) && selfieProofReady;

  const selectedStaffLabel = useManualCode
    ? findStaffByCode(shopStaff, identifier.trim())?.staff_name ?? identifier.trim()
    : usingEmployeeSession
      ? employeeSessionName ||
        shopStaff.find((s) => s.id === employeeSessionStaffId)?.staff_name ||
        ""
      : shopStaff.find((s) => s.id === selectedStaffId)?.staff_name ?? "";
  const selectedStaffCode = useManualCode
    ? findStaffByCode(shopStaff, identifier.trim())?.staff_code ?? identifier.trim()
    : usingEmployeeSession
      ? shopStaff.find((s) => s.id === employeeSessionStaffId)?.staff_code ?? ""
      : shopStaff.find((s) => s.id === selectedStaffId)?.staff_code ?? "";

  const clockDisabled =
    tapLocked ||
    photoUploading ||
    !canPunchNow ||
    pageLoading ||
    !shopForPunch ||
    !hasStaffForPunch ||
    !hasPunchGate ||
    Boolean(qrTokenError);

  useEffect(() => {
    if (selfieProofForAction && selfieProofForAction !== smartPunchAction) {
      setSelfieProofPreview(null);
      setSelfieCapturedAt(null);
      setSelfieProofForAction(null);
    }
  }, [smartPunchAction, selfieProofForAction]);

  const forgotPunchSuggestedType: ForgotPunchRequestType | null =
    forgotPunchSuggestedOverride ??
    (todayStatus?.attendance_issues?.missing_clock_in
      ? "forgot_clock_in"
      : todayStatus?.attendance_issues?.missing_clock_out
        ? "forgot_clock_out"
        : null);

  function openForgotPunch(suggested?: ForgotPunchRequestType | null) {
    setForgotPunchSuggestedOverride(suggested ?? null);
    setForgotPunchOpen(true);
  }

  const fetchTodayStatus = useCallback(async () => {
    if (!validShopId || !hasPunchGate || !hasStaffForPunch) {
      setTodayStatus(null);
      return;
    }
    const manual = identifier.trim();
    const staffId = useManualCode ? "" : effectiveStaffId;
    if (!useManualCode && !staffId) {
      setTodayStatus(null);
      return;
    }
    if (useManualCode && !manual) {
      setTodayStatus(null);
      return;
    }

    setTodayStatusLoading(true);
    setTodayStatusError(null);
    try {
      const params = new URLSearchParams({ shop_id: shopId });
      if (punchQrToken) params.set("punch_qr_token", punchQrToken);
      if (useManualCode) params.set("staff_identifier", manual);
      else params.set("staff_id", staffId);

      const res = await fetch(`/api/attendance/today-status?${params}`);
      const data = (await res.json().catch(() => ({}))) as StaffTodayStatusSummary & {
        error?: string;
        schedule_warning?: string | null;
      };
      if (!res.ok) throw new Error(data.error || "Could not load today's status");
      setTodayStatus(data);
      setTodayStatusError(data.schedule_warning?.trim() || null);
    } catch (e) {
      const message = e instanceof Error ? e.message : t("employee.punchLog.failedLoad");
      console.warn("[clock] today-status fetch failed — punch still allowed", message);
      setTodayStatusError(message);
      setTodayStatus(null);
    } finally {
      setTodayStatusLoading(false);
    }
  }, [
    validShopId,
    shopId,
    punchQrToken,
    hasPunchGate,
    hasStaffForPunch,
    useManualCode,
    effectiveStaffId,
    identifier,
    t,
  ]);

  const fetchNextShift = useCallback(async () => {
    if (!validShopId || !hasStaffForPunch) {
      setScheduleInfo(null);
      return;
    }
    const manual = identifier.trim();
    const staffId = useManualCode ? "" : effectiveStaffId;
    if (!useManualCode && !staffId) {
      setScheduleInfo(null);
      return;
    }
    if (useManualCode && !manual) {
      setScheduleInfo(null);
      return;
    }

    try {
      const params = new URLSearchParams({ shop_id: shopId });
      if (useManualCode) params.set("staff_identifier", manual);
      else params.set("staff_id", staffId);
      const res = await fetch(`/api/attendance/next-shift?${params}`);
      const j = (await res.json().catch(() => ({}))) as {
        mode?: "fixed" | "shift_based";
        shop_name?: string;
        warning?: string | null;
        today_shifts?: Array<{
          id: string;
          shift_date: string;
          start_time: string;
          end_time: string;
          break_minutes: number;
          shop_id: string;
          shop_name: string | null;
          shift_name: string | null;
          is_current_shop?: boolean;
        }>;
        today?: { shift_date: string; start_time: string; end_time: string; shift_name?: string | null } | null;
        tomorrow?: { shift_date: string; start_time: string; end_time: string; shift_name?: string | null } | null;
        upcoming?: { shift_date: string; start_time: string; end_time: string; shift_name?: string | null } | null;
        schedule?: { shift_date: string; start_time: string; end_time: string; shift_name?: string | null } | null;
        error?: string;
      };
      if (!res.ok) throw new Error(j.error || "Failed to load schedule");
      setScheduleInfo(j.mode ? (j as typeof scheduleInfo) : null);
    } catch {
      setScheduleInfo(null);
    }
  }, [validShopId, hasStaffForPunch, identifier, effectiveStaffId, shopId, useManualCode]);

  const refreshAttendancePanels = useCallback(() => {
    void fetchTodayStatus();
    void fetchNextShift();
    setHistoryRefreshKey((k) => k + 1);
  }, [fetchTodayStatus, fetchNextShift]);

  useEffect(() => {
    void fetchTodayStatus();
  }, [fetchTodayStatus]);

  useEffect(() => {
    void fetchNextShift();
  }, [fetchNextShift]);

  const applyEmployeeSessionStaff = useCallback(() => {
    const sessionStaffId = employeeSessionStaffIdRef.current;
    if (!sessionStaffId) return;
    setSelectedStaffId(sessionStaffId);
    setUsingRememberedStaff(false);
    setStaffPickerExpanded(false);
    setUseManualCode(false);
    setQrTokenError(null);
  }, []);

  const load = useCallback(async () => {
    if (!validShopId) {
      setLoadError(t("clock.invalidShopLink"));
      setPageLoading(false);
      return;
    }

    if (!punchQrToken && !employeePortalMode && !employeeSessionStaffIdRef.current) {
      setQrTokenError(t("clock.qrTokenMissing"));
    } else {
      setQrTokenError(null);
    }

    setLoadError(null);
    setPageLoading(true);
    startDevTimer("qr_clock_load");
    const t0 = punchTimeStart();

    try {
      const subRes = await fetch(`/api/shops/${encodeURIComponent(shopId)}/subscription`);
      const subJson = (await subRes.json()) as {
        allowed?: boolean;
        message?: string;
        company?: { name?: string; status_label?: string };
      };
      if (subRes.ok && subJson.allowed === false) {
        setSubscriptionBlocked({
          message: subJson.message || "Subscription required.",
          companyName: subJson.company?.name,
          statusLabel: subJson.company?.status_label,
        });
        setPageLoading(false);
        return;
      }
      setSubscriptionBlocked(null);

      const [shopRes, staffRes] = await Promise.all([
        fetch(`/api/shops/${encodeURIComponent(shopId)}`),
        fetch(`/api/shops/${encodeURIComponent(shopId)}/staff`),
      ]);
      punchTime("load shop+staff API", t0);

      if (!shopRes.ok) {
        const j = await shopRes.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error || "Shop not found");
      }

      const shopJson = (await shopRes.json()) as { shop?: Record<string, unknown> };
      const shop = shopJson.shop;
      const name = typeof shop?.name === "string" ? shop.name : t("clock.shopDefault");
      setShopName(name);

      const rawLocations = (shopJson as { gps_locations?: unknown }).gps_locations;
      const locations = parseGpsLocationsFromApi(rawLocations, shop, shopId);

      if (locations.length > 0) {
        const gpsIndoorMode = shop?.gps_indoor_mode === true;
        const allowPhotoProofFallback = shop?.allow_photo_proof_fallback === true;
        const attendanceVerificationMode =
          typeof shop?.attendance_verification_mode === "string"
            ? normalizeAttendanceVerificationMode(shop.attendance_verification_mode)
            : null;
        setShopForPunch({
          id: shopId,
          name,
          locations,
          gpsIndoorMode,
          allowPhotoProofFallback,
          attendanceVerificationMode,
        });
      } else {
        setShopForPunch(null);
        setLoadError(t("clock.noGpsConfigured"));
      }

      if (staffRes.ok) {
        const staffJson = (await staffRes.json()) as { staff?: ClockStaffOption[] };
        const list = Array.isArray(staffJson.staff) ? staffJson.staff : [];
        setShopStaff(list);
        writeStaffCache(shopId, list);
        const { staffId, usingRemembered, activeRemembered } = applyRememberedToList(
          list,
          readRememberedStaff(),
        );
        setRememberedStaff(activeRemembered);
        setSelectedStaffId(staffId);
        setUsingRememberedStaff(usingRemembered);
        setStaffPickerExpanded(!usingRemembered);
      } else {
        const cached = readStaffCache(shopId);
        setShopStaff(cached);
        const { staffId, usingRemembered, activeRemembered } = applyRememberedToList(
          cached,
          readRememberedStaff(),
        );
        setRememberedStaff(activeRemembered);
        setSelectedStaffId(staffId);
        setUsingRememberedStaff(usingRemembered);
        setStaffPickerExpanded(!usingRemembered);
      }
      applyEmployeeSessionStaff();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : t("clock.failedLoadTitle"));
      setShopForPunch(null);
    } finally {
      endDevTimer("qr_clock_load");
      setPageLoading(false);
    }
  }, [shopId, validShopId, punchQrToken, employeePortalMode, t, applyEmployeeSessionStaff]);

  useEffect(() => {
    if (!employeeSessionStaffId) return;
    applyEmployeeSessionStaff();
  }, [employeeSessionStaffId, applyEmployeeSessionStaff]);

  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;

    const cached = readStaffCache(shopId);
    if (cached.length) {
      setShopStaff(cached);
      const { staffId, usingRemembered, activeRemembered } = applyRememberedToList(
        cached,
        readRememberedStaff(),
      );
      setRememberedStaff(activeRemembered);
      setSelectedStaffId(staffId);
      setUsingRememberedStaff(usingRemembered);
      setStaffPickerExpanded(!usingRemembered);
    }
    void load();
  }, [load, shopId]);

  useEffect(() => {
    setClockGpsVerifyStaff(effectiveStaffId || null);
  }, [effectiveStaffId]);

  useEffect(() => {
    if (gpsVerified && validShopId && effectiveStaffId) {
      resetIndoorVerifyFailures(shopId, effectiveStaffId);
    }
  }, [gpsVerified, shopId, validShopId, effectiveStaffId]);

  useEffect(() => {
    setPhotoProofActive(false);
    setSelfieProofRequired(false);
    setSelfieProofPreview(null);
    setSelfieCapturedAt(null);
    setSelfieProofForAction(null);
    setSelfieChallengeToken(null);
    setSelfieProofError(null);
    setSelfieUploadWarning(null);
  }, [effectiveStaffId, shopId]);

  useEffect(() => {
    flushPendingSelfieUploadsFromDevice();
    return () => {
      selfieBgCancelRef.current?.();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    function applySession(staffId: string, staffName: string | null) {
      employeeSessionStaffIdRef.current = staffId;
      setEmployeeSessionStaffId(staffId);
      setEmployeeSessionName(staffName);
      setSelectedStaffId(staffId);
      setUsingRememberedStaff(false);
      setStaffPickerExpanded(false);
      setUseManualCode(false);
      setQrTokenError(null);
    }

    async function refreshEmployeeSession() {
      try {
        const res = await fetch("/api/employee/auth/session", { credentials: "include" });
        const j = (await res.json()) as {
          authenticated?: boolean;
          staff_id?: string;
          staff_name?: string;
        };
        if (cancelled) return;
        if (j.authenticated && j.staff_id) {
          applySession(j.staff_id, j.staff_name?.trim() || null);
        }
      } catch {
        /* keep existing session */
      }
    }

    if (initialEmployeeSession?.staffId) {
      applySession(initialEmployeeSession.staffId, initialEmployeeSession.staffName);
    }

    void refreshEmployeeSession();

    const onFocus = () => {
      void refreshEmployeeSession();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, [initialEmployeeSession]);

  useEffect(() => {
    if (!hasStaffForPunch || !hasPunchGate || !validShopId) return;
    const manual = identifier.trim();
    const staffId = useManualCode ? "" : effectiveStaffId;
    if (!useManualCode && !staffId) return;
    if (useManualCode && !manual) return;
    void runPunchPrecheck(staffId, manual, smartPunchAction);
  }, [
    hasStaffForPunch,
    punchQrToken,
    hasPunchGate,
    validShopId,
    effectiveStaffId,
    useManualCode,
    identifier,
    shopId,
    smartPunchAction,
  ]);

  const shopPunchId = shopForPunch?.id ?? null;
  const shopForPunchRef = useRef(shopForPunch);
  shopForPunchRef.current = shopForPunch;

  useEffect(() => {
    const shop = shopForPunchRef.current;
    if (!shopPunchId || !shop) return;
    if (hasStartedGpsRef.current) return;
    hasStartedGpsRef.current = true;
    gpsStartTimerRef.current = window.setTimeout(() => {
      try {
        stopGpsRef.current = startClockGpsVerification(shop);
        setShowGpsCard(true);
      } catch (e) {
        console.error("[clock] GPS start failed", e);
        hasStartedGpsRef.current = false;
      }
    }, GPS_START_DELAY_MS);

    return () => {
      if (gpsStartTimerRef.current != null) {
        window.clearTimeout(gpsStartTimerRef.current);
        gpsStartTimerRef.current = null;
      }
      stopGpsRef.current?.();
      stopGpsRef.current = null;
      hasStartedGpsRef.current = false;
      setShowGpsCard(false);
    };
  }, [shopPunchId]);

  const dismissToast = useCallback(() => setToast(null), []);

  const persistStaffSelection = useCallback((staff: ClockStaffOption) => {
    const remembered = staffOptionToRemembered(staff);
    saveRememberedStaff(remembered);
    setRememberedStaff(remembered);
    setSelectedStaffId(staff.id);
    setUsingRememberedStaff(true);
    setStaffPickerExpanded(false);
    setUseManualCode(false);
  }, []);

  const handleStaffSelectChange = useCallback(
    (staffId: string) => {
      setSelectedStaffId(staffId);
      const staff = shopStaff.find((s) => s.id === staffId);
      if (staff) persistStaffSelection(staff);
    },
    [shopStaff, persistStaffSelection],
  );

  const handleManualCodeBlur = useCallback(() => {
    const match = findStaffByCode(shopStaff, identifier);
    if (match) persistStaffSelection(match);
  }, [shopStaff, identifier, persistStaffSelection]);

  const handleChangeStaff = useCallback(() => {
    setStaffPickerExpanded(true);
    setUsingRememberedStaff(false);
  }, []);

  const handleForgetStaff = useCallback(() => {
    clearRememberedStaff();
    setRememberedStaff(null);
    setUsingRememberedStaff(false);
    setStaffPickerExpanded(true);
    setSelectedStaffId("");
    setIdentifier("");
    setUseManualCode(false);
  }, []);

  function antiBuddyBodyFields(): Record<string, string> {
    const fields: Record<string, string> = {
      ...deviceMetaToInsertFields(collectPunchDeviceMetaFromClient()),
    };
    if (selfieCapturedAt) fields.selfie_captured_at = selfieCapturedAt;
    if (selfieChallengeToken) fields.selfie_challenge_token = selfieChallengeToken;
    return fields;
  }

  async function runPunchPrecheck(
    staffId: string,
    manual: string,
    actionType: PunchActionType = smartPunchAction,
  ): Promise<{ ok: boolean; requireSelfieProof: boolean }> {
    const params = new URLSearchParams({
      shop_id: shopId,
      punch_qr_token: punchQrToken ?? "",
      action_type: actionType,
    });
    const deviceMeta = collectPunchDeviceMetaFromClient();
    if (deviceMeta.punch_device_id) params.set("punch_device_id", deviceMeta.punch_device_id);
    if (useManualCode) params.set("staff_identifier", manual);
    else params.set("staff_id", staffId);

    const res = await fetch(`/api/clock/punch-precheck?${params}`);
    const data = (await res.json().catch(() => ({}))) as {
      require_selfie_proof?: boolean;
      require_random_selfie?: boolean;
      selfie_challenge_token?: string;
      selfie_frequency?: string;
      selfie_proof_reason?: string;
      debug?: Record<string, unknown>;
      error?: string;
    };
    if (!res.ok) {
      setPunchError(data.error || "Could not verify punch requirements.");
      return { ok: false, requireSelfieProof: false };
    }
    if (process.env.NODE_ENV === "development" || data.debug) {
      console.log("[punch-security] clock precheck", {
        require_selfie_proof: data.require_selfie_proof,
        selfie_frequency: data.selfie_frequency,
        selfie_proof_reason: data.selfie_proof_reason,
        debug: data.debug,
      });
    }
    const required =
      data.require_selfie_proof === true || data.require_random_selfie === true;
    setSelfieProofRequired(required);
    setSelfieChallengeToken(data.selfie_challenge_token ?? null);
    if (!required) {
      setSelfieProofPreview(null);
      setSelfieCapturedAt(null);
      setSelfieProofForAction(null);
    }
    const result = { ok: true as const, requireSelfieProof: required };
    const cacheKey = `${staffId}|${manual}|${actionType}`;
    precheckCacheRef.current = { key: cacheKey, at: Date.now(), result };
    return result;
  }

  async function getPunchPrecheck(
    staffId: string,
    manual: string,
    actionType: PunchActionType,
  ): Promise<{ ok: boolean; requireSelfieProof: boolean }> {
    const cacheKey = `${staffId}|${manual}|${actionType}`;
    const cached = precheckCacheRef.current;
    if (cached && cached.key === cacheKey && Date.now() - cached.at < 120_000) {
      punchMark("punch precheck cache hit");
      return cached.result;
    }
    punchTimeSectionStart("precheck");
    try {
      return await runPunchPrecheck(staffId, manual, actionType);
    } finally {
      punchTimeSectionEnd("precheck");
    }
  }

  async function postFastAttendance(
    verified: ReturnType<typeof getVerifiedGpsForPunch>,
    action_type: PunchActionType,
    staffId: string,
    manual: string,
    selfieUploaded: SelfieUploadedForPunch | null,
    selfiePending?: { capturedAt: string } | null,
  ) {
    const session = readIndoorGpsSession(shopId);
    const body: Record<string, unknown> = {
      shop_id: shopId,
      action_type,
      fast_punch: true,
      gps_verified: true,
      punch_qr_token: punchQrToken,
      staff_latitude: verified.latitude,
      staff_longitude: verified.longitude,
      distance_from_shop_meters: verified.distanceMeters,
      gps_accuracy_meters: Math.round(verified.accuracyMeters * 100) / 100,
      gps_verify_tier: verified.verifyTier,
      ...deviceMetaToInsertFields(collectPunchDeviceMetaFromClient()),
      ...(selfieUploaded
        ? {
            selfie_proof_path: selfieUploaded.selfie_proof_path,
            selfie_captured_at: selfieUploaded.selfie_captured_at,
            selfie_challenge_token: selfieChallengeToken,
          }
        : selfiePending
          ? {
              selfie_pending_upload: true,
              selfie_captured_at: selfiePending.capturedAt,
              selfie_challenge_token: selfieChallengeToken,
            }
          : {}),
      gps_review_required: verified.reviewRequired,
      gps_radius_used_meters: verified.radiusUsedM,
      gps_confidence_label: verified.confidenceDisplayLabel,
      gps_verify_attempt: verified.indoorVerifyAttempt,
      gps_result_reason: verified.resultReason,
      ...(shopForPunch?.gpsIndoorMode
        ? {
            location_confidence_score: verified.locationConfidenceScore,
            gps_sample_count: verified.sampleCount,
            gps_sample_spread_meters: Math.round(verified.sampleSpreadMeters * 100) / 100,
            gps_indoor_session_used: verified.indoorSessionUsed,
            gps_indoor_fallback_used: verified.indoorFallbackUsed,
            gps_original_radius_meters: verified.gpsOriginalRadiusM,
            gps_expanded_radius_meters: verified.gpsExpandedRadiusM,
            gps_trusted_window_used: verified.gpsTrustedWindowUsed,
          }
        : {
            gps_indoor_fallback_used: verified.indoorFallbackUsed,
            gps_original_radius_meters: verified.baseRadiusM,
            gps_expanded_radius_meters: verified.gpsExpandedRadiusM,
          }),
      matched_gps_location_name: verified.matchedLocationName,
      matched_gps_location_type: verified.matchedLocationType,
      ...(verified.matchedLocationId.startsWith("legacy-")
        ? {}
        : { matched_gps_location_id: verified.matchedLocationId }),
      ...(session
        ? {
            location_session_at: new Date(session.savedAt).toISOString(),
            location_session_latitude: session.latitude,
            location_session_longitude: session.longitude,
          }
        : {}),
    };
    if (useManualCode) body.staff_identifier = manual;
    else body.staff_id = staffId;

    punchMark("API POST /api/attendance (fast) start");
    punchTimeSectionStart("attendance_insert");
    startDevTimer("punch_save");
    const apiStart = punchTimeStart();
    let res: Response | null = null;
    let data: {
      error?: string;
      id?: string;
      warning_message?: string;
      warning_code?: string;
      missing_rest_in?: boolean;
      _timings?: unknown;
    } = {};
    try {
      res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      data = (await res.json().catch(() => ({}))) as typeof data;
      punchTime("API POST /api/attendance (fast) end", apiStart);
    } finally {
      endDevTimer("punch_save");
      punchTimeSectionEnd("attendance_insert");
    }

    if (isPunchTimingEnabled() && data._timings) {
      console.log("[punch-timing] server timings", data._timings);
    }

    if (!res.ok) {
      throw new Error(data.error || "Could not save");
    }
    if (data.warning_message) {
      setToastVariant("warning");
      setToast(data.warning_message);
    }
    return data as { id: string; event_time?: string; missing_rest_in?: boolean };
  }

  function gpsStatusNoteForPhoto(): string {
    if (gpsSnap.tooFarMessage) return gpsSnap.tooFarMessage;
    if (gpsSnap.error) return gpsSnap.error;
    if (gpsSnap.confidenceDisplayLabel) return gpsSnap.confidenceDisplayLabel;
    return gpsSnap.phase;
  }

  function clearPhotoProofSession() {
    photoUploadAbortRef.current?.();
    photoUploadAbortRef.current = null;
    photoUploadInFlightRef.current = false;
    setPhotoPreview(null);
    setPhotoProofPath(null);
    setPhotoProofUploadedAt(null);
    setPhotoUploadError(null);
    setPhotoUploading(false);
    setPhotoUploadProgress(0);
    setPhotoUploadSlow(false);
    setPhotoUploadMetrics(null);
    setPhotoProofActive(false);
  }

  async function uploadPhotoProofOnCapture(preview: PhotoProofPreview) {
    if (photoUploadInFlightRef.current) return;

    const manual = identifier.trim();
    const staffId = useManualCode ? "" : effectiveStaffId;
    if (!useManualCode && !staffId) {
      setPhotoUploadError(t("clock.selectStaffBeforePhoto"));
      return;
    }
    if (useManualCode && !manual) {
      setPhotoUploadError(t("clock.enterStaffCodeBeforePhoto"));
      return;
    }

    photoUploadAbortRef.current?.();
    photoUploadInFlightRef.current = true;
    setPhotoUploading(true);
    setPhotoUploadProgress(0);
    setPhotoUploadSlow(false);
    setPhotoUploadError(null);
    setPhotoProofPath(null);
    setPhotoProofUploadedAt(null);
    setPhotoUploadMetrics(null);

    const cached = getCachedGpsPositionForDisplay();
    const form = new FormData();
    form.set("shop_id", shopId);
    form.set("punch_qr_token", punchQrToken ?? "");
    form.set("photo", preview.file, "proof.jpg");
    form.set("camera_requested", "true");
    form.set("original_file_size", String(preview.originalFileSize));
    form.set("compressed_file_size", String(preview.compressedFileSize));
    if (useManualCode) form.set("staff_identifier", manual);
    else form.set("staff_id", staffId);
    if (cached) {
      form.set("staff_latitude", String(cached.latitude));
      form.set("staff_longitude", String(cached.longitude));
      form.set("gps_accuracy_meters", String(cached.accuracyMeters));
    }

    const { promise, abort } = uploadPhotoProofWithProgress(form, {
      onProgress: ({ percent }) => setPhotoUploadProgress(percent),
      onSlow: () => setPhotoUploadSlow(true),
    });
    photoUploadAbortRef.current = abort;

    try {
      const result = await promise;
      if (!result.ok) {
        throw new Error(result.error);
      }
      setPhotoProofPath(result.photo_proof_path);
      setPhotoProofUploadedAt(result.photo_proof_uploaded_at);
      setPhotoUploadMetrics(result.metrics);
      setPhotoUploadProgress(100);
    } catch (e) {
      setPhotoUploadError(e instanceof Error ? e.message : "Upload failed");
      setPhotoProofPath(null);
      setPhotoProofUploadedAt(null);
      setPhotoUploadMetrics(null);
    } finally {
      photoUploadInFlightRef.current = false;
      photoUploadAbortRef.current = null;
      setPhotoUploading(false);
    }
  }

  function retryPhotoUpload() {
    if (!photoPreview || photoUploadInFlightRef.current) return;
    void uploadPhotoProofOnCapture(photoPreview);
  }

  const handlePhotoReady = useCallback(
    (preview: PhotoProofPreview | null) => {
      if (!preview) {
        clearPhotoProofSession();
        return;
      }
      setPhotoPreview(preview);
      void uploadPhotoProofOnCapture(preview);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- staff/QR context needed for upload
    [shopId, punchQrToken, effectiveStaffId, identifier, useManualCode, hasStaffForPunch, t],
  );

  async function postPhotoProofAttendance(
    action_type: PunchActionType,
    staffId: string,
    manual: string,
  ) {
    if (!photoProofPath) throw new Error("Photo not uploaded yet. Take photo proof again.");

    const cached = getCachedGpsPositionForDisplay();
    const form = new FormData();
    form.set("shop_id", shopId);
    form.set("action_type", action_type);
    form.set("punch_qr_token", punchQrToken ?? "");
    form.set("photo_proof_path", photoProofPath);
    if (photoProofUploadedAt) form.set("photo_proof_uploaded_at", photoProofUploadedAt);
    form.set("camera_requested", "true");
    form.set("gps_status_note", gpsStatusNoteForPhoto());
    if (useManualCode) form.set("staff_identifier", manual);
    else form.set("staff_id", staffId);
    if (cached) {
      form.set("staff_latitude", String(cached.latitude));
      form.set("staff_longitude", String(cached.longitude));
      form.set("gps_accuracy_meters", String(cached.accuracyMeters));
    }
    if (photoUploadMetrics) {
      form.set("original_file_size", String(photoUploadMetrics.originalFileSize));
      form.set("compressed_file_size", String(photoUploadMetrics.compressedFileSize));
      form.set("upload_duration_ms", String(photoUploadMetrics.uploadDurationMs));
    }
    for (const [k, v] of Object.entries(antiBuddyBodyFields())) {
      form.set(k, v);
    }

    startDevTimer("punch_save");
    let res: Response | null = null;
    let data: { error?: string; id?: string; warning_message?: string; missing_rest_in?: boolean } =
      {};
    try {
      res = await fetch("/api/attendance/photo-proof", { method: "POST", body: form });
      data = (await res.json().catch(() => ({}))) as typeof data;
    } finally {
      endDevTimer("punch_save");
    }
    if (!res.ok) throw new Error(data.error || "Could not save photo proof punch");
    if (data.warning_message) {
      setToastVariant("warning");
      setToast(data.warning_message);
    }
    return data as { id: string; missing_rest_in?: boolean };
  }

  function releasePunchLock() {
    punchLockRef.current = false;
    setTapLocked(false);
    setPunchProcessing(false);
  }

  function scheduleSelfieUploadAfterPunch(
    attendanceId: string,
    staffId: string,
    manual: string,
    preview: SelfieProofPreview,
  ) {
    selfieBgCancelRef.current?.();
    setSelfieUploadWarning(t("clock.selfieUploadPending"));
    selfieBgCancelRef.current = scheduleSelfieBackgroundUpload(
      {
        attendanceId,
        shopId,
        punchQrToken: punchQrToken ?? "",
        file: preview.file,
        staffId: useManualCode ? undefined : staffId,
        staffIdentifier: useManualCode ? manual : undefined,
      },
      (update) => {
        if (!update) {
          setSelfieUploadWarning(null);
          setSelfieProofPreview(null);
          setSelfieCapturedAt(null);
          setSelfieProofForAction(null);
          return;
        }
        if (update.phase === "uploading" || update.phase === "retrying") {
          setSelfieUploadWarning(t("clock.selfieUploadPending"));
          return;
        }
        if (update.phase === "success") {
          logSelfiePipeline("background attach complete", {
            attendanceId,
            path: update.path,
          });
          setSelfieUploadWarning(null);
          setSelfieProofPreview(null);
          setSelfieCapturedAt(null);
          setSelfieProofForAction(null);
          return;
        }
        if (update.phase === "failed") {
          setSelfieUploadWarning(null);
          setToastVariant("warning");
          setToast(t("clock.selfieUploadFailed"));
        }
      },
    );
  }

  function punchSuccessToastMessage(
    action: PunchActionType,
    missingRestIn: boolean,
  ): { message: string; variant: "success" | "warning" } {
    if (action === "rest_out") return { message: t("clock.onBreakToast"), variant: "success" };
    if (action === "rest_in") return { message: t("clock.backFromBreakToast"), variant: "success" };
    if (action === "clock_out" && missingRestIn) {
      return { message: t("clock.missingRestInToast"), variant: "warning" };
    }
    return { message: translatePunchSuccessToast(t, action), variant: "success" };
  }

  function punch(action_type: PunchActionType) {
    // Confirm clock out while still on break (Rest In missing).
    if (
      action_type === "clock_out" &&
      onBreakNow &&
      !skipMissingRestInConfirmRef.current
    ) {
      setMissingRestInConfirm(true);
      return;
    }
    skipMissingRestInConfirmRef.current = false;

    if (
      action_type === "clock_out" &&
      unfinishedTaskCount > 0 &&
      !skipClockOutTaskWarningRef.current
    ) {
      setClockOutTasksWarning(true);
      return;
    }
    skipClockOutTaskWarningRef.current = false;

    const usePhotoProof =
      !gpsVerified && photoProofReady && isPhotoProofEnabledForShop(shopForPunch);
    if (punchLockRef.current || tapLocked) return;
    if (!gpsVerified && !usePhotoProof) return;

    const manual = identifier.trim();
    const staffId = useManualCode ? "" : effectiveStaffId;

    if (!useManualCode && !staffId) {
      setPunchError(t("clock.selectStaffFromList"));
      return;
    }
    if (useManualCode && !manual) {
      setPunchError(t("clock.enterStaffCodeOrScan"));
      return;
    }

    const smartCheck = validateSmartPunch(
      action_type,
      (todayStatus?.punch_validation_rows ?? []) as AttendanceRecord[],
      shopName,
      SMART_PUNCH_DUPLICATE_WINDOW_MS,
    );
    if (!smartCheck.ok) {
      setPunchError(smartCheck.message);
      return;
    }

    if (
      selfieProofRequired &&
      (!selfieProofPreview || !selfieCapturedAt || selfieProofForAction !== action_type)
    ) {
      setPunchError(t("clock.selfieRequired"));
      return;
    }

    punchLockRef.current = true;
    setTapLocked(true);
    setPunchProcessing(true);
    setPunchError(null);
    setToast(null);

    if (useManualCode) {
      const byCode = findStaffByCode(shopStaff, manual);
      if (byCode) persistStaffSelection(byCode);
    } else {
      const byId = shopStaff.find((s) => s.id === staffId);
      if (byId) persistStaffSelection(byId);
    }

    const totalStart = punchTimeStart();
    punchTimeSectionStart("total_punch");
    punchMark("punch total start (fast save first)");

    void (async () => {
      try {
        const precheck = await getPunchPrecheck(staffId, manual, action_type);
        if (!precheck.ok) {
          setToast(null);
          window.setTimeout(() => void fetchTodayStatus(), 0);
          releasePunchLock();
          punchTimeSectionEnd("total_punch");
          return;
        }
        if (precheck.requireSelfieProof && !selfieLocalReady) {
          setPunchError(t("clock.selfieRequired"));
          setToast(null);
          window.setTimeout(() => void fetchTodayStatus(), 0);
          releasePunchLock();
          punchTimeSectionEnd("total_punch");
          return;
        }

        const pendingSelfie =
          selfieProofPreview && selfieCapturedAt
            ? { preview: selfieProofPreview, capturedAt: selfieCapturedAt }
            : null;

        let missingRestIn = false;
        if (usePhotoProof) {
          punchTimeSectionStart("photo_upload");
          const photoData = await postPhotoProofAttendance(action_type, staffId, manual);
          missingRestIn = photoData.missing_rest_in === true;
          punchTimeSectionEnd("photo_upload");
          clearPhotoProofSession();
        } else {
          const verified = getVerifiedGpsForPunch();
          const data = await postFastAttendance(
            verified,
            action_type,
            staffId,
            manual,
            null,
            pendingSelfie ? { capturedAt: pendingSelfie.capturedAt } : null,
          );
          missingRestIn = data.missing_rest_in === true;
          logSelfiePipeline("database saved", {
            attendanceId: data.id,
            selfiePending: Boolean(pendingSelfie),
          });
          scheduleBackgroundEnrich(data.id, shopId, verified.accuracyMeters);

          setSelfieProofRequired(false);
          setSelfieChallengeToken(null);
          setSelfieProofError(null);
          resetIndoorVerifyFailures(shopId, effectiveStaffId);

          {
            const successToast = punchSuccessToastMessage(action_type, missingRestIn);
            setToastVariant(successToast.variant);
            setToast(successToast.message);
          }
          setTodayStatus((prev) =>
            applyOptimisticPunchToTodayStatus(prev, action_type, { usedPhotoProof: false }),
          );
          if (action_type === "clock_in") {
            setTasksRefreshKey((k) => k + 1);
          }

          punchTime("punch UI feedback", totalStart);
          punchTimeSectionEnd("total_punch");

          window.setTimeout(() => refreshAttendancePanels(), 150);

          if (pendingSelfie) {
            scheduleSelfieUploadAfterPunch(data.id, staffId, manual, pendingSelfie.preview);
          }

          window.setTimeout(() => {
            releasePunchLock();
          }, PUNCH_DEBOUNCE_MS);
          return;
        }

        setSelfieProofRequired(false);
        setSelfieChallengeToken(null);
        setSelfieProofError(null);
        resetIndoorVerifyFailures(shopId, effectiveStaffId);

        {
          const successToast = punchSuccessToastMessage(action_type, missingRestIn);
          setToastVariant(successToast.variant);
          setToast(successToast.message);
        }
        setTodayStatus((prev) =>
          applyOptimisticPunchToTodayStatus(prev, action_type, { usedPhotoProof: usePhotoProof }),
        );
        if (action_type === "clock_in") {
          setTasksRefreshKey((k) => k + 1);
        }

        punchTime("punch UI feedback", totalStart);
        punchTimeSectionEnd("total_punch");

        window.setTimeout(() => refreshAttendancePanels(), 150);

        window.setTimeout(() => {
          releasePunchLock();
        }, PUNCH_DEBOUNCE_MS);
      } catch (e) {
        setPunchError(e instanceof Error ? e.message : "Could not save punch. Tap to try again.");
        setToast(null);
        releasePunchLock();
        punchTime("punch total (failed)", totalStart);
        punchTimeSectionEnd("total_punch");
        window.setTimeout(() => void fetchTodayStatus(), 0);
      }
    })();
  }

  function smartPunchButtonLabel(): string {
    if (punchProcessing || tapLocked) return t("clock.processing");
    if (selfieUploading) return t("clock.uploadingSelfie");
    if (photoUploading) return t("clock.uploading");
    if (!hasPunchGate) return t("clock.scanShopQr");
    if (!canPunchNow) {
      if (photoProofUnlocked && !photoProofActive) return t("clock.waitingLocation");
      if (showPhotoProof) return t("clock.takePhotoProof");
      return t("clock.waitingLocation");
    }
    return smartPunchIsClockIn ? t("clock.clockInEmoji") : t("clock.clockOutEmoji");
  }

  if (!validShopId) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-red-600 dark:text-red-400">{t("clock.invalidShopLink")}</p>
      </div>
    );
  }

  if (subscriptionBlocked) {
    return (
      <SubscriptionRequired
        message={subscriptionBlocked.message}
        companyName={subscriptionBlocked.companyName}
        statusLabel={subscriptionBlocked.statusLabel}
      />
    );
  }

  if (pageLoading && !shopName && !loadError) {
    return <ClockScreenSkeleton message={t("clock.loadingPage")} />;
  }

  if (loadError && !shopForPunch) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{t("clock.failedLoadTitle")}</h1>
        <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600"
        >
          {t("clock.retry")}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-8 sm:py-10">
      <header className="text-center">
        <p className="text-xs uppercase tracking-wide text-zinc-500">{t("clock.pageTitle")}</p>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          {shopName || "…"}
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {photoProofReady ? t("clock.photoProofReadyHint") : t("clock.locationVerifyHint")}
        </p>
      </header>

      {qrTokenError ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          {qrTokenError}
        </p>
      ) : null}

      {showGpsCard ? (
        <LocationStatusCard
          indoorAttemptLabel={
            showIndoorAttemptStatus ? indoorVerifyAttemptLabel(indoorFailCount) : null
          }
        />
      ) : (
        <section className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-300">
          <p className="font-semibold">{t("clock.loadingShop")}</p>
          <p className="mt-1 text-xs opacity-90">{t("clock.loadingShopHint")}</p>
        </section>
      )}

      {photoProofUnlocked && hasStaffForPunch && !photoProofActive ? (
        <section className="rounded-xl border border-violet-300 bg-violet-50 px-4 py-3 text-sm text-violet-950 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-100">
          <p className="font-semibold">{t("clock.indoorUnstable")}</p>
          <p className="mt-1 text-xs opacity-90">{t("clock.indoorUsePhotoProof")}</p>
          <button
            type="button"
            disabled={tapLocked}
            onClick={() => setPhotoProofActive(true)}
            className="mt-3 w-full rounded-lg bg-violet-700 px-3 py-3 text-sm font-semibold text-white disabled:opacity-50 dark:bg-violet-600"
          >
            {t("clock.usePhotoProof")}
          </button>
        </section>
      ) : null}

      {selfieProofRequired && hasStaffForPunch ? (
        <>
          <SelfieProofCapture
            staffName={selectedStaffLabel || "—"}
            shopName={shopName || "—"}
            actionLabel={smartPunchIsClockIn ? t("clock.clockIn") : t("clock.clockOut")}
            dateTimeLabel={formatMalaysiaRecordedAt(new Date().toISOString())}
            error={selfieProofError}
            onPhotoReady={(preview) => {
              try {
                setSelfieProofPreview(preview);
                if (!preview) {
                  setSelfieCapturedAt(null);
                  setSelfieProofForAction(null);
                  return;
                }
                setSelfieCapturedAt(new Date().toISOString());
                setSelfieProofForAction(smartPunchAction);
                setSelfieProofError(null);
                setSelfieUploadWarning(null);
              } catch (e) {
                setSelfieProofError(
                  e instanceof Error ? e.message : "Could not save selfie preview.",
                );
              }
            }}
          />
          {selfieUploadWarning ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
              {selfieUploadWarning}
            </p>
          ) : null}
        </>
      ) : null}

      {showPhotoProof && hasStaffForPunch ? (
        <PhotoProofCapture
          shopName={shopName}
          staffName={selectedStaffLabel || "—"}
          gpsStatusLabel={formatPhotoProofGpsStatus(gpsSnap)}
          disabled={tapLocked}
          uploading={photoUploading}
          uploadProgress={photoUploadProgress}
          uploadSlow={photoUploadSlow}
          uploadError={photoUploadError}
          uploaded={Boolean(photoProofPath)}
          onPhotoReady={handlePhotoReady}
          onRetryUpload={retryPhotoUpload}
        />
      ) : null}

      {usingEmployeeSession && employeeSessionStaffId ? (
        <section className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100">
          <p className="font-semibold">
            {t("clock.clockingAsVerified").replace(
              "{name}",
              employeeSessionName ||
                shopStaff.find((s) => s.id === employeeSessionStaffId)?.staff_name ||
                "—",
            )}
          </p>
          <p className="mt-1 text-xs opacity-90">
            {t("clock.shopLabelVerified").replace("{shop}", shopName || "—")}
          </p>
        </section>
      ) : null}

      {usingRememberedStaff &&
      rememberedStaff &&
      !staffPickerExpanded &&
      !usingEmployeeSession &&
      !qrRequiresEmployeeLogin ? (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
          <p className="font-semibold">
            {t("clock.rememberedStaffTitle").replace("{name}", rememberedStaff.staff_name)}
          </p>
          <p className="mt-1 text-xs opacity-90">
            {t("clock.rememberedStaffHint").replace("{code}", rememberedStaff.staff_code)}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={tapLocked}
              onClick={handleChangeStaff}
              className="flex-1 rounded-lg border border-current/30 bg-white/70 px-3 py-2 text-sm font-semibold hover:bg-white dark:bg-black/20 dark:hover:bg-black/30 disabled:opacity-50"
            >
              {t("clock.changeStaff")}
            </button>
            <button
              type="button"
              disabled={tapLocked}
              onClick={handleForgetStaff}
              className="flex-1 rounded-lg border border-current/30 bg-white/70 px-3 py-2 text-sm font-semibold hover:bg-white dark:bg-black/20 dark:hover:bg-black/30 disabled:opacity-50"
            >
              {t("clock.forgetStaff")}
            </button>
          </div>
        </section>
      ) : null}

      <div className={`flex flex-col gap-3 ${hideStaffIdentityPicker ? "hidden" : ""}`}>
        <div className="flex gap-2 text-sm">
          <button
            type="button"
            disabled={tapLocked}
            className={`flex-1 rounded-lg border px-3 py-2 font-medium disabled:opacity-50 ${
              !useManualCode
                ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                : "border-zinc-300 dark:border-zinc-600"
            }`}
            onClick={() => setUseManualCode(false)}
          >
            {t("clock.selectNameTab")}
          </button>
          <button
            type="button"
            disabled={tapLocked}
            className={`flex-1 rounded-lg border px-3 py-2 font-medium disabled:opacity-50 ${
              useManualCode
                ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                : "border-zinc-300 dark:border-zinc-600"
            }`}
            onClick={() => setUseManualCode(true)}
          >
            {t("clock.staffCodeTab")}
          </button>
        </div>

        {!useManualCode ? (
          <label className="flex flex-col gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-200">
            {t("clock.yourName")}
            <select
              className="rounded-lg border border-zinc-300 bg-white px-3 py-3 text-base dark:border-zinc-600 dark:bg-zinc-900"
              value={selectedStaffId}
              onChange={(e) => handleStaffSelectChange(e.target.value)}
              disabled={tapLocked || shopStaff.length === 0}
            >
              {shopStaff.length === 0 ? (
                <option value="">
                  {pageLoading ? t("clock.loadingStaff") : t("clock.noStaffAssigned")}
                </option>
              ) : (
                shopStaff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.staff_name} ({s.staff_code})
                  </option>
                ))
              )}
            </select>
          </label>
        ) : (
          <label className="flex flex-col gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-200">
            {t("clock.staffCodeOrCard")}
            <input
              className="rounded-lg border border-zinc-300 bg-white px-3 py-3 font-mono text-base dark:border-zinc-600 dark:bg-zinc-900"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              onBlur={handleManualCodeBlur}
              placeholder={t("clock.staffCodePlaceholder")}
              autoCapitalize="characters"
              autoCorrect="off"
              inputMode="text"
              disabled={tapLocked}
            />
          </label>
        )}
      </div>

      {hasStaffForPunch ? (
        <StaffTodayStatusCard
          staffName={selectedStaffLabel || "—"}
          summary={todayStatus}
          loading={todayStatusLoading}
          error={todayStatusError}
          sessions={scheduleInfo?.today_shifts ?? []}
          fixedSchedule={
            scheduleInfo?.mode === "fixed"
              ? {
                  start_time:
                    scheduleInfo.today?.start_time ?? scheduleInfo.schedule?.start_time ?? "",
                  end_time:
                    scheduleInfo.today?.end_time ?? scheduleInfo.schedule?.end_time ?? "",
                }
              : null
          }
          canRequestCorrection={Boolean(
            (punchQrToken || employeePortalMode) &&
              (todayStatus?.attendance_issues?.missing_clock_in ||
                todayStatus?.attendance_issues?.missing_clock_out ||
                scheduleInfo?.today_shifts?.some((s) =>
                  ["missing_clock_out", "absent"].includes(String(s.shift_status ?? "")),
                )),
          )}
          onRequestCorrection={() => openForgotPunch(forgotPunchSuggestedType)}
        />
      ) : null}

      {hasStaffForPunch && effectiveStaffId && isClockedIn ? (
        <ClockTodayTasksPanel
          shopId={shopId}
          shopName={shopName}
          staffId={effectiveStaffId}
          visible={isClockedIn}
          refreshKey={tasksRefreshKey}
          onUnfinishedCount={setUnfinishedTaskCount}
        />
      ) : null}

      {hasStaffForPunch && scheduleInfo?.mode === "shift_based" ? (
        <Link
          href={`/shop/${encodeURIComponent(shopId)}/clock/schedule?shop_id=${encodeURIComponent(shopId)}${
            useManualCode
              ? `&staff_identifier=${encodeURIComponent(identifier.trim())}`
              : `&staff_id=${encodeURIComponent(effectiveStaffId)}`
          }`}
          className="flex w-full items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                {t("employee.schedule.mySchedule")}
              </p>
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                {t("employee.schedule.thisWeekNextWeek")}
              </p>
            </div>
          </div>
          <span className="text-zinc-400">›</span>
        </Link>
      ) : null}

      {hasStaffForPunch && scheduleInfo?.warning ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          {scheduleInfo.warning}
        </p>
      ) : null}

      {hasStaffForPunch && (punchQrToken || employeePortalMode) ? (
        <button
          type="button"
          onClick={() => openForgotPunch(forgotPunchSuggestedType)}
          className="w-full rounded-xl border border-teal-300 bg-teal-50 py-3 text-sm font-semibold text-teal-900 dark:border-teal-800 dark:bg-teal-950/30 dark:text-teal-100"
        >
          {t("employee.status.forgot_punch_request")}
        </button>
      ) : null}

      {hasStaffForPunch && attendancePhaseNow === "working" ? (
        <button
          type="button"
          disabled={clockDisabled}
          onClick={() => punch("rest_out")}
          className="w-full rounded-xl border border-amber-300 bg-amber-50 py-3 text-base font-semibold text-amber-900 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"
        >
          {t("clock.restOut")}
        </button>
      ) : null}

      {hasStaffForPunch && attendancePhaseNow === "on_break" ? (
        <button
          type="button"
          disabled={clockDisabled}
          onClick={() => punch("rest_in")}
          className="w-full rounded-xl border border-sky-300 bg-sky-50 py-3 text-base font-semibold text-sky-900 disabled:cursor-not-allowed disabled:opacity-50 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-100"
        >
          {t("clock.restIn")}
        </button>
      ) : null}

      <ClockPunchButton
        label={smartPunchButtonLabel()}
        isClockIn={smartPunchIsClockIn}
        disabled={clockDisabled}
        tapLocked={tapLocked}
        processing={punchProcessing}
        onPunch={() => punch(smartPunchAction)}
      />

      {hasStaffForPunch && (punchQrToken || employeePortalMode) ? (
        <ForgotPunchRequestDialog
          open={forgotPunchOpen}
          onClose={() => {
            setForgotPunchOpen(false);
            setForgotPunchSuggestedOverride(null);
          }}
          shopId={shopId}
          punchQrToken={punchQrToken}
          useEmployeeSession={employeePortalMode}
          staffId={useManualCode ? "" : effectiveStaffId}
          staffIdentifier={useManualCode ? identifier.trim() : ""}
          useManualCode={useManualCode}
          suggestedType={forgotPunchSuggestedType}
          onSubmitted={() => refreshAttendancePanels()}
        />
      ) : null}

      {hasStaffForPunch && (punchQrToken || employeePortalMode || Boolean(effectiveStaffId)) ? (
        <StaffMyAttendanceSection
          shopId={shopId}
          staffId={useManualCode ? "" : effectiveStaffId}
          staffIdentifier={useManualCode ? identifier.trim() : ""}
          useManualCode={useManualCode}
          punchQrToken={punchQrToken}
          useEmployeeSession={employeePortalMode}
          refreshKey={historyRefreshKey}
          onRequestCorrection={({ suggestedType }) => openForgotPunch(suggestedType)}
        />
      ) : null}

      {missingRestInConfirm ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl dark:bg-zinc-900">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              {t("clock.missingRestInConfirmTitle")}
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              {t("clock.missingRestInConfirmBody")}
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row-reverse">
              <button
                type="button"
                onClick={() => {
                  setMissingRestInConfirm(false);
                  skipMissingRestInConfirmRef.current = true;
                  punch("clock_out");
                }}
                className="flex-1 rounded-xl bg-red-600 py-3 text-sm font-semibold text-white dark:bg-red-700"
              >
                {t("clock.clockOutAnyway")}
              </button>
              <button
                type="button"
                onClick={() => setMissingRestInConfirm(false)}
                className="flex-1 rounded-xl border border-zinc-300 py-3 text-sm font-semibold text-zinc-700 dark:border-zinc-600 dark:text-zinc-200"
              >
                {t("clock.cancel")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ClockOutTasksWarning
        open={clockOutTasksWarning}
        shopId={shopId}
        staffId={effectiveStaffId}
        onContinue={() => {
          setClockOutTasksWarning(false);
          skipClockOutTaskWarningRef.current = true;
          punch("clock_out");
        }}
        onCancel={() => setClockOutTasksWarning(false)}
      />

      <Toast message={toast} variant={toastVariant} onDismiss={dismissToast} />
      {loadError ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-center text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          {loadError}
        </p>
      ) : null}
      {punchError ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-center text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">
          {punchError}
        </p>
      ) : null}
    </div>
  );
}

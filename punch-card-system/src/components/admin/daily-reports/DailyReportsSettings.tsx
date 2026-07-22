"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/LanguageProvider";
import type { Locale } from "@/lib/i18n/types";
import { DailyReportPreview } from "./DailyReportPreview";
import { DailyReportLogs } from "./DailyReportLogs";

type Shop = { id: string; name: string };

type Settings = {
  enabled: boolean;
  recipient_emails: string[];
  send_time: string;
  shop_ids: string[];
  include_attendance: boolean;
  include_cleaning: boolean;
  report_locale: Locale;
};

function sendTimeToInput(value: string): string {
  const parts = value.split(":");
  return `${parts[0]?.padStart(2, "0") ?? "21"}:${parts[1]?.padStart(2, "0") ?? "15"}`;
}

export function DailyReportsSettings() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shops, setShops] = useState<Shop[]>([]);
  const [settings, setSettings] = useState<Settings>({
    enabled: false,
    recipient_emails: [],
    send_time: "21:15:00",
    shop_ids: [],
    include_attendance: true,
    include_cleaning: true,
    report_locale: "en",
  });
  const [emailText, setEmailText] = useState("");
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [logsKey, setLogsKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/daily-reports/settings", { credentials: "include" });
      if (!res.ok) throw new Error("load failed");
      const j = (await res.json()) as { settings: Settings; shops: Shop[] };
      setShops(j.shops ?? []);
      const s = j.settings;
      setSettings({
        enabled: s.enabled,
        recipient_emails: s.recipient_emails ?? [],
        send_time: s.send_time ?? "21:15:00",
        shop_ids: s.shop_ids ?? [],
        include_attendance: s.include_attendance !== false,
        include_cleaning: s.include_cleaning !== false,
        report_locale: s.report_locale ?? "en",
      });
      setEmailText((s.recipient_emails ?? []).join("\n"));
    } catch {
      setError(t("dailyReports.saveError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleShop = (shopId: string) => {
    setSettings((prev) => {
      const allIds = shops.map((s) => s.id);
      if (prev.shop_ids.length === 0) {
        return { ...prev, shop_ids: allIds.filter((id) => id !== shopId) };
      }
      const has = prev.shop_ids.includes(shopId);
      const next = has
        ? prev.shop_ids.filter((id) => id !== shopId)
        : [...prev.shop_ids, shopId];
      if (next.length === allIds.length) return { ...prev, shop_ids: [] };
      return { ...prev, shop_ids: next };
    });
  };

  const isShopSelected = (shopId: string) =>
    settings.shop_ids.length === 0 || settings.shop_ids.includes(shopId);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const recipient_emails = emailText
        .split(/[\n,;]+/)
        .map((e) => e.trim())
        .filter(Boolean);
      const res = await fetch("/api/admin/daily-reports/settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...settings,
          recipient_emails,
          send_time: sendTimeToInput(settings.send_time),
        }),
      });
      const j = (await res.json()) as { error?: string; settings?: Settings };
      if (!res.ok) throw new Error(j.error ?? "save failed");
      if (j.settings) {
        setSettings(j.settings);
        setEmailText(j.settings.recipient_emails.join("\n"));
      }
      setMessage(t("dailyReports.saved"));
      setLogsKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("dailyReports.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewHtml(null);
    try {
      const res = await fetch("/api/admin/daily-reports/preview", { credentials: "include" });
      const j = (await res.json()) as { html?: string; error?: string };
      if (!res.ok) throw new Error(j.error ?? "preview failed");
      setPreviewHtml(j.html ?? null);
    } catch {
      setPreviewError(t("dailyReports.previewError"));
    } finally {
      setPreviewLoading(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-zinc-500">{t("common.loading")}</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">{t("dailyReports.title")}</h1>
        <p className="mt-1 text-sm text-zinc-600">{t("dailyReports.subtitle")}</p>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm space-y-6">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => setSettings((s) => ({ ...s, enabled: e.target.checked }))}
            className="mt-1 h-4 w-4 rounded border-zinc-300"
          />
          <span>
            <span className="block text-sm font-medium text-zinc-900">{t("dailyReports.enabled")}</span>
            <span className="block text-xs text-zinc-500">{t("dailyReports.enabledHint")}</span>
          </span>
        </label>

        <div>
          <label className="block text-sm font-medium text-zinc-900">{t("dailyReports.recipients")}</label>
          <p className="text-xs text-zinc-500 mb-2">{t("dailyReports.recipientsHint")}</p>
          <textarea
            value={emailText}
            onChange={(e) => setEmailText(e.target.value)}
            rows={4}
            placeholder={t("dailyReports.recipientsPlaceholder")}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-900">{t("dailyReports.sendTime")}</label>
          <p className="text-xs text-zinc-500 mb-2">{t("dailyReports.sendTimeHint")}</p>
          <input
            type="time"
            value={sendTimeToInput(settings.send_time)}
            onChange={(e) => setSettings((s) => ({ ...s, send_time: `${e.target.value}:00` }))}
            className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-900">{t("dailyReports.shops")}</label>
          <p className="text-xs text-zinc-500 mb-2">{t("dailyReports.shopsHint")}</p>
          {shops.length === 0 ? (
            <p className="text-sm text-zinc-500">{t("dailyReports.shopsAll")}</p>
          ) : (
            <div className="space-y-2">
              {shops.map((shop) => (
                <label key={shop.id} className="flex items-center gap-2 text-sm text-zinc-800">
                  <input
                    type="checkbox"
                    checked={isShopSelected(shop.id)}
                    onChange={() => toggleShop(shop.id)}
                    className="h-4 w-4 rounded border-zinc-300"
                  />
                  {shop.name}
                </label>
              ))}
              {settings.shop_ids.length === 0 && (
                <p className="text-xs text-zinc-500">{t("dailyReports.shopsAll")}</p>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-sm text-zinc-800">
            <input
              type="checkbox"
              checked={settings.include_attendance}
              onChange={(e) => setSettings((s) => ({ ...s, include_attendance: e.target.checked }))}
              className="h-4 w-4 rounded border-zinc-300"
            />
            {t("dailyReports.includeAttendance")}
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-800">
            <input
              type="checkbox"
              checked={settings.include_cleaning}
              onChange={(e) => setSettings((s) => ({ ...s, include_cleaning: e.target.checked }))}
              className="h-4 w-4 rounded border-zinc-300"
            />
            {t("dailyReports.includeCleaning")}
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-900 mb-1">{t("dailyReports.reportLocale")}</label>
          <select
            value={settings.report_locale}
            onChange={(e) => setSettings((s) => ({ ...s, report_locale: e.target.value as Locale }))}
            className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          >
            <option value="en">{t("dailyReports.localeEn")}</option>
            <option value="zh">{t("dailyReports.localeZh")}</option>
            <option value="ms">{t("dailyReports.localeMs")}</option>
          </select>
        </div>

        {message && <p className="text-sm text-emerald-700">{message}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? t("dailyReports.saving") : t("dailyReports.save")}
          </button>
          <button
            type="button"
            onClick={() => void handlePreview()}
            disabled={previewLoading}
            className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
          >
            {previewLoading ? t("dailyReports.previewing") : t("dailyReports.preview")}
          </button>
        </div>
      </div>

      {previewError && <p className="text-sm text-red-600">{previewError}</p>}
      {previewHtml && <DailyReportPreview html={previewHtml} />}

      <DailyReportLogs key={logsKey} />
    </div>
  );
}

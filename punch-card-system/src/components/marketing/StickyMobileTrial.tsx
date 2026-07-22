"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/LanguageProvider";
import { btnPrimary } from "./MarketingShell";

/** Fixed trial CTA for mobile landing page conversion. */
export function StickyMobileTrial() {
  const { t } = useI18n();

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(15,23,42,0.08)] backdrop-blur-md sm:hidden"
      aria-label={t("landing.stickyTrial.cta")}
    >
      <Link href="/register" className={btnPrimary("w-full text-base")}>
        {t("landing.stickyTrial.cta")}
      </Link>
      <p className="mt-1.5 text-center text-[10px] text-[#64748B]">
        {t("landing.stickyTrial.footer")}
      </p>
    </div>
  );
}

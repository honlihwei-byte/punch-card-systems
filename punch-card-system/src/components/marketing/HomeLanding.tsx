"use client";

import Link from "next/link";
import { planLimitsShortLabel, SUBSCRIPTION_PLANS } from "@/lib/subscription-plans";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { useI18n } from "@/components/i18n/LanguageProvider";
import { DashboardPreview } from "./DashboardPreview";
import { StickyMobileTrial } from "./StickyMobileTrial";
import { btnPrimary, btnSecondary } from "./MarketingShell";

// ─── Small primitives ────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-blue-700">
      {children}
    </p>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-3 text-2xl font-bold tracking-tight text-[#0F172A] sm:text-3xl">
      {children}
    </h2>
  );
}

function FeatureIcon({ children, bg }: { children: string; bg: string }) {
  return (
    <span
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg ${bg}`}
    >
      {children}
    </span>
  );
}

// ─── Score pill used in Section 5 ────────────────────────────────────────────

function ScoreCard({
  label,
  score,
  delta,
  what,
  color,
}: {
  label: string;
  score: number;
  delta: string;
  what: string;
  color: string;
}) {
  return (
    <div className={`rounded-2xl border p-5 ${color}`}>
      <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">{label}</p>
      <div className="mt-3 flex items-end justify-between">
        <span className="text-4xl font-extrabold leading-none">{score}</span>
        <span className="mb-1 rounded-full border border-current/20 bg-current/10 px-2 py-0.5 text-[11px] font-bold">
          {delta}
        </span>
      </div>
      <p className="mt-3 text-xs leading-relaxed opacity-70">{what}</p>
    </div>
  );
}

// ─── Outlet widget used in Section 6 ─────────────────────────────────────────

function OutletWidget({
  icon,
  title,
  value,
  sub,
  accent,
}: {
  icon: string;
  title: string;
  value: string;
  sub: string;
  accent: string;
}) {
  return (
    <div className={`flex flex-col gap-2 rounded-2xl border p-4 ${accent}`}>
      <span className="text-xl">{icon}</span>
      <p className="text-[10px] font-bold uppercase tracking-wide opacity-60">{title}</p>
      <p className="text-lg font-bold leading-snug">{value}</p>
      <p className="text-xs opacity-60">{sub}</p>
    </div>
  );
}

// ─── Static content shells (icons/colors) — copy comes from i18n ────────────

const PROBLEM_ITEMS = [
  { id: "unrecognised", icon: "👤" },
  { id: "memory", icon: "🧠" },
  { id: "tooLate", icon: "⏰" },
  { id: "subjective", icon: "⚖️" },
  { id: "motivation", icon: "📉" },
  { id: "noVisibility", icon: "🔍" },
] as const;

const SOLUTION_ITEMS = [
  { id: "attendance", icon: "🕐", bg: "bg-blue-50 text-blue-600" },
  { id: "taskAccountability", icon: "✅", bg: "bg-emerald-50 text-emerald-600" },
  { id: "photoVerification", icon: "📸", bg: "bg-violet-50 text-violet-600" },
  { id: "compliance", icon: "📋", bg: "bg-teal-50 text-teal-600" },
  { id: "multiShop", icon: "🏬", bg: "bg-amber-50 text-amber-600" },
  { id: "reliability", icon: "📊", bg: "bg-rose-50 text-rose-600" },
  { id: "notifications", icon: "🔔", bg: "bg-sky-50 text-sky-600" },
  { id: "scheduling", icon: "📅", bg: "bg-indigo-50 text-indigo-600" },
] as const;

const PHILOSOPHY_ITEMS = [
  { id: "recognition", icon: "🏆" },
  { id: "coaching", icon: "🎯" },
  { id: "visibility", icon: "🔦" },
  { id: "trust", icon: "🤝" },
] as const;

const SCORE_CARDS = [
  { id: "reliability", score: 84, color: "border-emerald-100 bg-emerald-50 text-emerald-800" },
  { id: "attendance", score: 91, color: "border-blue-100 bg-blue-50 text-blue-800" },
  { id: "taskCompletion", score: 78, color: "border-amber-100 bg-amber-50 text-amber-800" },
  {
    id: "operationalConsistency",
    score: 88,
    color: "border-violet-100 bg-violet-50 text-violet-800",
  },
] as const;

const EXAMPLE_ROWS = [
  { id: "lateArrival", color: "border-red-100 bg-red-50 text-red-700" },
  { id: "tasksMissed", color: "border-amber-100 bg-amber-50 text-amber-700" },
  { id: "earlyClockOut", color: "border-orange-100 bg-orange-50 text-orange-700" },
] as const;

const OUTLET_WIDGETS = [
  { id: "mostImproved", icon: "🚀", accent: "border-emerald-100 bg-emerald-50 text-emerald-900" },
  { id: "needsAttention", icon: "⚠️", accent: "border-amber-100 bg-amber-50 text-amber-900" },
  { id: "topStaff", icon: "⭐", accent: "border-blue-100 bg-blue-50 text-blue-900" },
  { id: "taskTrends", icon: "📈", accent: "border-violet-100 bg-violet-50 text-violet-900" },
  { id: "risks", icon: "🔒", accent: "border-rose-100 bg-rose-50 text-rose-900" },
  { id: "attendanceOverview", icon: "📅", accent: "border-teal-100 bg-teal-50 text-teal-900" },
] as const;

const FAQ_ITEMS = [
  "surveillance",
  "app",
  "multiOutlet",
  "reliabilityScore",
  "override",
  "trialLength",
] as const;

const HERO_BADGES = ["badge1", "badge2", "badge3", "badge4"] as const;

// ─── Main component ──────────────────────────────────────────────────────────

export function HomeLanding() {
  const { t } = useI18n();

  return (
    <>
      <div className="space-y-20 pb-36 sm:space-y-24 sm:pb-16">

        {/* ── SECTION 1: HERO ─────────────────────────────────────────────── */}
        <section className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
          <div className="text-center lg:text-left">
            <div className="mb-6 flex justify-center lg:justify-start">
              <BrandLogo size="hero" priority />
            </div>

            <p className="inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-blue-700">
              {t("landing.hero.badge")}
            </p>

            <h1 className="mt-5 text-3xl font-extrabold tracking-tight text-[#0F172A] sm:text-4xl lg:text-[2.75rem] lg:leading-[1.15]">
              {t("landing.hero.titleLine1")}{" "}
              <span className="text-[#2563EB]">{t("landing.hero.titleHighlight")}</span>
              <span className="block">{t("landing.hero.titleLine2")}</span>
            </h1>

            <p className="mt-5 text-base leading-relaxed text-[#64748B] sm:text-lg">
              {t("landing.hero.subtitleLine1")}
            </p>
            <p className="mt-2 text-base font-semibold text-[#0F172A] sm:text-lg">
              {t("landing.hero.subtitlePlain")}{" "}
              <span className="text-[#2563EB]">{t("landing.hero.subtitleHighlight")}</span>
            </p>

            <div className="mt-8 flex w-full flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start">
              <Link href="/register" className={btnPrimary("w-full sm:w-auto")}>
                {t("landing.hero.ctaStartTrial")}
              </Link>
              <Link
                href="mailto:support@lwopsflow.com?subject=Demo Request"
                className={btnSecondary("w-full sm:w-auto")}
              >
                {t("landing.hero.ctaBookDemo")}
              </Link>
            </div>

            <ul className="mt-6 flex flex-wrap justify-center gap-2 lg:justify-start">
              {HERO_BADGES.map((id) => (
                <li
                  key={id}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-[#0F172A] shadow-sm"
                >
                  {t(`landing.hero.${id}`)}
                </li>
              ))}
            </ul>
          </div>

          <div className="mx-auto w-full max-w-lg lg:max-w-none">
            <DashboardPreview />
          </div>
        </section>

        {/* ── SECTION 2: THE PROBLEM ──────────────────────────────────────── */}
        <section id="problem">
          <div className="text-center">
            <SectionLabel>{t("landing.problem.label")}</SectionLabel>
            <SectionHeading>{t("landing.problem.heading")}</SectionHeading>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-[#64748B] sm:text-base">
              {t("landing.problem.subtitle")}
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PROBLEM_ITEMS.map((p) => (
              <div
                key={p.id}
                className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <span className="mt-0.5 text-2xl">{p.icon}</span>
                <div>
                  <h3 className="text-sm font-bold text-[#0F172A]">
                    {t(`landing.problem.items.${p.id}.title`)}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-[#64748B]">
                    {t(`landing.problem.items.${p.id}.desc`)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── SECTION 3: THE SOLUTION ─────────────────────────────────────── */}
        <section id="features">
          <div className="text-center">
            <SectionLabel>{t("landing.solution.label")}</SectionLabel>
            <SectionHeading>{t("landing.solution.heading")}</SectionHeading>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-[#64748B] sm:text-base">
              {t("landing.solution.subtitle")}
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {SOLUTION_ITEMS.map((f) => (
              <div
                key={f.id}
                className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md"
              >
                <FeatureIcon bg={f.bg}>{f.icon}</FeatureIcon>
                <div>
                  <h3 className="text-sm font-bold text-[#0F172A]">
                    {t(`landing.solution.items.${f.id}.title`)}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-[#64748B]">
                    {t(`landing.solution.items.${f.id}.desc`)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── SECTION 4: FAIR MANAGEMENT ──────────────────────────────────── */}
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-900 via-[#1E3A5F] to-slate-900 px-6 py-12 shadow-xl sm:px-10 sm:py-16">
          <div className="mx-auto max-w-3xl text-center">
            <SectionLabel>{t("landing.philosophy.label")}</SectionLabel>
            <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
              {t("landing.philosophy.heading")}
            </h2>
          </div>

          <div className="mx-auto mt-10 max-w-4xl lg:grid lg:grid-cols-2 lg:gap-12 lg:items-start">
            <div className="space-y-5 text-[#94A3B8]">
              <p className="text-base leading-relaxed sm:text-lg">
                {t("landing.philosophy.body1Plain")}{" "}
                <span className="font-semibold text-white">
                  {t("landing.philosophy.body1Highlight")}
                </span>
              </p>
              <p className="text-sm leading-relaxed sm:text-base">{t("landing.philosophy.body2")}</p>
              <p className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-relaxed italic text-white/80">
                {t("landing.philosophy.quote")}
              </p>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:mt-0">
              {PHILOSOPHY_ITEMS.map((item) => (
                <div
                  key={item.id}
                  className="flex gap-3 rounded-2xl border border-white/10 bg-white/5 p-4"
                >
                  <span className="text-xl">{item.icon}</span>
                  <p className="text-sm leading-relaxed text-[#CBD5E1]">
                    {t(`landing.philosophy.items.${item.id}`)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <p className="mx-auto mt-10 max-w-xl text-center text-sm text-[#64748B]">
            {t("landing.philosophy.footerPlain")}{" "}
            <span className="font-semibold text-slate-400">
              {t("landing.philosophy.footerHighlight")}
            </span>
          </p>
        </section>

        {/* ── SECTION 5: RELIABILITY INSIGHTS ─────────────────────────────── */}
        <section id="insights">
          <div className="text-center">
            <SectionLabel>{t("landing.insights.label")}</SectionLabel>
            <SectionHeading>{t("landing.insights.heading")}</SectionHeading>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-[#64748B] sm:text-base">
              {t("landing.insights.subtitlePrefix")}{" "}
              <em>{t("landing.insights.subtitleEm")}</em> {t("landing.insights.subtitleSuffix")}
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SCORE_CARDS.map((card) => (
              <ScoreCard
                key={card.id}
                label={t(`landing.insights.cards.${card.id}.label`)}
                score={card.score}
                delta={t(`landing.insights.cards.${card.id}.delta`)}
                what={t(`landing.insights.cards.${card.id}.what`)}
                color={card.color}
              />
            ))}
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-[#0F172A]">
              {t("landing.insights.example.title")}
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              {EXAMPLE_ROWS.map((row) => (
                <div
                  key={row.id}
                  className={`flex flex-1 items-center justify-between rounded-xl border px-4 py-3 ${row.color}`}
                >
                  <span className="text-sm font-medium">
                    {t(`landing.insights.example.${row.id}`)}
                  </span>
                  <span className="text-sm font-bold">
                    {t(`landing.insights.example.${row.id}Impact`)}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-[#64748B]">{t("landing.insights.example.footer")}</p>
          </div>
        </section>

        {/* ── SECTION 6: OUTLET INTELLIGENCE ──────────────────────────────── */}
        <section id="outlets">
          <div className="text-center">
            <SectionLabel>{t("landing.outlets.label")}</SectionLabel>
            <SectionHeading>{t("landing.outlets.heading")}</SectionHeading>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-[#64748B] sm:text-base">
              {t("landing.outlets.subtitle")}
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {OUTLET_WIDGETS.map((w) => (
              <OutletWidget
                key={w.id}
                icon={w.icon}
                title={t(`landing.outlets.widgets.${w.id}.title`)}
                value={t(`landing.outlets.widgets.${w.id}.value`)}
                sub={t(`landing.outlets.widgets.${w.id}.sub`)}
                accent={w.accent}
              />
            ))}
          </div>
        </section>

        {/* ── PRICING ─────────────────────────────────────────────────────── */}
        <section id="pricing">
          <div className="text-center">
            <SectionLabel>{t("landing.pricingSection.label")}</SectionLabel>
            <SectionHeading>{t("landing.pricingSection.heading")}</SectionHeading>
            <p className="mt-3 text-sm text-[#64748B]">{t("landing.pricingSection.subtitle")}</p>
          </div>

          <div className="mx-auto mt-10 grid max-w-4xl gap-4 sm:grid-cols-3">
            {SUBSCRIPTION_PLANS.map((plan, idx) => (
              <div
                key={plan.slug}
                className={`relative flex flex-col rounded-2xl border bg-white p-6 shadow-sm ${
                  idx === 1
                    ? "border-[#2563EB] ring-2 ring-[#2563EB]/20"
                    : "border-slate-200"
                }`}
              >
                {idx === 1 ? (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#2563EB] px-3 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                    {t("landing.pricingSection.mostPopular")}
                  </span>
                ) : null}
                <p className="text-sm font-bold text-[#64748B]">{plan.name}</p>
                <p className="mt-2 text-3xl font-extrabold text-[#0F172A]">
                  {plan.priceLabel.replace("/month", "")}
                  <span className="text-base font-medium text-[#64748B]">/mo</span>
                </p>
                <p className="mt-1.5 text-sm font-semibold text-[#0F172A]">
                  {planLimitsShortLabel(plan)}
                </p>
                <p className="mt-3 text-xs leading-relaxed text-[#64748B]">{plan.description}</p>
                <Link
                  href="/register"
                  className={`mt-5 rounded-xl px-4 py-2.5 text-center text-sm font-bold transition ${
                    idx === 1
                      ? "bg-[#2563EB] text-white hover:bg-blue-700"
                      : "border border-slate-200 text-[#0F172A] hover:bg-slate-50"
                  }`}
                >
                  {t("landing.pricingSection.cta")}
                </Link>
              </div>
            ))}
          </div>
          <p className="mt-4 text-center text-xs text-[#64748B]">
            {t("landing.pricingSection.footer")}
          </p>
        </section>

        {/* ── FAQ ─────────────────────────────────────────────────────────── */}
        <section id="faq">
          <div className="text-center">
            <SectionLabel>{t("landing.faqSection.label")}</SectionLabel>
            <SectionHeading>{t("landing.faqSection.heading")}</SectionHeading>
          </div>

          <dl className="mx-auto mt-10 max-w-2xl divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white shadow-sm">
            {FAQ_ITEMS.map((id) => (
              <div key={id} className="px-6 py-5">
                <dt className="text-sm font-bold text-[#0F172A]">
                  {t(`landing.faqSection.items.${id}.q`)}
                </dt>
                <dd className="mt-2 text-sm leading-relaxed text-[#64748B]">
                  {t(`landing.faqSection.items.${id}.a`)}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* ── SECTION 7: FINAL CTA ────────────────────────────────────────── */}
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-[#0F172A] px-6 py-14 text-center shadow-xl sm:px-10 sm:py-16">
          <p className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-white/60">
            {t("landing.finalCta.label")}
          </p>
          <h2 className="mt-4 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
            {t("landing.finalCta.heading")}
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-slate-400 sm:text-base">
            {t("landing.finalCta.subtitle")}
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/register"
              className="w-full rounded-xl bg-[#2563EB] px-6 py-3.5 text-sm font-bold text-white shadow-md transition hover:bg-blue-600 sm:w-auto"
            >
              {t("landing.finalCta.ctaStartTrial")}
            </Link>
            <Link
              href="mailto:support@lwopsflow.com?subject=Demo Request"
              className="w-full rounded-xl border border-white/20 px-6 py-3.5 text-sm font-bold text-white transition hover:border-white/40 hover:bg-white/5 sm:w-auto"
            >
              {t("landing.finalCta.ctaBookDemo")}
            </Link>
          </div>
          <p className="mt-4 text-xs text-slate-500">{t("landing.finalCta.footer")}</p>
        </section>
      </div>

      <StickyMobileTrial />
    </>
  );
}

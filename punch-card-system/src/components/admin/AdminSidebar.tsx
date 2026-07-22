"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { BRAND_LOGO_PATH } from "@/components/brand/BrandLogo";
import { useI18n } from "@/components/i18n/LanguageProvider";

type NavItem = {
  labelKey: string;
  href?: string;
  icon: React.ReactNode;
  match: (path: string) => boolean;
  children?: NavItem[];
};

function NavIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center opacity-90">{children}</span>
  );
}

const NAV_ITEMS: NavItem[] = [
  {
    labelKey: "nav.dashboard",
    href: "/admin",
    match: (p) => p === "/admin",
    icon: (
      <NavIcon>
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} className="h-5 w-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      </NavIcon>
    ),
  },
  {
    labelKey: "nav.attendance",
    href: "/admin/attendance",
    match: (p) => p.startsWith("/admin/attendance"),
    icon: (
      <NavIcon>
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} className="h-5 w-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      </NavIcon>
    ),
  },
  {
    labelKey: "nav.schedule",
    href: "/admin/shift-schedule",
    match: (p) => p.startsWith("/admin/shift-schedule"),
    icon: (
      <NavIcon>
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} className="h-5 w-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </NavIcon>
    ),
  },
  {
    labelKey: "nav.shops",
    href: "/admin/shops",
    match: (p) => p.startsWith("/admin/shops"),
    icon: (
      <NavIcon>
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} className="h-5 w-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      </NavIcon>
    ),
  },
  {
    labelKey: "nav.employees",
    href: "/admin/staff",
    match: (p) => p.startsWith("/admin/staff"),
    icon: (
      <NavIcon>
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} className="h-5 w-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </NavIcon>
    ),
  },
  {
    labelKey: "nav.tasks",
    href: "/admin/tasks",
    match: (p) => p.startsWith("/admin/tasks"),
    icon: (
      <NavIcon>
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} className="h-5 w-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
      </NavIcon>
    ),
  },
  {
    labelKey: "nav.operationsCenter",
    href: "/admin/operations-center",
    match: (p) => p.startsWith("/admin/operations-center"),
    icon: (
      <NavIcon>
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} className="h-5 w-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
        </svg>
      </NavIcon>
    ),
  },
  {
    labelKey: "nav.notifications",
    match: (p) => p.startsWith("/admin/notifications"),
    icon: (
      <NavIcon>
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} className="h-5 w-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
      </NavIcon>
    ),
    children: [
      {
        labelKey: "nav.dailyReports",
        href: "/admin/notifications/daily-reports",
        match: (p) => p.startsWith("/admin/notifications/daily-reports"),
        icon: (
          <NavIcon>
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </NavIcon>
        ),
      },
    ],
  },
  {
    labelKey: "nav.settings",
    href: "/admin/profile",
    match: (p) => p.startsWith("/admin/profile") || p.startsWith("/admin/billing"),
    icon: (
      <NavIcon>
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} className="h-5 w-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </NavIcon>
    ),
  },
];

type Props = {
  open: boolean;
  onClose: () => void;
  featureAccess?: "full" | "billing_only" | "blocked";
  company?: { name: string; code: string };
};

function CompanyAvatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] text-sm font-bold text-white shadow-sm">
      {initials}
    </span>
  );
}

export function AdminSidebar({ open, onClose, featureAccess = "full", company }: Props) {
  const pathname = usePathname();
  const { t } = useI18n();

  const billingItems: NavItem[] = [
    {
      labelKey: "nav.billing",
      href: "/admin/billing",
      match: (p) =>
        p.startsWith("/admin/billing") ||
        p.startsWith("/billing") ||
        p.startsWith("/subscription-required"),
      icon: (
        <NavIcon>
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </svg>
        </NavIcon>
      ),
    },
    NAV_ITEMS.find((i) => i.labelKey === "nav.settings")!,
  ];

  const items = featureAccess === "billing_only" ? billingItems : NAV_ITEMS;

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-50 flex w-[240px] flex-col border-r border-[#E2E8F0] bg-white transition-transform duration-200 lg:translate-x-0 ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}
      aria-label="Admin sidebar"
    >
      <div className="flex h-16 items-center gap-3 border-b border-[#E2E8F0] px-4">
        {company ? (
          <>
            <CompanyAvatar name={company.name} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-[#0F172A]">{company.name}</p>
              <p className="text-[11px] text-[#64748B]">{company.code}</p>
            </div>
          </>
        ) : (
          <Link href="/admin" className="inline-flex shrink-0 items-center">
            <Image src={BRAND_LOGO_PATH} alt="LW OpsFlow" width={90} height={30} className="h-auto w-auto" style={{ height: 30, width: "auto" }} />
          </Link>
        )}
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        {items.map((item) => {
          const active = item.match(pathname);
          const hasChildren = item.children && item.children.length > 0;

          if (hasChildren) {
            return (
              <div key={item.labelKey} className="space-y-0.5">
                <div
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${
                    active ? "text-[#2563EB]" : "text-[#64748B]"
                  }`}
                >
                  {item.icon}
                  {t(item.labelKey)}
                </div>
                {item.children!.map((child) => {
                  const childActive = child.match(pathname);
                  return (
                    <Link
                      key={child.labelKey}
                      href={child.href!}
                      onClick={onClose}
                      className={`ml-4 flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${
                        childActive
                          ? "bg-gradient-to-r from-[#2563EB] to-[#3B82F6] text-white shadow-sm shadow-blue-500/20"
                          : "text-[#64748B] hover:bg-slate-50 hover:text-[#0F172A]"
                      }`}
                    >
                      {child.icon}
                      {t(child.labelKey)}
                    </Link>
                  );
                })}
              </div>
            );
          }

          return (
            <Link
              key={item.labelKey}
              href={item.href!}
              onClick={onClose}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                active
                  ? "bg-gradient-to-r from-[#2563EB] to-[#3B82F6] text-white shadow-sm shadow-blue-500/20"
                  : "text-[#64748B] hover:bg-slate-50 hover:text-[#0F172A]"
              }`}
            >
              {item.icon}
              {t(item.labelKey)}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-[#E2E8F0] px-4 py-3">
        <div className="flex items-center gap-2">
          <Image src={BRAND_LOGO_PATH} alt="LW OpsFlow" width={54} height={18} className="h-auto w-auto opacity-50" style={{ height: 18, width: "auto" }} />
          <p className="text-[10px] text-slate-400">Powered by LW OpsFlow</p>
        </div>
      </div>
    </aside>
  );
}

import type { Metadata } from "next";
import { AdminSessionGate } from "@/components/admin/AdminSessionGate";
import { DailyReportsSettings } from "@/components/admin/daily-reports/DailyReportsSettings";

export const metadata: Metadata = {
  title: "Daily Reports — LW OpsFlow",
};

export default function DailyReportsPage() {
  return (
    <AdminSessionGate>
      <div className="mx-auto max-w-4xl px-4 py-6">
        <DailyReportsSettings />
      </div>
    </AdminSessionGate>
  );
}

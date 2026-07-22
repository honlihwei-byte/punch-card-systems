import type { Locale } from "@/lib/i18n/types";

export type DailyReportSettingsRow = {
  id: string;
  company_id: string;
  enabled: boolean;
  recipient_emails: string[];
  send_time: string;
  shop_ids: string[];
  include_attendance: boolean;
  include_cleaning: boolean;
  report_locale: Locale;
  created_at: string;
  updated_at: string;
};

export type DailyReportStaffEntry = {
  name: string;
  detail?: string;
};

export type DailyReportShopSection = {
  shop_id: string;
  shop_name: string;
  attendance?: {
    present_count: number;
    late: DailyReportStaffEntry[];
    missing_clock_out: DailyReportStaffEntry[];
    never_clocked_in: DailyReportStaffEntry[];
  };
  cleaning?: {
    assigned: number;
    completed: number;
    incomplete: number;
    missing_photo_uploads: number;
  };
};

export type DailyReportPayload = {
  date: string;
  company_name: string;
  shops: DailyReportShopSection[];
  overall: {
    present: number;
    late: number;
    missing_clock_out: number;
    cleaning_completed: number;
    cleaning_total: number;
  };
  include_attendance: boolean;
  include_cleaning: boolean;
};

export type DailyReportLogRow = {
  id: string;
  company_id: string;
  report_date: string;
  recipient_emails: string[];
  status: "success" | "failed";
  error_message: string | null;
  sent_at: string;
};

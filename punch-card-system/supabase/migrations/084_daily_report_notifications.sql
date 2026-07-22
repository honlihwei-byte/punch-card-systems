-- Daily report email notifications (LW OpsFlow).

create table if not exists public.daily_report_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  enabled boolean not null default false,
  recipient_emails text[] not null default '{}',
  send_time time not null default '21:15:00',
  shop_ids uuid[] not null default '{}',
  include_attendance boolean not null default true,
  include_cleaning boolean not null default true,
  report_locale text not null default 'en' check (report_locale in ('en', 'zh', 'ms')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_report_settings_company_unique unique (company_id)
);

create index if not exists daily_report_settings_enabled_idx
  on public.daily_report_settings (enabled)
  where enabled = true;

create table if not exists public.daily_report_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  report_date date not null,
  recipient_emails text[] not null default '{}',
  status text not null check (status in ('success', 'failed')),
  error_message text,
  sent_at timestamptz not null default now()
);

create index if not exists daily_report_logs_company_sent_idx
  on public.daily_report_logs (company_id, sent_at desc);

create unique index if not exists daily_report_logs_company_date_success_uidx
  on public.daily_report_logs (company_id, report_date)
  where status = 'success';

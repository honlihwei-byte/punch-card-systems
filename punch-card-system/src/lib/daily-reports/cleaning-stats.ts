import { minRequiredTaskPhotos } from "@/lib/retail-tasks/task-submission-rules";
import { displayTaskStatus } from "@/lib/retail-tasks/task-status";
import { normalizePhotoRecords } from "@/lib/retail-tasks/task-proof-photos";
import type { TaskStatus } from "@/lib/retail-tasks/types";
import type { createAdminClient } from "@/lib/supabase/admin";

type Supabase = ReturnType<typeof createAdminClient>;

export type ShopCleaningStats = {
  assigned: number;
  completed: number;
  incomplete: number;
  missing_photo_uploads: number;
};

const COMPLETED_STATUSES = new Set<TaskStatus>(["verified", "exception_reported"]);

function isTaskCompleted(status: TaskStatus): boolean {
  return COMPLETED_STATUSES.has(status);
}

function isTaskIncomplete(status: TaskStatus, dueDate: string, dueTime: string | null): boolean {
  if (status === "missed") return true;
  if (isTaskCompleted(status)) return false;
  if (
    status === "pending" ||
    status === "in_progress" ||
    status === "rejected" ||
    status === "submitted" ||
    status === "submitted_late" ||
    status === "fair"
  ) {
    return true;
  }
  const display = displayTaskStatus(status, dueDate, dueTime);
  return display === "overdue";
}

export async function getCleaningStatsByShop(
  supabase: Supabase,
  companyId: string,
  shopIds: string[],
  date: string,
): Promise<Map<string, ShopCleaningStats>> {
  const stats = new Map<string, ShopCleaningStats>();
  for (const shopId of shopIds) {
    stats.set(shopId, { assigned: 0, completed: 0, incomplete: 0, missing_photo_uploads: 0 });
  }
  if (shopIds.length === 0) return stats;

  const { data: tasks, error } = await supabase
    .from("retail_tasks")
    .select("id, shop_id, status, due_date, due_time, photo_required, min_photos")
    .eq("company_id", companyId)
    .eq("category", "cleaning_check")
    .eq("due_date", date)
    .in("shop_id", shopIds);
  if (error) throw new Error(error.message);

  const rows = (tasks ?? []) as Array<{
    id: string;
    shop_id: string;
    status: TaskStatus;
    due_date: string;
    due_time: string | null;
    photo_required: boolean;
    min_photos: number | null;
  }>;

  if (rows.length === 0) return stats;

  const taskIds = rows.map((r) => r.id);
  const { data: submissions, error: subErr } = await supabase
    .from("retail_task_submissions")
    .select("task_id, photo_urls, submitted_at")
    .in("task_id", taskIds)
    .order("submitted_at", { ascending: false });
  if (subErr) throw new Error(subErr.message);

  const latestSubmissionByTask = new Map<string, { photo_urls: unknown; submitted_at: string }>();
  for (const sub of submissions ?? []) {
    const s = sub as { task_id: string; photo_urls: unknown; submitted_at: string };
    if (!latestSubmissionByTask.has(s.task_id)) {
      latestSubmissionByTask.set(s.task_id, s);
    }
  }

  for (const task of rows) {
    const bucket = stats.get(task.shop_id);
    if (!bucket) continue;
    bucket.assigned += 1;

    const photoRequired = minRequiredTaskPhotos({
      photo_required: task.photo_required === true,
      min_photos: task.min_photos ?? 0,
    });

    if (isTaskCompleted(task.status)) {
      bucket.completed += 1;
      if (photoRequired > 0) {
        const sub = latestSubmissionByTask.get(task.id);
        const photos = sub
          ? normalizePhotoRecords(sub.photo_urls, sub.submitted_at).length
          : 0;
        if (photos < photoRequired) bucket.missing_photo_uploads += 1;
      }
      continue;
    }

    if (isTaskIncomplete(task.status, task.due_date, task.due_time)) {
      bucket.incomplete += 1;
      if (photoRequired > 0) {
        const sub = latestSubmissionByTask.get(task.id);
        const photos = sub
          ? normalizePhotoRecords(sub.photo_urls, sub.submitted_at).length
          : 0;
        if (photos < photoRequired) bucket.missing_photo_uploads += 1;
      }
    }
  }

  return stats;
}

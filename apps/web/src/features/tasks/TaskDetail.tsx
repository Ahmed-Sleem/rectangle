/**
 * Task detail window.
 *
 * Opened from the board or the list, and reads the task from the rows already
 * loaded rather than refetching it, so opening a card is instant and cannot
 * show something different from the card that was clicked. Comments are the one
 * thing fetched on open, because they are not part of the list payload.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiClientError } from "@/shared/api/client";
import { getCurrentLanguage } from "@/shared/i18n";
import { Badge, Button, Overlay, Textarea } from "@/shared/ui";
import { addComment, listComments, type TaskRecord, type TaskStatus } from "./task-api";

/**
 * The moves offered from each status.
 *
 * This mirrors the backend's transition table. The backend remains the
 * authority — it rejects anything invalid — but offering a move that would be
 * refused is a button that lies, so the interface only shows real options.
 */
const NEXT_STATUSES: Record<TaskStatus, readonly TaskStatus[]> = {
  todo: ["in_progress", "blocked", "cancelled"],
  in_progress: ["todo", "blocked", "in_review", "done", "cancelled"],
  blocked: ["todo", "in_progress", "cancelled"],
  in_review: ["in_progress", "done", "blocked", "cancelled"],
  done: ["todo", "in_progress"],
  cancelled: ["todo"],
};

export interface TaskDetailProps {
  taskId: string | null;
  tasks: readonly TaskRecord[];
  canManage: boolean;
  onClose: () => void;
  onEdit: (task: TaskRecord) => void;
  onDelete: (task: TaskRecord) => void;
  onMove: (task: TaskRecord, status: TaskStatus) => void;
  moving: boolean;
}

export function TaskDetail({
  taskId,
  tasks,
  canManage,
  onClose,
  onEdit,
  onDelete,
  onMove,
  moving,
}: TaskDetailProps) {
  const { t } = useTranslation();
  const language = getCurrentLanguage();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");

  const task = tasks.find((candidate) => candidate.id === taskId) ?? null;

  const comments = useQuery({
    queryKey: ["task", taskId, "comments"],
    queryFn: () => listComments(taskId!),
    enabled: Boolean(taskId),
  });

  const post = useMutation({
    mutationFn: (body: string) => addComment(taskId!, body),
    onSuccess: async () => {
      setDraft("");
      await queryClient.invalidateQueries({ queryKey: ["task", taskId, "comments"] });
      // The card shows a comment count, so the list is stale once one is added.
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  if (!task) return null;

  const moments = new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" });
  const dates = new Intl.DateTimeFormat(language, { dateStyle: "medium" });
  const commentError =
    post.error instanceof ApiClientError ? post.error.message : post.error ? t("tasks.commentFailed") : null;

  return (
    <Overlay
      open={taskId !== null}
      title={task.title}
      description={`${task.projectCode} · ${task.projectName}`}
      size="lg"
      onClose={onClose}
      footer={
        canManage ? (
          <>
            <Button variant="danger" onClick={() => onDelete(task)}>{t("tasks.delete")}</Button>
            <Button variant="secondary" onClick={() => onEdit(task)}>{t("tasks.edit")}</Button>
          </>
        ) : null
      }
    >
      <div className="rect-task-detail">
        <dl className="rect-task-detail__facts">
          <div>
            <dt>{t("tasks.fieldStatus")}</dt>
            <dd><Badge tone="info">{t(`enums.taskStatus.${task.status}`)}</Badge></dd>
          </div>
          <div>
            <dt>{t("tasks.fieldPriority")}</dt>
            <dd><Badge tone="neutral">{t(`enums.taskPriority.${task.priority}`)}</Badge></dd>
          </div>
          <div>
            <dt>{t("tasks.fieldAssignee")}</dt>
            <dd>{task.assigneeName ?? t("tasks.unassigned")}</dd>
          </div>
          <div>
            <dt>{t("tasks.fieldDue")}</dt>
            <dd>{task.dueDate ? dates.format(new Date(`${task.dueDate}T00:00:00`)) : t("tasks.noDueDate")}</dd>
          </div>
        </dl>

        {task.description ? <p className="rect-task-detail__description">{task.description}</p> : null}

        {canManage || task.assigneeUserId ? (
          <div className="rect-task-detail__moves">
            {NEXT_STATUSES[task.status].map((status) => (
              <Button
                key={status}
                size="sm"
                variant="secondary"
                disabled={moving}
                onClick={() => onMove(task, status)}
              >
                {t(`enums.taskStatus.${status}`)}
              </Button>
            ))}
          </div>
        ) : null}

        <section className="rect-task-detail__comments" aria-label={t("tasks.comments")}>
          <h3 className="rect-task-detail__heading">{t("tasks.comments")}</h3>

          {comments.isLoading ? (
            <p className="rect-task-detail__note">{t("common.loading")}</p>
          ) : (comments.data?.comments.length ?? 0) === 0 ? (
            <p className="rect-task-detail__note">{t("tasks.commentsEmpty")}</p>
          ) : (
            <ul className="rect-task-detail__thread">
              {comments.data?.comments.map((comment) => (
                <li key={comment.id} className="rect-task-detail__comment">
                  <span className="rect-task-detail__comment-meta">
                    {comment.authorName ?? t("common.notAvailable")} · {moments.format(new Date(comment.createdAt))}
                  </span>
                  <span className="rect-task-detail__comment-body">{comment.body}</span>
                </li>
              ))}
            </ul>
          )}

          <form
            className="rect-task-detail__composer"
            onSubmit={(event) => {
              event.preventDefault();
              if (draft.trim()) post.mutate(draft.trim());
            }}
          >
            <Textarea
              rows={2}
              value={draft}
              aria-label={t("tasks.commentPlaceholder")}
              placeholder={t("tasks.commentPlaceholder")}
              onChange={(event) => setDraft(event.target.value)}
            />
            {commentError ? <p className="rect-task-detail__error" role="alert">{commentError}</p> : null}
            <Button type="submit" variant="secondary" disabled={!draft.trim() || post.isPending}>
              {t("tasks.commentSubmit")}
            </Button>
          </form>
        </section>
      </div>
    </Overlay>
  );
}

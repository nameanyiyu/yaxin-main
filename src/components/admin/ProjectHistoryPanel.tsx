'use client';

import { PROJECT_STATUS_LABELS } from '@/domain/preaudit/presentation';
import type { InterviewMessage, PreauditProject } from '@/domain/preaudit/types';

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

function messageRole(message: InterviewMessage): string {
  if (message.role === 'user') return '销售';
  if (message.role === 'assistant') return '审批助手';
  return '系统';
}

export default function ProjectHistoryPanel({ project }: { project: PreauditProject }) {
  const salesAnswers = Object.values(project.answers).filter((answer) => answer.source === 'sales').length;
  const reviewerAnswers = Object.values(project.answers).filter((answer) => answer.source === 'reviewer').length;
  const events = [
    {
      key: 'created',
      label: '项目创建',
      detail: `${project.salesName} 开始填写`,
      at: project.createdAt,
    },
    ...(project.review ? [{
      key: 'reviewed',
      label: '后台复核确认',
      detail: `${project.review.reviewerName}：${project.review.comments}${project.review.fieldChanges?.length ? `；复核时修订 ${project.review.fieldChanges.length} 个字段（${project.review.fieldChanges.map((change) => change.fieldKey).join('、')}）` : '；未修改销售原始字段'}`,
      at: project.review.reviewedAt,
    }] : []),
    ...(project.externalSubmission ? [{
      key: 'archived',
      label: '人工提交后归档',
      detail: project.externalSubmission.externalReference
        ? `外部审批单号：${project.externalSubmission.externalReference}`
        : '未登记外部审批单号',
      at: project.externalSubmission.archivedAt,
    }] : []),
  ].sort((left, right) => Date.parse(left.at) - Date.parse(right.at));

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1.3fr)_minmax(280px,.7fr)]">
      <section id="conversation" aria-labelledby="conversation-heading">
        <div className="flex items-end justify-between border-b border-[var(--border)] pb-3">
          <div>
            <h4 id="conversation-heading" className="font-bold">销售访谈记录</h4>
            <p className="mt-1 text-xs text-[var(--muted)]">共 {project.messages.length} 条消息，用于核对答案上下文。</p>
          </div>
        </div>
        {project.messages.length === 0 ? (
          <div className="py-8 text-sm text-[var(--muted)]">当前项目还没有已保存的访谈消息。</div>
        ) : (
          <div className="mt-4 space-y-3">
            {project.messages.map((message) => (
              <article key={message.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      message.role === 'user'
                        ? 'bg-[var(--brand-soft)] text-[var(--brand-strong)]'
                        : message.role === 'assistant'
                          ? 'bg-[var(--surface-muted)] text-[var(--ink)]'
                          : 'bg-amber-50 text-amber-800'
                    }`}>
                      {messageRole(message)}
                    </span>
                    {message.fieldKey && <span className="font-mono text-xs text-[var(--muted)]">{message.fieldKey}</span>}
                  </div>
                  <time className="text-xs text-[var(--muted)]">{formatDateTime(message.createdAt)}</time>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{message.content}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      <aside id="workflow" aria-labelledby="workflow-heading">
        <div className="border-b border-[var(--border)] pb-3">
          <h4 id="workflow-heading" className="font-bold">流程与数据来源</h4>
          <p className="mt-1 text-xs text-[var(--muted)]">状态与已知业务事件，不推测外部审批结果。</p>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-[var(--surface-muted)] p-3">
            <dt className="text-xs text-[var(--muted)]">当前状态</dt>
            <dd className="mt-1 font-semibold">{PROJECT_STATUS_LABELS[project.status]}</dd>
          </div>
          <div className="rounded-xl bg-[var(--surface-muted)] p-3">
            <dt className="text-xs text-[var(--muted)]">最近更新</dt>
            <dd className="mt-1 font-semibold">{formatDateTime(project.updatedAt)}</dd>
          </div>
          <div className="rounded-xl bg-[var(--surface-muted)] p-3">
            <dt className="text-xs text-[var(--muted)]">销售填写字段</dt>
            <dd className="mt-1 font-semibold">{salesAnswers} 项</dd>
          </div>
          <div className="rounded-xl bg-[var(--surface-muted)] p-3">
            <dt className="text-xs text-[var(--muted)]">后台修订字段</dt>
            <dd className="mt-1 font-semibold">{reviewerAnswers} 项</dd>
          </div>
        </dl>
        <ol className="mt-6 space-y-5">
          {events.map((event, index) => (
            <li key={event.key} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--brand-soft)] text-xs font-bold text-[var(--brand-strong)]">
                {index + 1}
              </span>
              <div>
                <p className="text-sm font-semibold">{event.label}</p>
                <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{event.detail}</p>
                <time className="mt-1 block text-xs text-[var(--muted)]">{formatDateTime(event.at)}</time>
              </div>
            </li>
          ))}
        </ol>
        {!project.externalSubmission && (
          <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
            外部 OA/飞书审批单状态尚未接入。系统会保存生成的飞书文档链接，并记录人工提交后的单号和归档时间。
          </p>
        )}
      </aside>
    </div>
  );
}

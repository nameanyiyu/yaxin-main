'use client';

import { getCommitmentGaps } from '@/domain/preaudit/reporting-flow';
import type { PreauditProject } from '@/domain/preaudit/types';

const ITEMS = [
  ['collectionCommitment', '回款承诺'],
  ['marginCommitment', '利润承诺'],
  ['deliveryCommitment', '交付承诺'],
  ['newOpportunityCommitment', '新商机承诺'],
  ['supplierCommitment', '供应商承诺'],
  ['divisionCommitment', '事业部综合承诺'],
] as const;

export default function CommitmentReviewCard({ project }: { project: PreauditProject }) {
  const gaps = getCommitmentGaps(project);
  const visible = ITEMS.filter(([key]) => key !== 'supplierCommitment' || project.answers.hasProcurement?.value === true);
  return (
    <div className="product-surface overflow-hidden">
      <div className="border-b border-amber-200 bg-amber-50 p-5 md:p-6">
        <p className="text-xs font-bold tracking-[0.12em] text-amber-800">正式承诺确认</p>
        <h2 className="mt-2 text-xl font-bold text-amber-950">请确认这些内容真实、可执行</h2>
        <p className="mt-2 text-sm leading-6 text-amber-900">承诺将进入审批材料，并用于后续回款、利润、交付和新商机跟踪。Agent 只整理销售已说明的事实，不代表系统替您作出承诺。</p>
      </div>
      <dl className="divide-y divide-[var(--border)]">
        {visible.map(([key, label]) => <div key={key} className="p-5 md:p-6"><dt className="text-sm font-bold">{label}</dt><dd className={`mt-2 whitespace-pre-wrap text-sm leading-7 ${project.answers[key] ? 'text-[var(--ink)]' : 'text-red-700'}`}>{String(project.answers[key]?.value ?? '尚未形成完整承诺')}</dd></div>)}
      </dl>
      {gaps.length > 0 && <div className="border-t border-red-200 bg-red-50 p-5 text-sm text-red-900 md:p-6"><p className="font-semibold">承诺仍不完整，暂不能送审</p><p className="mt-1">请返回对话继续补充目标、时间、责任人和保障措施。</p></div>}
    </div>
  );
}

'use client';

import { presentSalesReview } from '@/domain/preaudit/presentation';
import type { PreauditProject } from '@/domain/preaudit/types';

export default function FieldSummary({ project }: { project: PreauditProject }) {
  const summary = presentSalesReview(project);
  const unresolvedRisks = project.risks.filter((risk) => !risk.triggered && risk.missingKeys.length > 0);
  const statusLabel = {
    recorded: ['已记录', 'bg-emerald-50 text-emerald-700'],
    needs_confirmation: ['待销售确认', 'bg-amber-50 text-amber-800'],
    missing: ['待补充', 'bg-red-50 text-red-700'],
    backend_verification: ['待系统/后台核验', 'bg-sky-50 text-sky-800'],
  } as const;
  return (
    <div>
      <div className="flex flex-wrap justify-between gap-3 border-b border-slate-200 py-5 text-sm"><span><b className="text-slate-950">{summary.progress.completed}/{summary.progress.total}</b> 项模板必填已记录</span><span className={summary.triggeredRiskCount ? 'font-medium text-red-800' : 'text-slate-600'}>{summary.triggeredRiskCount} 项风险提示</span></div>
      {summary.missingSalesFields.length > 0 && <div className="border-b border-red-200 bg-red-50 px-4 py-4 text-sm text-red-900"><p className="font-medium">销售侧仍需补充</p><p className="mt-1 leading-6">{summary.missingSalesFields.map((field) => field.label).join('、')}</p></div>}
      {summary.triggeredRisks.length > 0 && <section className="border-b border-slate-200 py-5"><h2 className="text-sm font-semibold">已触发风险</h2><div className="mt-3 divide-y divide-slate-200">{summary.triggeredRisks.map((risk) => <article key={risk.ruleId} className="py-3"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium text-red-800">{risk.title}</p>{risk.source === 'ai' && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-800">AI识别 · 待复核</span>}</div><p className="mt-1 text-sm leading-6 text-slate-700">{risk.reason}</p>{risk.controlRequirement && <p className="mt-1 text-xs leading-5 text-slate-500">管控要求：{risk.controlRequirement}</p>}</article>)}</div></section>}
      {unresolvedRisks.length > 0 && <section className="border-b border-amber-200 bg-amber-50/60 py-5"><h2 className="text-sm font-semibold text-amber-950">待补充风险证据</h2><div className="mt-3 divide-y divide-amber-200">{unresolvedRisks.map((risk) => <article key={risk.ruleId} className="py-3"><p className="text-sm font-medium text-amber-950">{risk.title}</p><p className="mt-1 text-sm leading-6 text-amber-900">{risk.followUpQuestions.join(' ')}</p>{risk.controlRequirement && <p className="mt-1 text-xs leading-5 text-amber-800">管控要求：{risk.controlRequirement}</p>}</article>)}</div></section>}
      {summary.sections.map((section) => <section key={section.key} className="border-b border-slate-200 py-5 last:border-0"><h2 className="text-sm font-semibold text-slate-950">{section.label}</h2><dl className="mt-3 grid gap-x-6 gap-y-4 md:grid-cols-2">{section.fields.map((field) => { const [label, tone] = statusLabel[field.status]; return <div key={field.key} className={field.guidance ? 'md:col-span-2' : ''}><dt className="flex flex-wrap items-center gap-2 text-xs text-slate-500"><span>{field.label}{field.required ? ' *' : ''}</span><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone}`}>{label}</span></dt><dd className={`mt-1 whitespace-pre-wrap text-sm leading-6 ${field.answered ? 'text-slate-900' : 'text-slate-400'}`}>{field.answered ? field.value === true ? '是' : field.value === false ? '否' : String(field.value) : field.status === 'backend_verification' ? '由系统或后台补充' : '未填写'}</dd></div>; })}</dl></section>)}
    </div>
  );
}

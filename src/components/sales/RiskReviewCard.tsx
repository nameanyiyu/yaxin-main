'use client';

import type { PreauditProject } from '@/domain/preaudit/types';

export default function RiskReviewCard({ project }: { project: PreauditProject }) {
  const triggered = project.risks.filter((risk) => risk.triggered);
  const pending = project.risks.filter((risk) => !risk.triggered && risk.missingKeys.length > 0);
  const bg = String(project.answers.salesBg?.value ?? '待确认');
  return (
    <div className="product-surface overflow-hidden">
      <div className="border-b border-[var(--border)] p-5 md:p-6">
        <p className="text-xs font-semibold tracking-[0.12em] text-[var(--brand-strong)]">公司级规则 + {bg} 规则</p>
        <h2 className="mt-2 text-xl font-bold">系统风险核对</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">以下结论只来自后台已启用且适用于当前 BG 的规则。客户评级、黑白名单和供应商意见仍以系统或后台最终核验为准。</p>
      </div>
      {triggered.length === 0 && <p className="p-6 text-sm text-emerald-800">当前已填写信息未确认命中风险；这不替代后台最终核验。</p>}
      <div className="divide-y divide-[var(--border)]">
        {triggered.map((risk) => {
          const absolute = risk.controlLevel === 'absolute' || risk.severity === 'blocking';
          return <article key={risk.ruleId} className={absolute ? 'bg-red-50/70 p-5 md:p-6' : 'p-5 md:p-6'}>
            <div className="flex flex-wrap items-center gap-2"><h3 className={absolute ? 'font-bold text-red-900' : 'font-bold'}>{risk.title}</h3><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${absolute ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-900'}`}>{absolute ? '绝对禁止 · 需人工处理' : '原则/审批准入风险'}</span>{risk.source === 'ai' && <span className="rounded-full bg-violet-100 px-2 py-1 text-[10px] font-bold text-violet-800">AI识别 · 待复核</span>}</div>
            <p className="mt-2 text-sm leading-6">{risk.reason}</p><p className="mt-2 text-xs leading-5 text-[var(--muted)]">管控要求：{risk.controlRequirement ?? risk.impact}</p>
            {absolute && <p className="mt-3 text-xs font-semibold text-red-800">允许继续提交内部后台复核，但不表示可以签约、特批或自动准入。</p>}
          </article>;
        })}
      </div>
      {pending.length > 0 && <div className="border-t border-sky-200 bg-sky-50/60 p-5 text-sm text-sky-900 md:p-6"><p className="font-semibold">待系统或后台核验</p><p className="mt-1 leading-6">{pending.map((risk) => risk.title).join('、')}</p></div>}
    </div>
  );
}

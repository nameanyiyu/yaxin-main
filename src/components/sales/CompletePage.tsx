'use client';

import { SALES_COMPLETION_COPY } from '@/domain/preaudit/presentation';
import ProjectQa from './ProjectQa';

export default function CompletePage({ templateName, salesName, token, projectId }: { templateName: string; salesName: string; token: string; projectId: string }) {
  return (
    <main className="safe-top grid min-h-screen place-items-center px-4 py-8">
      <section className="product-surface w-full max-w-md p-7 text-center md:p-10">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-3xl font-bold text-emerald-700">
          ✓
        </div>
        <p className="mt-6 text-xs font-semibold tracking-[0.14em] text-[var(--success)]">内部流程已流转</p>
        <h1 className="mt-2 text-2xl font-bold">{SALES_COMPLETION_COPY.title}</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          {salesName}，你填写的
          <span className="font-semibold text-[var(--ink)]">「{templateName}」</span>
          {SALES_COMPLETION_COPY.description}
        </p>
        <div className="mt-7 rounded-xl bg-[var(--surface-muted)] p-4 text-left text-sm leading-6 text-[var(--muted)]">
          <p className="font-semibold text-[var(--ink)]">接下来</p>
          <p className="mt-1">复核人员会在管理后台核验风险并导出文件；2026 年 8 月模板还会同步生成飞书文档，外部 OA 或飞书审批仍需按实际流程人工提交。</p>
        </div>
        <p className="mt-5 text-xs text-[var(--muted)]">如需修改，请联系后台复核人员。</p>
        <div className="mt-7 inline-flex items-center gap-2 text-xs font-semibold text-[var(--muted)]">
          <span className="grid h-6 w-6 place-items-center rounded-lg bg-[var(--brand)] text-[10px] text-[var(--surface)]">
            AI
          </span>
          亚信科技
        </div>
        <ProjectQa token={token} projectId={projectId} />
      </section>
    </main>
  );
}

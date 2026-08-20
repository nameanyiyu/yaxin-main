'use client';

import { useState } from 'react';

export default function ProjectQa({ token, projectId }: { token: string; projectId: string }) {
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Array<{ question: string; answer: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function ask() {
    const value = question.trim();
    if (!value || busy) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/s/${token}/qa`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, question: value }) });
      const body = (await response.json()) as { answer?: string; error?: string | { message?: string } };
      if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : body.error?.message ?? '问答失败');
      setMessages((current) => [...current, { question: value, answer: body.answer ?? '当前没有可展示的答案。' }]);
      setQuestion('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '问答失败');
    } finally { setBusy(false); }
  }

  return <section className="product-surface mt-6 p-5 text-left">
    <h2 className="font-bold">当前项目只读问答</h2><p className="mt-1 text-xs leading-5 text-[var(--muted)]">可询问当前项目事实、承诺和适用风险规则；此处不会修改审批信息。</p>
    <div className="mt-4 max-h-72 space-y-3 overflow-auto">{messages.map((item, index) => <div key={`${item.question}-${index}`}><p className="rounded-xl bg-[var(--brand-soft)] px-3 py-2 text-sm font-medium">你：{item.question}</p><p className="mt-1 whitespace-pre-wrap rounded-xl bg-[var(--surface-muted)] px-3 py-2 text-sm leading-6">Agent：{item.answer}</p></div>)}</div>
    {error && <p className="mt-3 text-xs text-red-700">{error}</p>}
    <div className="mt-4 flex gap-2"><input value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void ask(); }} placeholder="例如：这个项目有哪些回款风险？" className="product-control min-w-0 flex-1 px-3 text-sm" /><button type="button" onClick={() => void ask()} disabled={busy || !question.trim()} className="primary-action shrink-0 px-4 text-sm">{busy ? '回答中…' : '提问'}</button></div>
  </section>;
}

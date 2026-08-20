'use client';

import { useEffect, useMemo, useState } from 'react';

type Rule = {
  id: string;
  name?: string;
  scope: 'COMPANY' | 'TSG' | 'DIG' | 'SCG';
  level: 'absolute' | 'principle' | 'approval';
  category: '业务形式' | '客户资信' | '签约链条' | '付款方式' | '项目利润' | '供应商资信' | '其他';
  riskPoint: string;
  recognitionGuidance?: string;
  requirement: string;
  question: string;
  source: string;
  status: 'active' | 'manual_confirmation' | 'disabled';
};

type Config = {
  version: string;
  sourceDocument: string;
  updatedAt: string;
  rules: Rule[];
  customerLists: unknown[];
};

const levelLabel = { absolute: '绝对禁止', principle: '原则禁止', approval: '审批准入' } as const;
const statusLabel = { active: 'AI识别', manual_confirmation: 'AI识别后人工确认', disabled: '停用' } as const;
const scopeLabel = { COMPANY: '公司级', TSG: 'TSG', DIG: 'DIG', SCG: 'SCG' } as const;
const categories: Rule['category'][] = ['业务形式', '客户资信', '签约链条', '付款方式', '项目利润', '供应商资信', '其他'];

const emptyRule: Omit<Rule, 'id' | 'source'> = {
  name: '',
  scope: 'COMPANY',
  level: 'approval',
  category: '其他',
  riskPoint: '',
  recognitionGuidance: '',
  requirement: '',
  question: '',
  status: 'active',
};

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-semibold text-[var(--muted)]">{children}</span>;
}

export default function RiskConfigPanel() {
  const [config, setConfig] = useState<Config | null>(null);
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'all' | Rule['scope']>('all');
  const [level, setLevel] = useState<'all' | Rule['level']>('all');
  const [category, setCategory] = useState<'all' | Rule['category']>('all');
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState(emptyRule);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/admin/risk-config')
      .then(async (response) => {
        const data = await response.json() as Partial<Config> & { error?: { message?: string } };
        if (!response.ok || !Array.isArray(data.rules)) throw new Error(data.error?.message || '风险配置加载失败');
        setConfig(data as Config);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : '风险配置加载失败'));
  }, []);

  function updateRule(id: string, patch: Partial<Rule>) {
    setConfig((current) => current && ({
      ...current,
      rules: current.rules.map((rule) => rule.id === id ? { ...rule, ...patch } : rule),
    }));
    setDirty(true);
    setNotice('');
  }

  function addRule() {
    const name = draft.name?.trim();
    const guidance = draft.recognitionGuidance?.trim() || draft.riskPoint.trim();
    if (!name || !guidance || !draft.requirement.trim()) {
      setError('请至少填写风险名称、AI识别标准和管理要求');
      return;
    }
    const rule: Rule = {
      ...draft,
      id: `CUSTOM_${Date.now()}`,
      name,
      riskPoint: guidance,
      recognitionGuidance: guidance,
      source: '管理端新增',
    };
    setConfig((current) => current && ({ ...current, rules: [rule, ...current.rules] }));
    setDraft(emptyRule);
    setShowAdd(false);
    setDirty(true);
    setError('');
    setNotice('新风险已加入，请点击“保存配置”后生效。');
  }

  async function save() {
    if (!config) return;
    const invalid = config.rules.find((rule) => !rule.name?.trim() || !(rule.recognitionGuidance?.trim() || rule.riskPoint.trim()) || !rule.requirement.trim());
    if (invalid) {
      setError(`“${invalid.name || invalid.id}”缺少风险名称、AI识别标准或管理要求`);
      return;
    }
    setBusy(true);
    setNotice('');
    setError('');
    try {
      const response = await fetch('/api/admin/risk-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await response.json() as Config & { error?: { message?: string } };
      if (!response.ok || !Array.isArray(data.rules)) throw new Error(data.error?.message || '风险配置保存失败');
      setConfig(data);
      setDirty(false);
      setNotice('风险配置已保存。新的销售回答将按这些风险标准进行 AI 识别。');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '风险配置保存失败');
    } finally {
      setBusy(false);
    }
  }

  const rules = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return (config?.rules ?? []).filter((rule) => {
      const text = `${rule.id} ${rule.name ?? ''} ${rule.recognitionGuidance ?? rule.riskPoint} ${rule.requirement} ${rule.question}`.toLowerCase();
      return (!normalizedQuery || text.includes(normalizedQuery))
        && (scope === 'all' || rule.scope === scope)
        && (level === 'all' || rule.level === level)
        && (category === 'all' || rule.category === category);
    });
  }, [category, config?.rules, level, query, scope]);

  if (!config) return <section className="mx-auto max-w-7xl p-5"><p className="text-sm text-[var(--muted)]">正在读取风险配置…</p>{error && <p className="mt-3 text-sm text-red-700">{error}</p>}</section>;

  return (
    <section className="mx-auto max-w-7xl p-4 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold tracking-tight">风险配置</h3>
          <p className="mt-1 max-w-4xl text-sm leading-6 text-[var(--muted)]">专员只需维护业务含义。AI 根据“识别标准”理解销售回答，系统按这里配置的风险级别和管理要求形成风险结论。</p>
        </div>
        <div className="flex items-center gap-2">
          {dirty && <span className="text-xs font-semibold text-amber-700">有未保存修改</span>}
          <button type="button" onClick={() => setShowAdd((value) => !value)} className="product-control px-4 text-sm font-semibold">{showAdd ? '取消新增' : '新增风险'}</button>
          <button type="button" onClick={() => void save()} disabled={busy || !dirty} className="primary-action px-5 text-sm disabled:cursor-not-allowed disabled:opacity-50">{busy ? '保存中…' : '保存配置'}</button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4"><p className="text-xs font-bold text-blue-800">1. 配风险</p><p className="mt-1 text-sm text-blue-950">写清风险是什么、什么回答算触碰。</p></div>
        <div className="rounded-xl border border-violet-200 bg-violet-50 p-4"><p className="text-xs font-bold text-violet-800">2. AI识别</p><p className="mt-1 text-sm text-violet-950">AI 从销售回答中识别并给出理由和依据。</p></div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-xs font-bold text-emerald-800">3. 人工复核</p><p className="mt-1 text-sm text-emerald-950">专员核查 AI 结果，级别和管理要求以配置为准。</p></div>
      </div>

      {notice && <p role="status" className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">{notice}</p>}
      {error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</p>}

      {showAdd && (
        <section className="product-surface mt-5 p-5">
          <div className="flex items-center justify-between gap-3"><div><h4 className="font-bold">新增风险</h4><p className="mt-1 text-xs text-[var(--muted)]">用业务语言描述即可，不需要填写字段名或运算符。</p></div><button type="button" onClick={addRule} className="primary-action px-4 text-sm">加入配置</button></div>
          <div className="mt-4 grid gap-4 md:grid-cols-6">
            <label className="md:col-span-3"><FieldLabel>风险名称</FieldLabel><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="product-control mt-1 w-full px-3 text-sm" placeholder="例如：空转合同" /></label>
            <label><FieldLabel>适用层级</FieldLabel><select value={draft.scope} onChange={(event) => setDraft({ ...draft, scope: event.target.value as Rule['scope'] })} className="product-control mt-1 w-full px-3 text-sm">{Object.entries(scopeLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <label><FieldLabel>风险级别</FieldLabel><select value={draft.level} onChange={(event) => setDraft({ ...draft, level: event.target.value as Rule['level'] })} className="product-control mt-1 w-full px-3 text-sm">{Object.entries(levelLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <label><FieldLabel>风险类别</FieldLabel><select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as Rule['category'] })} className="product-control mt-1 w-full px-3 text-sm">{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label className="md:col-span-3"><FieldLabel>AI识别标准</FieldLabel><textarea rows={3} value={draft.recognitionGuidance} onChange={(event) => setDraft({ ...draft, recognitionGuidance: event.target.value, riskPoint: event.target.value })} className="product-control mt-1 w-full px-3 py-2 text-sm" placeholder="说明哪些业务事实或销售回答表示触碰该风险" /></label>
            <label className="md:col-span-3"><FieldLabel>管理要求</FieldLabel><textarea rows={3} value={draft.requirement} onChange={(event) => setDraft({ ...draft, requirement: event.target.value })} className="product-control mt-1 w-full px-3 py-2 text-sm" placeholder="触碰后禁止、特批或审批标准" /></label>
            <label className="md:col-span-6"><FieldLabel>销售追问</FieldLabel><input value={draft.question} onChange={(event) => setDraft({ ...draft, question: event.target.value })} className="product-control mt-1 w-full px-3 text-sm" placeholder="信息不足时，AI向销售提出的问题" /></label>
          </div>
        </section>
      )}

      <div className="product-surface mt-5 p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_repeat(3,minmax(140px,auto))]">
          <input value={query} onChange={(event) => setQuery(event.target.value)} className="product-control px-3 text-sm" placeholder="搜索风险名称、识别标准或管理要求" />
          <select value={scope} onChange={(event) => setScope(event.target.value as typeof scope)} className="product-control px-3 text-sm"><option value="all">全部层级</option>{Object.entries(scopeLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
          <select value={level} onChange={(event) => setLevel(event.target.value as typeof level)} className="product-control px-3 text-sm"><option value="all">全部级别</option>{Object.entries(levelLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
          <select value={category} onChange={(event) => setCategory(event.target.value as typeof category)} className="product-control px-3 text-sm"><option value="all">全部类别</option>{categories.map((item) => <option key={item}>{item}</option>)}</select>
        </div>
        <p className="mt-3 text-xs text-[var(--muted)]">当前显示 {rules.length} / {config.rules.length} 条风险</p>
      </div>

      <section className="mt-4 space-y-3">
        {rules.map((rule) => (
          <article key={rule.id} className="product-surface p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="text-xs text-[var(--muted)]">{rule.id} · {rule.source}</p><p className="mt-1 text-xs font-semibold text-[var(--brand-strong)]">{scopeLabel[rule.scope]} · {levelLabel[rule.level]} · {rule.category}</p></div>
              <select aria-label="规则状态" value={rule.status} onChange={(event) => updateRule(rule.id, { status: event.target.value as Rule['status'] })} className="product-control px-3 text-xs font-semibold">{Object.entries(statusLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-6">
              <label className="md:col-span-3"><FieldLabel>风险名称</FieldLabel><input value={rule.name ?? rule.riskPoint} onChange={(event) => updateRule(rule.id, { name: event.target.value })} className="product-control mt-1 w-full px-3 text-sm font-bold" /></label>
              <label><FieldLabel>适用层级</FieldLabel><select value={rule.scope} onChange={(event) => updateRule(rule.id, { scope: event.target.value as Rule['scope'] })} className="product-control mt-1 w-full px-3 text-sm">{Object.entries(scopeLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
              <label><FieldLabel>风险级别</FieldLabel><select value={rule.level} onChange={(event) => updateRule(rule.id, { level: event.target.value as Rule['level'] })} className="product-control mt-1 w-full px-3 text-sm">{Object.entries(levelLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
              <label><FieldLabel>风险类别</FieldLabel><select value={rule.category} onChange={(event) => updateRule(rule.id, { category: event.target.value as Rule['category'] })} className="product-control mt-1 w-full px-3 text-sm">{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label className="md:col-span-3"><FieldLabel>AI识别标准</FieldLabel><textarea rows={3} value={rule.recognitionGuidance ?? rule.riskPoint} onChange={(event) => updateRule(rule.id, { recognitionGuidance: event.target.value, riskPoint: event.target.value })} className="product-control mt-1 w-full px-3 py-2 text-sm" /></label>
              <label className="md:col-span-3"><FieldLabel>管理要求</FieldLabel><textarea rows={3} value={rule.requirement} onChange={(event) => updateRule(rule.id, { requirement: event.target.value })} className="product-control mt-1 w-full px-3 py-2 text-sm" /></label>
              <label className="md:col-span-6"><FieldLabel>销售追问</FieldLabel><input value={rule.question} onChange={(event) => updateRule(rule.id, { question: event.target.value })} className="product-control mt-1 w-full px-3 text-sm" placeholder="AI 信息不足时向销售提出的问题" /></label>
            </div>
          </article>
        ))}
      </section>

      <div className="sticky bottom-3 mt-5 flex items-center justify-end gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)]/95 p-3 shadow-lg backdrop-blur">
        {dirty && <span className="text-xs font-semibold text-amber-700">修改尚未保存</span>}
        <button type="button" onClick={() => void save()} disabled={busy || !dirty} className="primary-action px-5 text-sm disabled:cursor-not-allowed disabled:opacity-50">{busy ? '保存中…' : '保存配置'}</button>
      </div>
    </section>
  );
}

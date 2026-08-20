'use client';

import { useEffect, useMemo, useState } from 'react';

type CustomerList = {
  id: string;
  type: 'blacklist' | 'whitelist';
  name: string;
  note: string;
  strategic?: boolean;
  enabled: boolean;
  creditGrade?: string;
  collectionHealth?: string;
  sourceFile?: string;
  updatedAt?: string;
};
type Config = { version: string; sourceDocument: string; updatedAt: string; customerLists: CustomerList[] };

const emptyCustomer: Omit<CustomerList, 'id'> = { type: 'blacklist', name: '', note: '', enabled: true, creditGrade: 'E', collectionHealth: '', sourceFile: '管理端新增' };

export default function CustomerListsPanel() {
  const [config, setConfig] = useState<Config | null>(null);
  const [tab, setTab] = useState<'blacklist' | 'whitelist'>('blacklist');
  const [query, setQuery] = useState('');
  const [enabledOnly, setEnabledOnly] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState(emptyCustomer);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/admin/customer-lists')
      .then(async (response) => {
        const data = await response.json() as Partial<Config> & { error?: { message?: string } };
        if (!response.ok || !Array.isArray(data.customerLists)) throw new Error(data.error?.message || '客户清单加载失败');
        setConfig(data as Config);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : '客户清单加载失败'));
  }, []);

  function updateList(id: string, patch: Partial<CustomerList>) {
    setConfig((current) => current && ({ ...current, customerLists: current.customerLists.map((item) => item.id === id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item) }));
  }

  function addCustomer() {
    if (!draft.name.trim()) {
      setError('客户名称不能为空');
      return;
    }
    const item: CustomerList = { ...draft, id: `${draft.type}-${Date.now()}`, updatedAt: new Date().toISOString() };
    setConfig((current) => current && ({ ...current, customerLists: [item, ...current.customerLists] }));
    setDraft(emptyCustomer);
    setShowAdd(false);
    setError('');
    setNotice('客户已加入待保存列表，请点击“保存清单”。');
  }

  async function save() {
    if (!config) return;
    setBusy(true); setNotice(''); setError('');
    try {
      const response = await fetch('/api/admin/customer-lists', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customerLists: config.customerLists }) });
      if (!response.ok) throw new Error('客户清单保存失败');
      setConfig(await response.json() as Config);
      setNotice('客户清单已保存，风险引擎会按最新清单匹配客户。');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '客户清单保存失败'); }
    finally { setBusy(false); }
  }

  const visible = useMemo(() => {
    if (!config) return [];
    const normalized = query.trim().toLowerCase();
    return config.customerLists.filter((item) => item.type === tab && (!enabledOnly || item.enabled) && (!normalized || `${item.name} ${item.note} ${item.creditGrade ?? ''} ${item.collectionHealth ?? ''} ${item.sourceFile ?? ''}`.toLowerCase().includes(normalized)));
  }, [config, enabledOnly, query, tab]);
  const counts = useMemo(() => ({ blacklist: config?.customerLists.filter((item) => item.type === 'blacklist').length ?? 0, whitelist: config?.customerLists.filter((item) => item.type === 'whitelist').length ?? 0, enabled: config?.customerLists.filter((item) => item.enabled).length ?? 0 }), [config]);

  if (!config) return <section className="mx-auto max-w-7xl p-5"><p className="text-sm text-[var(--muted)]">正在读取客户清单…</p></section>;

  return (
    <section className="mx-auto max-w-7xl p-4 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><h3 className="text-xl font-bold tracking-tight">客户信用评估清单</h3><p className="mt-1 max-w-5xl text-sm leading-6 text-[var(--muted)]">黑名单和白名单独立维护。风险引擎会按客户名称匹配清单；信用等级、来源文件和更新时间用于留痕。后续可导入统一格式的 Excel 或 Markdown 文件进行批量更新。</p></div><div className="flex gap-2"><button type="button" onClick={() => setShowAdd((value) => !value)} className="product-control px-4 text-sm font-semibold">{showAdd ? '取消新增' : '新增客户'}</button><button type="button" disabled className="product-control cursor-not-allowed px-4 text-sm text-[var(--muted)]">导入 Excel/MD（预留）</button><button type="button" onClick={() => void save()} disabled={busy} className="primary-action px-5 text-sm">{busy ? '保存中…' : '保存清单'}</button></div></div>
      {notice && <p role="status" className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">{notice}</p>}
      {error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</p>}

      <div className="mt-6 grid gap-3 sm:grid-cols-3"><div className="product-surface p-4"><p className="text-xs text-[var(--muted)]">黑名单客户</p><p className="mt-1 text-2xl font-bold text-red-700">{counts.blacklist}</p></div><div className="product-surface p-4"><p className="text-xs text-[var(--muted)]">白名单客户</p><p className="mt-1 text-2xl font-bold text-emerald-700">{counts.whitelist}</p></div><div className="product-surface p-4"><p className="text-xs text-[var(--muted)]">启用中的清单项</p><p className="mt-1 text-2xl font-bold">{counts.enabled}</p></div></div>

      {showAdd && <section className="product-surface mt-5 p-5"><div className="flex items-center justify-between gap-3"><div><h4 className="font-bold">新增客户清单项</h4><p className="mt-1 text-xs text-[var(--muted)]">黑名单默认信用等级为 E；白名单可标记为战略客户。</p></div><button type="button" onClick={addCustomer} className="primary-action px-4 text-sm">加入清单</button></div><div className="mt-4 grid gap-3 md:grid-cols-5"><label className="text-xs font-semibold text-[var(--muted)]">清单类型<select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as CustomerList['type'], creditGrade: event.target.value === 'blacklist' ? 'E' : '' })} className="product-control mt-1 w-full px-3 text-sm"><option value="blacklist">黑名单</option><option value="whitelist">白名单</option></select></label><label className="text-xs font-semibold text-[var(--muted)] md:col-span-2">客户名称<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="product-control mt-1 w-full px-3 text-sm" /></label><label className="text-xs font-semibold text-[var(--muted)]">信用等级<input value={draft.creditGrade} onChange={(event) => setDraft({ ...draft, creditGrade: event.target.value })} className="product-control mt-1 w-full px-3 text-sm" placeholder="如 E、D、白名单" /></label><label className="text-xs font-semibold text-[var(--muted)]">回款健康度<input value={draft.collectionHealth} onChange={(event) => setDraft({ ...draft, collectionHealth: event.target.value })} className="product-control mt-1 w-full px-3 text-sm" placeholder="如 5级-黑" /></label><label className="flex items-end gap-2 pb-2 text-xs font-semibold"><input type="checkbox" checked={Boolean(draft.strategic)} onChange={(event) => setDraft({ ...draft, strategic: event.target.checked })} />战略客户</label><label className="text-xs font-semibold text-[var(--muted)] md:col-span-3">备注<input value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} className="product-control mt-1 w-full px-3 text-sm" /></label><label className="text-xs font-semibold text-[var(--muted)] md:col-span-2">来源文件<input value={draft.sourceFile} onChange={(event) => setDraft({ ...draft, sourceFile: event.target.value })} className="product-control mt-1 w-full px-3 text-sm" /></label></div></section>}

      <section className="product-surface mt-5 overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4"><div className="flex gap-2"><button type="button" onClick={() => setTab('blacklist')} className={`rounded-xl px-4 py-2 text-sm font-bold ${tab === 'blacklist' ? 'bg-red-100 text-red-800' : 'text-[var(--muted)] hover:bg-[var(--surface-muted)]'}`}>黑名单（{counts.blacklist}）</button><button type="button" onClick={() => setTab('whitelist')} className={`rounded-xl px-4 py-2 text-sm font-bold ${tab === 'whitelist' ? 'bg-emerald-100 text-emerald-800' : 'text-[var(--muted)] hover:bg-[var(--surface-muted)]'}`}>白名单（{counts.whitelist}）</button></div><label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={enabledOnly} onChange={(event) => setEnabledOnly(event.target.checked)} />只看启用项</label></div><div className="border-b border-[var(--border)] p-4"><input value={query} onChange={(event) => setQuery(event.target.value)} className="product-control w-full px-3 text-sm" placeholder="搜索客户名称、信用等级、回款健康度、来源文件或备注" /><p className="mt-2 text-xs text-[var(--muted)]">当前显示 {visible.length} 项；清单更新时间：{new Date(config.updatedAt).toLocaleString('zh-CN')}</p></div><div className="max-h-[42rem] divide-y divide-[var(--border)] overflow-auto">{visible.map((item) => <article key={item.id} className="grid gap-3 px-5 py-4 md:grid-cols-[120px_2fr_120px_120px_2fr_120px] md:items-center"><span className={`w-fit rounded-full px-2 py-1 text-[11px] font-semibold ${item.type === 'blacklist' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{item.type === 'blacklist' ? '黑名单' : '白名单'}</span><input value={item.name} onChange={(event) => updateList(item.id, { name: event.target.value })} className="product-control px-3 text-sm font-semibold" /><input value={item.creditGrade ?? ''} onChange={(event) => updateList(item.id, { creditGrade: event.target.value })} className="product-control px-3 text-sm" placeholder="信用等级" /><input value={item.collectionHealth ?? ''} onChange={(event) => updateList(item.id, { collectionHealth: event.target.value })} className="product-control px-3 text-sm" placeholder="回款健康度" /><input value={item.note} onChange={(event) => updateList(item.id, { note: event.target.value })} className="product-control px-3 text-sm" placeholder="备注" /><label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={item.enabled} onChange={(event) => updateList(item.id, { enabled: event.target.checked })} />启用{item.strategic ? ' · 战略' : ''}</label></article>)}{visible.length === 0 && <p className="p-8 text-center text-sm text-[var(--muted)]">当前筛选条件下没有客户。</p>}</div></section>
      <p className="mt-4 rounded-xl bg-[var(--surface-muted)] px-4 py-3 text-xs leading-5 text-[var(--muted)]">统一导入格式建议包含：客户名称、清单类型（黑/白）、信用评估等级、回款健康度、备注、来源文件。导入后仍需人工确认再启用，避免名单误匹配。</p>
    </section>
  );
}

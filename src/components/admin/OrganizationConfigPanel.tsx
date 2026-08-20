'use client';

import { useEffect, useMemo, useState } from 'react';
import type {
  OrganizationNode,
  OrganizationNodeType,
} from '@/domain/preaudit/organization-config';

export interface OrganizationTreeNode extends OrganizationNode {
  children: OrganizationTreeNode[];
}

function byOrder(left: OrganizationNode, right: OrganizationNode) {
  return left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, 'zh-CN');
}

export function organizationTree(nodes: OrganizationNode[]): OrganizationTreeNode[] {
  const regionsByBu = new Map<string, OrganizationTreeNode[]>();
  nodes.filter((node) => node.type === 'region').toSorted(byOrder).forEach((region) => {
    const list = regionsByBu.get(region.parentId ?? '') ?? [];
    list.push({ ...region, children: [] });
    regionsByBu.set(region.parentId ?? '', list);
  });
  const busByBg = new Map<string, OrganizationTreeNode[]>();
  nodes.filter((node) => node.type === 'bu').toSorted(byOrder).forEach((bu) => {
    const list = busByBg.get(bu.parentId ?? '') ?? [];
    list.push({ ...bu, children: regionsByBu.get(bu.id) ?? [] });
    busByBg.set(bu.parentId ?? '', list);
  });
  return nodes
    .filter((node) => node.type === 'bg')
    .toSorted(byOrder)
    .map((bg) => ({ ...bg, children: busByBg.get(bg.id) ?? [] }));
}

async function apiError(response: Response): Promise<string> {
  try {
    return ((await response.json()) as { error?: { message?: string } }).error?.message ?? '操作失败';
  } catch {
    return '操作失败';
  }
}

function ConfigRow({
  node,
  selected,
  parents,
  onSelect,
  onSaved,
}: {
  node: OrganizationNode;
  selected: boolean;
  parents?: OrganizationNode[];
  onSelect?: () => void;
  onSaved: (node: OrganizationNode) => void;
}) {
  const [name, setName] = useState(node.name);
  const [parentId, setParentId] = useState(node.parentId ?? '');
  const [sortOrder, setSortOrder] = useState(node.sortOrder);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function patch(changes: Record<string, unknown>) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/organization-config/${node.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      });
      if (!response.ok) throw new Error(await apiError(response));
      onSaved(((await response.json()) as { node: OrganizationNode }).node);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={`rounded-xl border p-3 ${selected ? 'border-[var(--brand)] bg-[var(--brand-soft)]' : 'border-[var(--border)] bg-[var(--surface)]'}`}>
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={onSelect} disabled={!onSelect} className={`min-w-0 truncate text-left text-sm font-bold ${onSelect ? 'text-[var(--brand-strong)] hover:underline' : ''}`}>
          {node.name}
        </button>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${node.enabled ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-100 text-slate-600'}`}>
          {node.enabled ? '启用' : '已停用'}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-[1fr_70px] gap-2">
        <label className="text-[11px] font-semibold text-[var(--muted)]">名称
          <input value={name} onChange={(event) => setName(event.target.value)} className="product-control mt-1 w-full px-2 text-sm" />
        </label>
        <label className="text-[11px] font-semibold text-[var(--muted)]">排序
          <input type="number" min="0" step="1" value={sortOrder} onChange={(event) => setSortOrder(Number(event.target.value))} className="product-control mt-1 w-full px-2 text-sm" />
        </label>
      </div>
      {parents && (
        <label className="mt-2 block text-[11px] font-semibold text-[var(--muted)]">所属上级
          <select value={parentId} onChange={(event) => setParentId(event.target.value)} className="product-control mt-1 w-full px-2 text-sm">
            {parents.map((parent) => <option key={parent.id} value={parent.id}>{parent.name}{parent.enabled ? '' : '（已停用）'}</option>)}
          </select>
        </label>
      )}
      {error && <p className="mt-2 text-xs text-red-700" role="alert">{error}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" disabled={busy} onClick={() => void patch({ enabled: !node.enabled })} className="product-control px-2.5 text-xs font-semibold">
          {node.enabled ? '停用' : '启用'}
        </button>
        <button type="button" disabled={busy || !name.trim() || (parents && !parentId)} onClick={() => void patch({ name, parentId: parents ? parentId : undefined, sortOrder })} className="primary-action px-2.5 text-xs">
          {busy ? '保存中…' : '保存'}
        </button>
      </div>
    </li>
  );
}

function AddForm({
  type,
  parentId,
  disabled,
  onCreated,
}: {
  type: OrganizationNodeType;
  parentId?: string;
  disabled?: boolean;
  onCreated: (node: OrganizationNode) => void;
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/admin/organization-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, name, parentId }),
      });
      if (!response.ok) throw new Error(await apiError(response));
      const node = ((await response.json()) as { node: OrganizationNode }).node;
      onCreated(node);
      setName('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '新增失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={create} className="border-b border-[var(--border)] bg-[var(--surface-muted)] p-3">
      <label className="text-[11px] font-semibold text-[var(--muted)]">新增{type === 'bg' ? ' BG' : type === 'bu' ? ' BU' : '销售区域'}
        <div className="mt-1 flex gap-2">
          <input value={name} onChange={(event) => setName(event.target.value)} disabled={disabled || busy} className="product-control min-w-0 flex-1 px-3 text-sm" placeholder="输入名称" />
          <button type="submit" disabled={disabled || busy || !name.trim()} className="primary-action shrink-0 px-3 text-sm">新增</button>
        </div>
      </label>
      {disabled && <p className="mt-1 text-xs text-[var(--muted)]">请先选择一个启用的上级。</p>}
      {error && <p className="mt-1 text-xs text-red-700" role="alert">{error}</p>}
    </form>
  );
}

export default function OrganizationConfigPanel() {
  const [nodes, setNodes] = useState<OrganizationNode[]>([]);
  const [selectedBgId, setSelectedBgId] = useState('');
  const [selectedBuId, setSelectedBuId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/admin/organization-config', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await apiError(response));
        return response.json() as Promise<{ nodes: OrganizationNode[] }>;
      })
      .then(({ nodes: loaded }) => {
        setNodes(loaded);
        const firstBg = loaded.filter((node) => node.type === 'bg').toSorted(byOrder)[0];
        const firstBu = loaded.filter((node) => node.type === 'bu' && node.parentId === firstBg?.id).toSorted(byOrder)[0];
        setSelectedBgId(firstBg?.id ?? '');
        setSelectedBuId(firstBu?.id ?? '');
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setError(reason instanceof Error ? reason.message : '配置读取失败');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const tree = useMemo(() => organizationTree(nodes), [nodes]);
  const selectedBg = tree.find((node) => node.id === selectedBgId) ?? tree[0];
  const selectedBu = selectedBg?.children.find((node) => node.id === selectedBuId)
    ?? selectedBg?.children[0];

  function upsert(node: OrganizationNode) {
    setNodes((current) => current.some((item) => item.id === node.id)
      ? current.map((item) => item.id === node.id ? node : item)
      : [...current, node]);
    setNotice('配置已保存，销售端下次打开或刷新后生效。');
  }

  async function restoreDefaults() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/organization-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore_defaults' }),
      });
      if (!response.ok) throw new Error(await apiError(response));
      setNodes(((await response.json()) as { nodes: OrganizationNode[] }).nodes);
      setNotice('默认 BG/BU 映射已补充，现有自定义项未被覆盖。');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '恢复默认配置失败');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="p-4 md:p-8"><div className="mx-auto h-96 max-w-[1400px] animate-pulse rounded-xl bg-[var(--surface-muted)]" aria-label="正在读取组织配置" /></div>;
  }

  return (
    <div className="p-4 md:p-8">
      <div className="mx-auto max-w-[1400px]">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="font-bold">组织与销售区域</h3>
            <p className="mt-1 max-w-[72ch] text-sm leading-6 text-[var(--muted)]">销售端按 BU 选择并自动归属 BG，区域只显示当前 BU 下的启用项。停用只影响新填写，历史项目名称保持不变。</p>
          </div>
          <button type="button" onClick={() => void restoreDefaults()} disabled={busy} className="product-control px-4 text-sm font-semibold">
            {busy ? '处理中…' : '补充默认 BG/BU'}
          </button>
        </div>
        {notice && <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">{notice}</p>}
        {error && <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</p>}

        <div className="grid overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] lg:grid-cols-3 lg:divide-x lg:divide-[var(--border)]">
          <section className="min-w-0">
            <header className="border-b border-[var(--border)] px-4 py-4">
              <p className="text-xs font-semibold text-[var(--muted)]">第一级</p>
              <h4 className="mt-1 font-bold">BG（{tree.length}）</h4>
            </header>
            <AddForm type="bg" onCreated={(node) => { upsert(node); setSelectedBgId(node.id); setSelectedBuId(''); }} />
            <ul className="max-h-[620px] space-y-3 overflow-y-auto p-3">
              {tree.map((node) => (
                <ConfigRow key={node.id} node={node} selected={selectedBg?.id === node.id} onSelect={() => { setSelectedBgId(node.id); setSelectedBuId(node.children[0]?.id ?? ''); }} onSaved={upsert} />
              ))}
            </ul>
          </section>

          <section className="min-w-0 border-t border-[var(--border)] lg:border-t-0">
            <header className="border-b border-[var(--border)] px-4 py-4">
              <p className="text-xs font-semibold text-[var(--muted)]">第二级</p>
              <h4 className="mt-1 font-bold">BU（{selectedBg?.children.length ?? 0}）</h4>
              <p className="mt-1 truncate text-xs text-[var(--muted)]">当前 BG：{selectedBg?.name ?? '未选择'}</p>
            </header>
            <AddForm type="bu" parentId={selectedBg?.id} disabled={!selectedBg?.enabled} onCreated={(node) => { upsert(node); setSelectedBuId(node.id); }} />
            <ul className="max-h-[620px] space-y-3 overflow-y-auto p-3">
              {selectedBg?.children.map((node) => (
                <ConfigRow key={node.id} node={node} selected={selectedBu?.id === node.id} parents={tree} onSelect={() => setSelectedBuId(node.id)} onSaved={upsert} />
              ))}
              {!selectedBg?.children.length && <li className="px-2 py-8 text-center text-sm text-[var(--muted)]">该 BG 尚未配置 BU。</li>}
            </ul>
          </section>

          <section className="min-w-0 border-t border-[var(--border)] lg:border-t-0">
            <header className="border-b border-[var(--border)] px-4 py-4">
              <p className="text-xs font-semibold text-[var(--muted)]">第三级</p>
              <h4 className="mt-1 font-bold">销售区域（{selectedBu?.children.length ?? 0}）</h4>
              <p className="mt-1 truncate text-xs text-[var(--muted)]">当前 BU：{selectedBu?.name ?? '未选择'}</p>
            </header>
            <AddForm type="region" parentId={selectedBu?.id} disabled={!selectedBu?.enabled} onCreated={upsert} />
            <ul className="max-h-[620px] space-y-3 overflow-y-auto p-3">
              {selectedBu?.children.map((node) => (
                <ConfigRow key={node.id} node={node} selected={false} parents={nodes.filter((item) => item.type === 'bu')} onSaved={upsert} />
              ))}
              {!selectedBu?.children.length && <li className="px-2 py-8 text-center text-sm text-[var(--muted)]">该 BU 尚未配置销售区域，销售端暂不能选择该 BU。</li>}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

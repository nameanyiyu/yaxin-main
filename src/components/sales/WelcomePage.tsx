'use client';

import { useState } from 'react';
import type { OrganizationNode } from '@/domain/preaudit/organization-config';

interface Props {
  templateName: string;
  templateVersion: string;
  organization: {
    bgs: OrganizationNode[];
    bus: OrganizationNode[];
    regions: OrganizationNode[];
  };
  onStart: (identity: {
    salesName: string;
    salesBu: string;
    salesRegion: string;
    opportunitySerialNumber?: string;
    startMode: 'new' | 'resume';
  }) => void;
  isLoading: boolean;
}

export default function WelcomePage({
  templateName,
  templateVersion,
  organization,
  onStart,
  isLoading,
}: Props) {
  const [name, setName] = useState('');
  const [salesBu, setSalesBu] = useState('');
  const [salesRegion, setSalesRegion] = useState('');
  const [opportunitySerialNumber, setOpportunitySerialNumber] = useState('');
  const [error, setError] = useState('');
  const selectedBu = organization.bus.find((node) => node.id === salesBu);
  const selectedBg = organization.bgs.find((node) => node.id === selectedBu?.parentId);
  const regions = organization.regions.filter((node) => node.parentId === selectedBu?.id);

  function submit(startMode: 'new' | 'resume') {
    const trimmed = name.trim();
    const selectedRegion = regions.find((node) => node.id === salesRegion);
    if (!trimmed || !selectedBu || !selectedBg || !selectedRegion) {
      setError('请完整填写销售姓名、销售 BU 和销售区域');
      return;
    }
    onStart({
      salesName: trimmed,
      salesBu: selectedBu.name,
      salesRegion: selectedRegion.name,
      opportunitySerialNumber: opportunitySerialNumber.trim() || undefined,
      startMode,
    });
  }

  return (
    <main className="safe-top min-h-screen px-4 py-8 md:grid md:place-items-center">
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--brand)] text-sm font-bold text-[var(--surface)]">
              AI
            </div>
            <div>
              <p className="font-bold">亚信前置审批</p>
              <p className="text-xs text-[var(--muted)]">域外合同信息采集</p>
            </div>
          </div>
          <span className="rounded-full bg-[var(--brand-soft)] px-3 py-1 text-xs font-semibold text-[var(--brand-strong)]">
            准备填写
          </span>
        </div>

        <section className="product-surface overflow-hidden">
          <div className="border-b border-[var(--border)] bg-[var(--surface-muted)] px-6 py-7 md:px-8">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-[var(--brand-strong)]">固定审批模板</p>
              <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 font-mono text-[11px] text-[var(--muted)]">
                {templateVersion}
              </span>
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight">{templateName}</h1>
            <p className="mt-3 max-w-[65ch] text-sm leading-6 text-[var(--muted)]">
              先像项目汇报一样集中说明客户、金额、签约、回款、利润和交付情况；Agent 整理汇报卡并按所属 BG 核对系统风险，最后确认可跟踪的项目承诺后送后台复核。
            </p>
          </div>

          <form onSubmit={(event) => { event.preventDefault(); submit('new'); }} className="p-6 md:p-8">
            <div className="mb-6 grid grid-cols-5 gap-1.5 text-center text-[10px] text-[var(--muted)] sm:text-xs">
              <div className="rounded-xl bg-[var(--surface-muted)] p-3">
                <strong className="mb-1 block text-base text-[var(--ink)]">01</strong>
                项目汇报
              </div>
              <div className="rounded-xl bg-[var(--surface-muted)] p-3">
                <strong className="mb-1 block text-base text-[var(--ink)]">02</strong>
                信息确认
              </div>
              <div className="rounded-xl bg-[var(--surface-muted)] p-3">
                <strong className="mb-1 block text-base text-[var(--ink)]">03</strong>
                风险核对
              </div>
              <div className="rounded-xl bg-[var(--surface-muted)] p-3">
                <strong className="mb-1 block text-base text-[var(--ink)]">04</strong>
                应对承诺
              </div>
              <div className="rounded-xl bg-[var(--surface-muted)] p-3">
                <strong className="mb-1 block text-base text-[var(--ink)]">05</strong>
                完成送审
              </div>
            </div>

            <label htmlFor="sales-name" className="mb-2 block text-sm font-semibold">
              销售姓名
            </label>
            <input
              id="sales-name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setError('');
              }}
              disabled={isLoading}
              autoFocus
              autoComplete="name"
              placeholder="请输入真实姓名"
              aria-describedby={error ? 'sales-name-error' : 'sales-name-help'}
              className={`product-control w-full px-4 ${error ? 'border-red-500' : ''}`}
            />

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-semibold">
                销售 BU <span className="text-red-600" aria-hidden="true">*</span>
                <select
                  value={salesBu}
                  onChange={(event) => {
                    setSalesBu(event.target.value);
                    setSalesRegion('');
                    setError('');
                  }}
                  disabled={isLoading}
                  className={`product-control mt-2 w-full px-4 ${error && !selectedBu ? 'border-red-500' : ''}`}
                >
                  <option value="">请选择销售 BU</option>
                  {organization.bgs.map((bg) => (
                    <optgroup key={bg.id} label={bg.name}>
                      {organization.bus.filter((bu) => bu.parentId === bg.id).map((bu) => (
                        <option key={bu.id} value={bu.id}>{bu.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-semibold">
                销售区域 <span className="text-red-600" aria-hidden="true">*</span>
                <select
                  value={salesRegion}
                  onChange={(event) => { setSalesRegion(event.target.value); setError(''); }}
                  disabled={isLoading || !selectedBu}
                  className={`product-control mt-2 w-full px-4 ${error && !regions.some((node) => node.id === salesRegion) ? 'border-red-500' : ''}`}
                >
                  <option value="">{selectedBu && regions.length === 0 ? '该 BU 暂未配置销售区域' : '请选择销售区域'}</option>
                  {regions.map((region) => (
                    <option key={region.id} value={region.id}>{region.name}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3 text-sm">
              <span className="text-[var(--muted)]">所属 BG：</span>
              <strong>{selectedBg?.name ?? '选择 BU 后自动确定'}</strong>
            </div>

            <label className="mt-4 block text-sm font-semibold">
              商机流水号 <span className="font-normal text-[var(--muted)]">（选填）</span>
              <input
                value={opportunitySerialNumber}
                onChange={(event) => setOpportunitySerialNumber(event.target.value)}
                disabled={isLoading}
                placeholder="如已创建商机，请输入流水号"
                className="product-control mt-2 w-full px-4"
              />
            </label>

            {error ? (
              <p id="sales-name-error" className="mt-3 text-sm text-red-600">{error}</p>
            ) : (
              <p id="sales-name-help" className="mt-3 text-xs leading-5 text-[var(--muted)]">
                新项目不会加载历史答案；如需接着填写，请使用“继续未完成项目”。填写商机流水号后，将只恢复同一流水号的记录。
              </p>
            )}

            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button type="submit" disabled={!name.trim() || !selectedBu || !selectedBg || !regions.some((node) => node.id === salesRegion) || isLoading} className="primary-action px-4">
                {isLoading ? '正在创建…' : '开始新项目'}
              </button>
              <button type="button" onClick={() => submit('resume')} disabled={!name.trim() || !selectedBu || !selectedBg || !regions.some((node) => node.id === salesRegion) || isLoading} className="product-control px-4 font-semibold">
                继续未完成项目
              </button>
            </div>
          </form>
        </section>

        <p className="mt-5 text-center text-xs text-[var(--muted)]">
          数据仅用于公司内部合同前置审批
        </p>
      </div>
    </main>
  );
}

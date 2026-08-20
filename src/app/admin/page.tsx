'use client';

import { useState } from 'react';
import OverviewPanel from '@/components/admin/OverviewPanel';
import ProjectsPanel from '@/components/admin/ProjectsPanel';
import SettingsPanel from '@/components/admin/SettingsPanel';
import TemplatesPanel from '@/components/admin/TemplatesPanel';
import TrackingLedgerPanel from '@/components/admin/TrackingLedgerPanel';
import AnalyticsPanel from '@/components/admin/AnalyticsPanel';
import OrganizationConfigPanel from '@/components/admin/OrganizationConfigPanel';
import RiskConfigPanel from '@/components/admin/RiskConfigPanel';
import CustomerListsPanel from '@/components/admin/CustomerListsPanel';

type AdminTab = 'overview' | 'projects' | 'tracking' | 'analytics' | 'templates' | 'risk_config' | 'customer_lists' | 'settings' | 'data_config';

const NAV = [
  { key: 'overview' as const, label: '工作总览', short: '总览', description: '待办、风险和流程状态', icon: '⌂' },
  { key: 'projects' as const, label: '项目复核', short: '复核', description: '新建、编辑、复核和管理项目', icon: '◎' },
  { key: 'tracking' as const, label: '项目跟踪', short: '跟踪', description: '维护审批结果、执行进展与批量台账', icon: '↻' },
  { key: 'analytics' as const, label: '数据分析', short: '分析', description: '查看执行结果、组织下钻与项目预警', icon: '▥' },
  { key: 'templates' as const, label: '审批模板', short: '模板', description: '管理模板版本与销售填写入口', icon: '▤' },
  { key: 'risk_config' as const, label: '风险配置', short: '风险', description: '维护公司级/BG级风险规则与风险点', icon: '⚠' },
  { key: 'customer_lists' as const, label: '客户信用清单', short: '清单', description: '统计和维护黑名单、白名单客户', icon: '▣' },
  { key: 'settings' as const, label: '系统设置', short: '设置', description: '查看模型与语音服务配置', icon: '⚙' },
  { key: 'data_config' as const, label: '数据配置', short: '配置', description: '维护 BG、BU 与销售区域名称', icon: '⌘' },
];

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [targetProjectId, setTargetProjectId] = useState<string | null>(null);
  const current = NAV.find((item) => item.key === activeTab) ?? NAV[0];

  function openProject(projectId: string) {
    setTargetProjectId(projectId);
    setActiveTab('projects');
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.assign('/login');
  }

  return (
    <div className="min-h-screen bg-[var(--canvas)]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-[var(--border)] bg-[var(--surface)] md:flex">
        <div className="flex h-20 items-center gap-3 px-5">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--brand)] text-sm font-bold text-[var(--surface)]">
            AI
          </div>
          <div>
            <h1 className="font-bold tracking-tight">亚信前置审批</h1>
            <p className="mt-0.5 text-xs text-[var(--muted)]">合同预审工作台</p>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4" aria-label="后台导航">
          <p className="mb-2 px-3 text-[11px] font-semibold tracking-[0.12em] text-[var(--muted)]">工作区</p>
          {NAV.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setActiveTab(item.key)}
              className={`mb-1 flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold ${
                activeTab === item.key
                  ? 'bg-[var(--brand-soft)] text-[var(--brand-strong)]'
                  : 'text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]'
              }`}
              aria-current={activeTab === item.key ? 'page' : undefined}
            >
              <span className="grid h-7 w-7 place-items-center rounded-lg border border-current/15 text-sm">
                {item.icon}
              </span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="border-t border-[var(--border)] p-5 text-xs text-[var(--muted)]">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[var(--success)]" />
            内网服务运行中
          </div>
          <p className="mt-2 opacity-70">外部审批需人工提交</p>
        </div>
      </aside>

      <header className="safe-top sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--surface)] md:hidden">
        <div className="flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--brand)] text-xs font-bold text-[var(--surface)]">
              AI
            </div>
            <div>
              <p className="text-sm font-bold">亚信前置审批</p>
              <p className="text-[11px] text-[var(--muted)]">{current.label}</p>
            </div>
          </div>
          <span className="rounded-full bg-[var(--brand-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--brand-strong)]">
            管理端
          </span>
        </div>
      </header>

      <main className="min-h-screen pb-24 md:ml-60 md:pb-0">
        <header className="hidden h-20 items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-8 md:flex">
          <div>
            <h2 className="text-xl font-bold tracking-tight">{current.label}</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">{current.description}</p>
          </div>
          <button type="button" onClick={() => void logout()} className="product-control px-3 text-sm font-semibold hover:bg-[var(--surface-muted)]">
            退出登录
          </button>
        </header>
        <div key={activeTab} className="animate-fade-in">
          {activeTab === 'overview' && (
            <OverviewPanel
              onOpenProject={openProject}
              onOpenProjects={() => {
                setTargetProjectId(null);
                setActiveTab('projects');
              }}
            />
          )}
          {activeTab === 'projects' && <ProjectsPanel initialSelectedId={targetProjectId} />}
          {activeTab === 'tracking' && <TrackingLedgerPanel onOpenProject={openProject} />}
          {activeTab === 'analytics' && <AnalyticsPanel onOpenProject={openProject} />}
          {activeTab === 'templates' && <TemplatesPanel />}
          {activeTab === 'risk_config' && <RiskConfigPanel />}
          {activeTab === 'customer_lists' && <CustomerListsPanel />}
          {activeTab === 'settings' && <SettingsPanel />}
          {activeTab === 'data_config' && <OrganizationConfigPanel />}
        </div>
      </main>

      <nav
        className="safe-bottom-ios fixed inset-x-0 bottom-0 z-30 overflow-x-auto border-t border-[var(--border)] bg-[var(--surface)] md:hidden"
        aria-label="移动端导航"
      >
        <div className="flex min-w-max px-2 py-1.5">
          {NAV.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setActiveTab(item.key)}
              className={`flex min-h-12 w-16 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-semibold ${
                activeTab === item.key
                  ? 'bg-[var(--brand-soft)] text-[var(--brand-strong)]'
                  : 'text-[var(--muted)]'
              }`}
            >
              <span className="text-base leading-none">{item.icon}</span>
              {item.short}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

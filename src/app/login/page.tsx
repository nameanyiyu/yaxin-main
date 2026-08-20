'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error || '登录失败');
      router.replace('/admin');
      router.refresh();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : '登录失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--canvas)] px-4 py-10">
      <section className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-7 shadow-[0_18px_50px_oklch(0.25_0.03_255/0.08)] sm:p-9">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--brand)] font-bold text-[var(--surface)]">AI</div>
          <div><h1 className="text-xl font-bold tracking-tight">亚信前置审批</h1><p className="mt-1 text-xs text-[var(--muted)]">合同预审工作台</p></div>
        </div>
        <div className="mt-9"><h2 className="text-2xl font-bold">后台登录</h2><p className="mt-2 text-sm leading-6 text-[var(--muted)]">登录后进入项目复核、数据分析和系统设置。</p></div>
        <form className="mt-7 space-y-4" onSubmit={submit}>
          <label className="block text-sm font-semibold">用户名<input required value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" className="product-control mt-2 w-full px-3" /></label>
          <label className="block text-sm font-semibold">密码<input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" className="product-control mt-2 w-full px-3" /></label>
          {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">{error}</p>}
          <button type="submit" disabled={loading} className="primary-action mt-2 w-full px-4">{loading ? '登录中…' : '登录系统'}</button>
        </form>
        <p className="mt-6 text-center text-xs text-[var(--muted)]">请使用服务器管理员配置的账号登录</p>
      </section>
    </main>
  );
}

'use client';

import { FormEvent, useEffect, useState } from 'react';

interface SystemSettingsView {
  llm: { apiBaseUrl: string; apiKey: string; model: string };
  transcription: { apiBaseUrl: string; apiKey: string; model: string; language: string };
  source: string;
}

const inputClass = 'mt-2 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-soft)]';

export default function SettingsPanel() {
  const [settings, setSettings] = useState<SystemSettingsView | null>(null);
  const [llmApiBaseUrl, setLlmApiBaseUrl] = useState('');
  const [llmModel, setLlmModel] = useState('');
  const [llmApiKey, setLlmApiKey] = useState('');
  const [transcriptionApiBaseUrl, setTranscriptionApiBaseUrl] = useState('');
  const [transcriptionModel, setTranscriptionModel] = useState('');
  const [transcriptionLanguage, setTranscriptionLanguage] = useState('');
  const [transcriptionApiKey, setTranscriptionApiKey] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState<'llm' | 'transcription' | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/admin/settings', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('配置读取失败');
        return (await response.json()) as SystemSettingsView;
      })
      .then((value) => {
        setSettings(value);
        setLlmApiBaseUrl(value.llm.apiBaseUrl);
        setLlmModel(value.llm.model);
        setTranscriptionApiBaseUrl(value.transcription.apiBaseUrl);
        setTranscriptionModel(value.transcription.model);
        setTranscriptionLanguage(value.transcription.language);
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setError(reason instanceof Error ? reason.message : '配置读取失败');
      });
    return () => controller.abort();
  }, []);

  async function saveSettings(event: FormEvent<HTMLFormElement>, kind: 'llm' | 'transcription') {
    event.preventDefault();
    setSaving(kind);
    setError('');
    setNotice('');
    const payload = kind === 'llm'
      ? { llm: { apiBaseUrl: llmApiBaseUrl, model: llmModel, apiKey: llmApiKey } }
      : { transcription: { apiBaseUrl: transcriptionApiBaseUrl, model: transcriptionModel, language: transcriptionLanguage, apiKey: transcriptionApiKey } };
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as { error?: { message?: string }; llm?: SystemSettingsView['llm']; transcription?: SystemSettingsView['transcription'] };
      if (!response.ok || !body[kind]) throw new Error(body.error?.message || '配置保存失败');
      setSettings((current) => current ? { ...current, [kind]: body[kind]! } : current);
      if (kind === 'llm') setLlmApiKey('');
      else setTranscriptionApiKey('');
      setNotice(`${kind === 'llm' ? '大模型' : '语音转写'}配置已保存，后续请求立即生效。`);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : '配置保存失败');
    } finally {
      setSaving(null);
    }
  }

  return (
    <section className="mx-auto max-w-4xl p-4 md:p-8">
      <div className="pb-5">
        <h3 className="text-xl font-bold tracking-tight">服务配置</h3>
        <p className="mt-1 text-sm leading-6 text-[var(--muted)]">可在页面直接修改大模型和语音转写连接信息。API Key 不会回显，留空表示沿用当前密钥。</p>
      </div>
      {error && <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</p>}
      {notice && <p role="status" className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</p>}
      {!settings && !error && <div className="product-surface mt-5 p-6 text-sm text-[var(--muted)]">正在读取配置…</div>}
      {settings && <div className="product-surface mt-5 divide-y divide-[var(--border)] overflow-hidden px-6">
        <form className="py-7" onSubmit={(event) => saveSettings(event, 'llm')}>
          <div className="flex flex-wrap items-center justify-between gap-3"><h4 className="font-semibold">大模型</h4><span className="text-xs text-[var(--muted)]">当前来源：环境变量 / 页面配置</span></div>
          <div className="mt-4 grid gap-4 text-sm md:grid-cols-2">
            <label className="md:col-span-2">API Base URL<input className={inputClass} value={llmApiBaseUrl} onChange={(event) => setLlmApiBaseUrl(event.target.value)} placeholder="https://api.example.com/v1" /></label>
            <label>模型<input className={inputClass} value={llmModel} onChange={(event) => setLlmModel(event.target.value)} placeholder="模型名称" /></label>
            <label>API Key<input className={inputClass} type="password" value={llmApiKey} onChange={(event) => setLlmApiKey(event.target.value)} placeholder={settings.llm.apiKey ? `当前：${settings.llm.apiKey}，留空不修改` : '请输入 API Key'} autoComplete="new-password" /></label>
          </div>
          <div className="mt-5 flex justify-end"><button type="submit" disabled={saving !== null} className="primary-action px-5 text-sm">{saving === 'llm' ? '保存中…' : '保存大模型配置'}</button></div>
        </form>
        <form className="py-7" onSubmit={(event) => saveSettings(event, 'transcription')}>
          <div className="flex flex-wrap items-center justify-between gap-3"><h4 className="font-semibold">语音转写</h4><span className="text-xs text-[var(--muted)]">支持 OpenAI 兼容的音频转写接口</span></div>
          <p className="mt-2 text-xs leading-5 text-[var(--muted)]">阿里云请使用 qwen3-asr-flash；qwen-audio-3.0-realtime-flash 仅支持 WebSocket 实时接口，不适用于当前录音上传方式。</p>
          <div className="mt-4 grid gap-4 text-sm md:grid-cols-2">
            <label className="md:col-span-2">API Base URL<input className={inputClass} value={transcriptionApiBaseUrl} onChange={(event) => setTranscriptionApiBaseUrl(event.target.value)} placeholder="https://api.example.com/v1" /></label>
            <label>模型<input className={inputClass} value={transcriptionModel} onChange={(event) => setTranscriptionModel(event.target.value)} placeholder="whisper-1" /></label>
            <label>语言<input className={inputClass} value={transcriptionLanguage} onChange={(event) => setTranscriptionLanguage(event.target.value)} placeholder="zh-CN" /></label>
            <label className="md:col-span-2">API Key<input className={inputClass} type="password" value={transcriptionApiKey} onChange={(event) => setTranscriptionApiKey(event.target.value)} placeholder={settings.transcription.apiKey ? `当前：${settings.transcription.apiKey}，留空不修改` : '请输入 API Key'} autoComplete="new-password" /></label>
          </div>
          <div className="mt-5 flex justify-end"><button type="submit" disabled={saving !== null} className="primary-action px-5 text-sm">{saving === 'transcription' ? '保存中…' : '保存语音转写配置'}</button></div>
        </form>
        <section className="py-7"><h4 className="font-semibold">外部审批</h4><p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">OA/飞书审批单接口尚未接入。2026 年 8 月模板复核导出时会生成同内容飞书文档；外部审批仍需人工提交并登记外部单号。</p></section>
      </div>}
    </section>
  );
}

import React, { useState } from 'react';
import { Cloud, LogIn, LogOut, RefreshCw } from 'lucide-react';

type WatermarkCloudAccountProps = {
  enabled: boolean;
  email: string | null;
  status: string;
  localCount: number;
  cloudCount: number;
  busy?: boolean;
  onRequestMagicLink(email: string): Promise<void>;
  onSignOut(): Promise<void>;
  onSyncLocal(): Promise<void>;
};

export const WatermarkCloudAccount: React.FC<WatermarkCloudAccountProps> = ({
  enabled,
  email,
  status,
  localCount,
  cloudCount,
  busy = false,
  onRequestMagicLink,
  onSignOut,
  onSyncLocal,
}) => {
  const [inputEmail, setInputEmail] = useState('');
  const [actionError, setActionError] = useState('');

  const run = async (action: () => Promise<void>) => {
    setActionError('');
    try {
      await action();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '云端水印操作失败');
    }
  };

  return (
    <section className="rounded-xl border border-sky-100 bg-sky-50/60 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Cloud size={15} className="text-sky-600" />
          <div>
            <div className="text-xs font-black text-sky-800">跨设备水印同步</div>
            <div className="text-[10px] font-semibold text-sky-600">{enabled ? status : '仅本机：尚未配置云端同步'}</div>
          </div>
        </div>
        <div className="text-[10px] text-sky-700">本机 {localCount} / 云端 {cloudCount}</div>
      </div>

      {!enabled ? null : email ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-slate-700" title={email}>{email}</span>
          <button type="button" onClick={() => void run(onSyncLocal)} disabled={busy} className="rounded-lg border border-sky-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-sky-700 disabled:opacity-50">
            <RefreshCw size={12} className="inline mr-1" />同步本机水印到云端
          </button>
          <button type="button" onClick={() => void run(onSignOut)} disabled={busy} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-600 disabled:opacity-50">
            <LogOut size={12} className="inline mr-1" />退出
          </button>
        </div>
      ) : (
        <form onSubmit={(event) => {
          event.preventDefault();
          void run(() => onRequestMagicLink(inputEmail.trim()));
        }} className="flex gap-2">
          <input value={inputEmail} onChange={(event) => setInputEmail(event.target.value)} type="email" required placeholder="邮箱，用于 Magic Link 登录" className="min-w-0 flex-1 rounded-lg border border-sky-200 bg-white px-2 py-1.5 text-[11px]" />
          <button type="submit" disabled={busy} className="rounded-lg bg-sky-600 px-2.5 py-1.5 text-[11px] font-bold text-white disabled:opacity-50">
            <LogIn size={12} className="inline mr-1" />登录
          </button>
        </form>
      )}
      {actionError && <div className="text-[11px] font-semibold text-rose-700">云端同步失败：{actionError}</div>}
    </section>
  );
};

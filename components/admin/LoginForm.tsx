"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

/**
 * 登录表单。
 * 失败时统一提示「邮箱或密码错误」，不区分是哪一个错了 ——
 * 区分开等于给攻击者提供账号枚举能力。
 */
export function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError("请填写邮箱和密码");
      return;
    }

    startTransition(async () => {
      const result = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("邮箱或密码错误");
        return;
      }
      router.push(callbackUrl);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="px-5 pb-8">
      <label className="mb-2 block text-[12px] font-medium uppercase tracking-[0.06em] text-ink-3">
        账号
      </label>
      <input
        type="text"
        autoComplete="username"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="账号或邮箱"
        className="w-full rounded-xl bg-surface px-4 py-3 text-[15px] tracking-tight text-ink outline-none placeholder:text-ink-3 focus:ring-[1.5px] focus:ring-accent"
      />

      <label className="mb-2 mt-5 block text-[12px] font-medium uppercase tracking-[0.06em] text-ink-3">
        密码
      </label>
      <input
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="••••••••"
        className="w-full rounded-xl bg-surface px-4 py-3 text-[15px] tracking-tight text-ink outline-none placeholder:text-ink-3 focus:ring-[1.5px] focus:ring-accent"
      />

      {error && (
        <p className="mt-4 rounded-xl bg-[#fdecec] px-3.5 py-2.5 text-[12px] leading-relaxed tracking-tight text-danger">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="press mt-7 w-full rounded-pill bg-accent py-3.5 text-[15px] font-medium tracking-tight text-white hover:bg-accent-hover disabled:bg-surface disabled:text-ink-3"
      >
        {pending ? "登录中…" : "登录"}
      </button>
    </form>
  );
}

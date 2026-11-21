"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-28 text-center">
      <p className="tracking-display text-[24px] font-semibold text-ink">
        出了点问题
      </p>
      <p className="mt-2.5 max-w-[18rem] text-[13px] leading-relaxed tracking-tight text-ink-2">
        请重试一次。如果反复出现，把下面这行信息发给店主。
      </p>
      <code className="mt-4 block max-w-[18rem] overflow-hidden text-ellipsis rounded-xl bg-surface px-3.5 py-2.5 text-[11px] text-ink-3">
        {error.digest ?? error.message}
      </code>
      <button
        type="button"
        onClick={reset}
        className="press mt-7 rounded-pill bg-accent px-6 py-2.5 text-[14px] font-medium tracking-tight text-white hover:bg-accent-hover"
      >
        重试
      </button>
    </div>
  );
}

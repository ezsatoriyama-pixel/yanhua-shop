import Link from "next/link";

/**
 * 空状态 —— Apple 的空页面处理：
 * 居中、大量留白、一句主文案 + 一句说明 + 一个蓝色文字链动作。
 * 不用大插画，保持克制。
 */
export function EmptyState({
  title,
  description,
  actionLabel,
  actionHref,
  icon,
}: {
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
      <div className="mb-6 text-ink-3/70">
        {icon ?? <DefaultIcon />}
      </div>
      <p className="tracking-headline text-[19px] font-semibold text-ink">
        {title}
      </p>
      {description && (
        <p className="mt-2 max-w-[18rem] text-[13px] leading-relaxed tracking-tight text-ink-2">
          {description}
        </p>
      )}
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="press mt-6 rounded-pill bg-accent px-6 py-2.5 text-[14px] font-medium tracking-tight text-white hover:bg-accent-hover"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
}

function DefaultIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-11"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.1}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 7.5h16l-1.4 12a1 1 0 0 1-1 .9H6.4a1 1 0 0 1-1-.9L4 7.5Z" />
      <path d="M9 7.5a3 3 0 0 1 6 0" />
    </svg>
  );
}

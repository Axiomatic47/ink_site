// tiny class joiner (no clsx/tailwind-merge dependency)
export const cn = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');

export const menuStyles = {
  panel: "rounded-2xl border border-line bg-elevated font-sans text-fg shadow-soft",
  row: "relative flex min-h-9 w-full gap-2.5 rounded-xl px-3 text-left text-[13.5px] tracking-[-0.01em] outline-none transition-colors duration-100 motion-reduce:transition-none max-sm:min-h-11",
  interactive: "focus:bg-surface active:bg-surface",
  selected: "bg-surface",
} as const;

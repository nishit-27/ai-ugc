export default function GlBadge({ index }: { index?: number }) {
  if (index === undefined || index === null) return null;
  return (
    <span className="inline-flex items-center rounded-full bg-zinc-700 px-1.5 py-0.5 text-[10px] font-medium leading-none text-zinc-300">
      GL-{index + 1}
    </span>
  );
}

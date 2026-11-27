/** Small tag pills for task cards/rows. Single-tag tasks render exactly the
 *  legacy single pill (same classes); untagged tasks render nothing. */
export default function TagPills({ tags }: { tags: string[] }): React.JSX.Element | null {
  const list = tags ?? [];
  if (list.length === 0) return null;
  return (
    <>
      {list.map(name => (
        <span
          key={name}
          className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-900/[0.06] dark:bg-white/10"
        >
          {name}
        </span>
      ))}
    </>
  );
}

export const GlowingGreenDot = () => {
  return (
    <span className="relative flex h-[6px] w-[6px]">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--green-11)] opacity-75"></span>
      <span className="relative inline-flex rounded-full h-[6px] w-[6px] bg-[var(--green-11)]"></span>
    </span>
  );
};

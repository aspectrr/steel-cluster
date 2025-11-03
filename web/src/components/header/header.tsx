import { Link } from "react-router-dom";
import { SteelIcon } from "../icons/SteelIcon";

export const Header = () => {
  const topRightNavOptions = [
    {
      label: "Docs",
      href: "https://docs.steel.dev",
      target: "_blank",
    },
    {
      label: "Discord",
      href: "https://discord.gg/steel-dev",
      target: "_blank",
    },
  ];

  return (
    <header className="flex flex-col gap-4 px-[1.5rem] py-[1rem] w-full border-b border-[var(--sand-3)]">
      <div className="flex items-center gap-2 w-full">
        <div className="flex items-center gap-2">
          <SteelIcon />
        </div>
        <nav className="flex-1 flex justify-end">
          <div className="flex gap-[1rem] items-center">
            {topRightNavOptions.map((option) => (
              <Link
                key={option.href}
                to={option.href}
                target={option.target}
                className="text-[14px] flex justify-center items-center gap-[2px] text-[var(--sand-10)] hover:text-[var(--sand-12)] active:text-[var(--sand-11)] cursor-pointer"
              >
                {option.label}
              </Link>
            ))}
          </div>
        </nav>
      </div>
    </header>
  );
};

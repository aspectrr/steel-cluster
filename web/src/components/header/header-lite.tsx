import { ChevronRightIcon } from "@radix-ui/react-icons";

import { SteelIcon } from "../icons/SteelIcon";
import { Lego } from "../illustrations/lego";

export const HeaderLite = () => {
  const topRightNavOptions = [
    {
      label: "Home",
      href: "https://steel.dev",
      target: "_blank",
    },
    {
      label: "Docs",
      href: "https://docs.steel.dev",
      target: "_blank",
    },
    {
      label: "Chat with Founders",
      href: "https://cal.com/hussien-hussien-fjxt3x/intro-chat-w-steel-founders",
      target: "_blank",
    },
    {
      label: "Discord",
      href: "https://discord.gg/steel-dev",
      target: "_blank",
    },
  ];

  return (
    <header className="flex flex-col gap-4 px-[1.5rem] pt-[1rem] w-full border-b border-[var(--sand-3)]">
      <div className="flex items-center gap-2 w-full">
        <div className="flex items-center gap-2">
          <SteelIcon />
          <ChevronRightIcon className="text-[var(--sand-12)] w-[1.25rem] h-[1.25rem]" />
          <Lego height={28} width={31} />
          <h1 className="text-[20px] font-normal text-[var(--yellow-9)]">
            Playground
          </h1>
        </div>
        <nav className="flex-1 flex justify-end">
          <div className="flex gap-[1rem] items-center">
            {topRightNavOptions.map((option) => (
              <a
                key={option.href}
                href={option.href}
                target={option.target}
                className="text-[14px] flex justify-center items-center gap-[2px] text-[var(--sand-10)] hover:text-[var(--sand-12)] active:text-[var(--sand-11)] cursor-pointer"
              >
                {option.label}
              </a>
            ))}
          </div>
        </nav>
      </div>
      <div className="flex-1 w-full flex gap-[1rem]"></div>
    </header>
  );
};

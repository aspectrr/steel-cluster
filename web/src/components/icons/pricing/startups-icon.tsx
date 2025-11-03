// import { IconProps } from "@/components/ui/icon";

import { IconProps } from "@/types/props";

export function StartupsIcon({ color = "#F5D90A", height = 20, width = 21 }: IconProps) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 21 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <mask
        id="mask0_598_49458"
        style={{ maskType: "luminance" }}
        maskUnits="userSpaceOnUse"
        x="0"
        y="0"
        width="21"
        height="20"
      >
        <path d="M20.6666 0H0.666626V20H20.6666V0Z" fill="white" />
      </mask>
      <g mask="url(#mask0_598_49458)">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M20.6666 10.0671L10.6666 0L0.666626 10.0671H10.5333L0.666626 20H20.6666L10.7999 10.0671H20.6666Z"
          fill={color}
        />
      </g>
    </svg>
  );
}

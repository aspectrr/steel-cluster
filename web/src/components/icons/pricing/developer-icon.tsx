// import { IconProps } from "@/components/ui/icon";

import { IconProps } from "@/types/props";

export function DeveloperIcon({ color = "#0091FF", height = 20, width = 21 }: IconProps) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 21 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <mask
        id="mask0_598_49447"
        style={{ maskType: "luminance" }}
        maskUnits="userSpaceOnUse"
        x="0"
        y="0"
        width="21"
        height="20"
      >
        <path d="M20.3334 0H0.333374V20H20.3334V0Z" fill="white" />
      </mask>
      <g mask="url(#mask0_598_49447)">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M0.333374 0H5.33337V5H0.333374V0ZM10.3334 5H5.33337V10H0.333374V15H5.33337V20H10.3334V15H15.3334V20H20.3334V15H15.3334V10H20.3334V5H15.3334V0H10.3334V5ZM10.3334 10H15.3334V5H10.3334V10ZM10.3334 10V15H5.33337V10H10.3334Z"
          fill={color}
        />
      </g>
    </svg>
  );
}

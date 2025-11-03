import { IconProps } from "@/types/props";

export function StackBlitzIcon({ width, height, color = "var(--sand-12)", className }: IconProps) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 256 368"
      version="1.1"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid"
      className={className}
    >
      <title>StackBlitz</title>
      <g>
        <polygon
          fill={color}
          points="109.586274 217.013141 0 217.013141 200.340162 2.84217094e-14 146.413726 150.233087 256 150.233087 55.6451483 367.246227 109.571584 217.013141"
        ></polygon>
      </g>
    </svg>
  );
}

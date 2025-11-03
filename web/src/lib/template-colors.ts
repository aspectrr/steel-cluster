export const colorMap = {
  green: {
    border: "border-[#30A66D]",
    text: "text-green-400",
    ring: "ring-[#30A66D]",
    color: "#30A66D",
  },
  yellow: {
    border: "border-yellow-500",
    text: "text-yellow-400",
    ring: "ring-yellow-500",
    color: "#eab308",
  },
  cyan: {
    border: "border-cyan-500",
    text: "text-cyan-400",
    ring: "ring-cyan-500",
    color: "#06b6d4",
  },
  orange: {
    border: "border-orange-500",
    text: "text-orange-400",
    ring: "ring-orange-500",
    color: "#f97316",
  },
  purple: {
    border: "border-purple-500",
    text: "text-purple-400",
    ring: "ring-purple-500",
    color: "#a855f7",
  },
  pink: {
    border: "border-pink-500",
    text: "text-pink-400",
    ring: "ring-pink-500",
    color: "#ec4899",
  },
  blue: {
    border: "border-blue-500",
    text: "text-blue-400",
    ring: "ring-blue-500",
    color: "#3b82f6",
  },
} as const;

type ColorKey = keyof typeof colorMap;

export interface AccentColorInfo {
  border: string;
  text: string;
  ring: string;
  color: string;
}

export function getAccentColors(accentColor?: string): AccentColorInfo {
  if (accentColor && accentColor in colorMap) {
    return colorMap[accentColor as ColorKey];
  }

  // Default fallback
  return {
    border: "border-[var(--sand-11)]",
    text: "text-[var(--sand-11)]",
    ring: "ring-[var(--sand-11)]",
    color: "#30A66D", // default green color
  };
}

export function getAccentColor(accentColor?: string): string {
  return getAccentColors(accentColor).color;
}

export function getSelectionStyles(
  template: { id: string; accentColor?: string },
  selectedTemplate: string | null,
) {
  const isSelected = selectedTemplate === template.id;
  const colors = getAccentColors(template.accentColor);

  return {
    isSelected,
    colors,
    iconColor: isSelected ? colors.color : undefined,
    textClass: isSelected ? colors.text : undefined,
  };
}

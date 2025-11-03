"use client";

import { cn } from "@/lib/utils";
import { grayDark } from "@radix-ui/colors";
import React, { useEffect, useRef, useState } from "react";

interface DiagonalLineAnimationProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: number;
  height?: number;
  className?: string;
  duration?: number;
  delay?: number;
  color?: string;
  angle?: number;
  offset?: number;
  reverse?: boolean;
  disableAnimation?: boolean;
}

export const DiagonalLineAnimation: React.FC<DiagonalLineAnimationProps> = ({
  width,
  height,
  className,
  duration = 2,
  delay = 0.4,
  color = grayDark.gray9,
  angle = -50,
  offset = 0,
  reverse = false,
  disableAnimation = false,
  ...props
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [animationKey, setAnimationKey] = useState(0);

  useEffect(() => {
    const updateSize = () => {
      const container = containerRef.current;
      if (!container) return;

      const newWidth = width || container.clientWidth;
      const newHeight = height || container.clientHeight;

      // Only update if size actually changed
      if (newWidth !== containerSize.width || newHeight !== containerSize.height) {
        setContainerSize({ width: newWidth, height: newHeight });
        // Force animation restart by changing key
        setAnimationKey((prev) => prev + 1);
      }
    };

    updateSize();
    window.addEventListener("resize", updateSize);

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { threshold: 0.1 },
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      window.removeEventListener("resize", updateSize);
      observer.disconnect();
    };
  }, [width, height, containerSize.width, containerSize.height]);

  const centerX = containerSize.width / 2;
  const centerY = containerSize.height / 2 + offset;

  const distanceToTop = centerY;
  const distanceToBottom = containerSize.height - centerY;
  const distanceToLeft = centerX;
  const distanceToRight = containerSize.width - centerX;

  const maxDistanceUp = Math.min(
    Math.abs(distanceToRight / Math.sin(angle)),
    Math.abs(distanceToTop / Math.cos(angle)),
  );

  const maxDistanceDown = Math.min(
    Math.abs(distanceToLeft / Math.sin(angle)),
    Math.abs(distanceToBottom / Math.cos(angle)),
  );

  const dxUp = maxDistanceUp * Math.sin(angle);
  const dyUp = maxDistanceUp * Math.cos(angle);
  const dxDown = maxDistanceDown * Math.sin(angle);
  const dyDown = maxDistanceDown * Math.cos(angle);

  const startX = reverse ? centerX - dxDown : centerX + dxUp;
  const startY = reverse ? centerY + dyDown : centerY - dyUp;
  const endX = reverse ? centerX + dxUp : centerX - dxDown;
  const endY = reverse ? centerY - dyUp : centerY + dyDown;

  return (
    <div
      ref={containerRef}
      className={cn("h-full w-full relative overflow-hidden pointer-events-none", className)}
      {...props}
    >
      <svg
        key={animationKey}
        className="absolute inset-0"
        width={containerSize.width}
        height={containerSize.height}
        viewBox={`0 0 ${containerSize.width} ${containerSize.height}`}
      >
        <line
          x1={startX}
          y1={startY}
          x2={disableAnimation ? endX : startX}
          y2={disableAnimation ? endY : startY}
          stroke={color}
          strokeWidth="1.5"
        >
          {!disableAnimation && isVisible && (
            <>
              <animate
                attributeName="x2"
                values={`${startX};${endX}`}
                dur={`${duration}s`}
                begin={`${delay}s`}
                keyTimes="0;1"
                keySplines="0.16 1 0.08 1"
                calcMode="spline"
                fill="freeze"
              />
              <animate
                attributeName="y2"
                values={`${startY};${endY}`}
                dur={`${duration}s`}
                begin={`${delay}s`}
                keyTimes="0;1"
                keySplines="0.16 1 0.08 1"
                calcMode="spline"
                fill="freeze"
              />
            </>
          )}
        </line>
      </svg>
    </div>
  );
};

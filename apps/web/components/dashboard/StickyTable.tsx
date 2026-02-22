import type { ReactNode } from "react";

export const stickyTableContainerClass = "max-h-[60vh] overflow-auto rounded-lg border";
export const stickyTableClass = "min-w-full border-separate border-spacing-0";
export const stickyHeaderClass = "sticky top-0 z-10 bg-white shadow-sm";
export const stickyLeftClass = "sticky bg-white shadow-[2px_0_0_0_rgba(0,0,0,0.06)]";
export const stickyIntersectionClass = "z-30";

type StickyTableContainerProps = {
  children: ReactNode;
};

export function StickyTableContainer({ children }: StickyTableContainerProps) {
  return <div className={stickyTableContainerClass}>{children}</div>;
}

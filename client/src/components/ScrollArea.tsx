import { OverlayScrollbarsComponent } from "overlayscrollbars-react";
import "overlayscrollbars/overlayscrollbars.css";
import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  className?: string;
}

export function ScrollArea({ children, className = "" }: Props) {
  return (
    <OverlayScrollbarsComponent
      className={className}
      options={{
        scrollbars: {
          autoHide: "scroll",
          autoHideDelay: 800,
          theme: "os-theme-dark",
        },
        overflow: { x: "hidden" },
      }}
      defer
    >
      {children}
    </OverlayScrollbarsComponent>
  );
}

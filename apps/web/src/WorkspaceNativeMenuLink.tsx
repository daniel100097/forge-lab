import type { ReactNode } from "react";
import { Menu } from "@base-ui/react/menu";

export function WorkspaceNativeMenuLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Menu.Item className="menu-item" render={<a href={href} />}>
      {children}
    </Menu.Item>
  );
}

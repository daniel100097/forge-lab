import type { ReactNode, Ref } from "react";
import { Menu } from "@base-ui/react/menu";
import { Link } from "react-router-dom";

export function ActionMenu({
  label,
  trigger,
  children,
  className = "button",
  popupClassName = "",
  triggerRef,
  align = "end",
}: {
  label: string;
  trigger: ReactNode;
  children: ReactNode;
  className?: string;
  popupClassName?: string;
  triggerRef?: Ref<HTMLButtonElement>;
  align?: "start" | "end";
}) {
  return (
    <Menu.Root>
      <Menu.Trigger
        ref={triggerRef}
        className={className}
        aria-label={label}
        title={label}
      >
        {trigger}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner
          className="dropdown-positioner"
          align={align}
          sideOffset={4}
          collisionPadding={12}
        >
          <Menu.Popup
            className={`dropdown-popup action-menu ${popupClassName}`}
            aria-label={label}
          >
            {children}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
export function MenuLink({
  to,
  children,
}: {
  to: string;
  children: ReactNode;
}) {
  return (
    <Menu.Item className="menu-item" render={<Link to={to} />}>
      {children}
    </Menu.Item>
  );
}
export function MenuAction({
  onClick,
  disabled,
  danger = false,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <Menu.Item
      className="menu-item"
      data-danger={danger || undefined}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </Menu.Item>
  );
}
export function MenuGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <Menu.Group>
      <Menu.GroupLabel className="menu-group-label">{label}</Menu.GroupLabel>
      {children}
    </Menu.Group>
  );
}
export function MenuSeparator() {
  return <Menu.Separator className="menu-separator" />;
}
export function MenuDownload({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Menu.Item className="menu-item" render={<a href={href} download />}>
      {children}
    </Menu.Item>
  );
}

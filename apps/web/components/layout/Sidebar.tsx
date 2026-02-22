"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Boxes, Download, FileText, House, LogOut, Send, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { logout } from "@/features/auth/api";
import { useToast } from "@/components/ui/toast";

const items = [
  { href: "/inbounds", label: "Inbounds", icon: Download },
  { href: "/outbounds", label: "Outbounds", icon: Send },
  { href: "/inventory", label: "Inventory", icon: Boxes },
  { href: "/billing", label: "Billing", icon: FileText },
  { href: "/dashboard", label: "Dashboard", icon: House },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { pushToast } = useToast();

  const handleLogout = () => {
    logout();
    pushToast({ title: "Signed out", variant: "info" });
    router.push("/login");
  };

  return (
    <aside className="w-[240px] border-r bg-white px-3 py-6">
      <div className="mb-6 px-3">
        <p className="text-xs text-slate-500">Kowinsblue 3PL</p>
        <h2 className="mt-1 text-base font-semibold">WMS Console</h2>
      </div>
      <nav className="space-y-1">
        {items.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="mt-8 px-3">
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-slate-500 hover:bg-slate-100"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </button>
      </div>
    </aside>
  );
}

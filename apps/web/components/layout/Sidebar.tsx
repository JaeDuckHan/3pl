"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Boxes, Download, FileText, House, LogOut, Send, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { logout } from "@/features/auth/api";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/lib/i18n/I18nProvider";

export function Sidebar() {
  const { lang, setLang, t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const { pushToast } = useToast();
  const items = [
    { href: "/inbounds", label: t("nav.inbounds"), icon: Download },
    { href: "/outbounds", label: t("nav.outbounds"), icon: Send },
    { href: "/inventory", label: t("nav.inventory"), icon: Boxes },
    { href: "/billing", label: t("nav.billing"), icon: FileText },
    { href: "/dashboard", label: t("nav.dashboard"), icon: House },
    { href: "/settings", label: t("nav.settings"), icon: Settings },
  ];

  const handleLogout = () => {
    logout();
    pushToast({ title: "Signed out", variant: "info" });
    router.push("/login");
  };

  return (
    <aside className="w-[240px] border-r bg-white px-3 py-6">
      <div className="mb-6 px-3">
        <p className="text-xs text-slate-500">{t("sidebar.product")}</p>
        <h2 className="mt-1 text-base font-semibold">{t("sidebar.console")}</h2>
        <div className="mt-3">
          <p className="mb-1 text-[11px] text-slate-500">{t("sidebar.language")}</p>
          <div className="inline-flex rounded-md border border-slate-200 p-0.5">
            <button
              type="button"
              onClick={() => setLang("ko")}
              disabled={lang === "ko"}
              className={cn(
                "rounded px-2 py-1 text-xs",
                lang === "ko" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
              )}
            >
              한국어
            </button>
            <button
              type="button"
              onClick={() => setLang("en")}
              disabled={lang === "en"}
              className={cn(
                "rounded px-2 py-1 text-xs",
                lang === "en" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
              )}
            >
              English
            </button>
          </div>
        </div>
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
          {t("sidebar.logout")}
        </button>
      </div>
    </aside>
  );
}

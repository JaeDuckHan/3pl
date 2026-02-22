"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/settings/clients", label: "고객사" },
  { href: "/settings/products", label: "상품" },
  { href: "/settings/warehouses", label: "창고" },
  { href: "/settings/service-rates", label: "서비스 요율" },
  { href: "/settings/contract-rates", label: "계약 요율" },
  { href: "/settings/exchange-rates", label: "환율" },
];

export function SettingsTabs() {
  const pathname = usePathname();

  return (
    <div className="mb-6 rounded-xl border bg-white p-1">
      <div className="flex flex-wrap gap-1">
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm",
                active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

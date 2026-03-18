"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { slug: "picks", label: "Picks" },
  { slug: "table", label: "Table" },
  { slug: "insights", label: "Insights" },
  { slug: "settings", label: "Settings" },
];

export function GroupTabs({ basePath }: { basePath: string }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-wrap items-center gap-2">
      {tabs.map((tab) => {
        const href = `${basePath}/${tab.slug}`;
        const isActive = pathname.startsWith(href);
        return (
          <Link
            key={tab.slug}
            href={href}
            className={`rounded-full px-4 py-2 text-sm transition ${
              isActive
                ? "bg-slate-100 text-slate-900"
                : "border border-slate-800 text-slate-300 hover:border-brand-secondary hover:text-brand-secondary"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

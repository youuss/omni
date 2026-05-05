"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useProjectStore } from "@/stores/project";

export default function ProjectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { projectId } = useParams();
  const { current, fetchProject } = useProjectStore();

  useEffect(() => {
    if (projectId) fetchProject(projectId as string);
  }, [projectId, fetchProject]);

  const nav = [
    { href: `/projects/${projectId}`, label: "Overview" },
    { href: `/projects/${projectId}/agents`, label: "Agents" },
    { href: `/projects/${projectId}/harnesses`, label: "Harnesses" },
    { href: `/projects/${projectId}/runs`, label: "Runs" },
  ];

  return (
    <div className="flex h-screen">
      <aside className="w-52 glass-strong border-r border-border/30 p-4">
        <Link
          href="/projects"
          className="text-xs text-muted-foreground mb-4 block"
        >
          &larr; Projects
        </Link>
        <h2 className="font-semibold mb-4 truncate">
          {current?.name || "..."}
        </h2>
        <nav className="space-y-1">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="block px-3 py-1.5 rounded-lg text-xs hover:bg-white/40 transition-colors"
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}

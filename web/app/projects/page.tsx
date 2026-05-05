"use client";

import { useEffect } from "react";
import { useProjectStore } from "@/stores/project";
import Link from "next/link";

export default function ProjectsPage() {
  const { projects, fetchProjects } = useProjectStore();

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Projects</h1>
        <Link
          href="/projects/new"
          className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-xs font-medium"
        >
          New Project
        </Link>
      </div>
      <div className="space-y-2">
        {projects.map((p) => (
          <Link
            key={p.id}
            href={`/projects/${p.id}`}
            className="block glass-card rounded-xl p-4 hover:bg-white/65 transition-all"
          >
            <h3 className="font-medium">{p.name}</h3>
            {p.description && (
              <p className="text-muted-foreground text-xs mt-1">
                {p.description}
              </p>
            )}
          </Link>
        ))}
        {projects.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-4">No projects yet</p>
            <Link
              href="/projects/new"
              className="text-xs underline text-muted-foreground"
            >
              Create your first project
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

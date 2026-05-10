"use client";

import { useEffect, useState } from "react";
import { useProjectStore } from "@/stores/project";
import Link from "next/link";
import { FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading";

export default function ProjectsPage() {
  const { projects, fetchProjects } = useProjectStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProjects().finally(() => setLoading(false));
  }, [fetchProjects]);

  if (loading) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Projects</h1>
        </div>
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Projects</h1>
        <Link href="/projects/new">
          <Button size="sm">New Project</Button>
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
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <FolderOpen className="h-10 w-10 text-muted-foreground/40" />
            <h3 className="text-sm font-medium text-foreground">
              No projects yet
            </h3>
            <p className="text-xs text-muted-foreground max-w-sm text-center">
              Create your first project to start building agent harnesses.
            </p>
            <Link href="/projects/new">
              <Button size="sm" className="mt-2">
                Create Project
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

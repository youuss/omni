"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useProjectStore } from "@/stores/project";
import { api } from "@/lib/api";

interface Agent {
  id: string;
  name: string;
}

interface Harness {
  id: string;
  name: string;
}

interface Run {
  id: string;
}

export default function ProjectOverviewPage() {
  const { projectId } = useParams();
  const { current, fetchProject } = useProjectStore();
  const [agentCount, setAgentCount] = useState(0);
  const [harnessCount, setHarnessCount] = useState(0);
  const [runCount, setRunCount] = useState(0);

  useEffect(() => {
    if (projectId) {
      fetchProject(projectId as string);
      api<Agent[]>(`/projects/${projectId}/agents`)
        .then((a) => setAgentCount(a.length))
        .catch(() => {});
      api<Harness[]>(`/projects/${projectId}/harnesses`)
        .then((h) => setHarnessCount(h.length))
        .catch(() => {});
      api<Run[]>(`/runs?project_id=${projectId}`)
        .then((r) => setRunCount(r.length))
        .catch(() => {});
    }
  }, [projectId, fetchProject]);

  if (!current) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-2">{current.name}</h1>
      {current.description && (
        <p className="text-muted-foreground text-sm mb-6">
          {current.description}
        </p>
      )}

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="glass-card rounded-xl p-4">
          <p className="text-2xl font-bold">{agentCount}</p>
          <p className="text-xs text-muted-foreground">Agents</p>
        </div>
        <div className="glass-card rounded-xl p-4">
          <p className="text-2xl font-bold">{harnessCount}</p>
          <p className="text-xs text-muted-foreground">Harnesses</p>
        </div>
        <div className="glass-card rounded-xl p-4">
          <p className="text-2xl font-bold">{runCount}</p>
          <p className="text-xs text-muted-foreground">Runs</p>
        </div>
      </div>

      <h2 className="font-semibold mb-3">Quick Actions</h2>
      <div className="flex gap-3">
        <Link
          href={`/projects/${projectId}/agents`}
          className="glass-card rounded-lg px-4 py-2 text-xs hover:bg-white/65 transition-all"
        >
          Manage Agents
        </Link>
        <Link
          href={`/projects/${projectId}/harnesses`}
          className="glass-card rounded-lg px-4 py-2 text-xs hover:bg-white/65 transition-all"
        >
          Manage Harnesses
        </Link>
        <Link
          href={`/projects/${projectId}/runs`}
          className="glass-card rounded-lg px-4 py-2 text-xs hover:bg-white/65 transition-all"
        >
          View Runs
        </Link>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useHarnessStore } from "@/stores/harness";
import { useRunStore, type Run } from "@/stores/run";
import { statusBadge } from "@/lib/status";
import { Play, GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/ui/loading";
import Link from "next/link";

export default function RunsPage() {
  const { projectId } = useParams();
  const router = useRouter();
  const { harnesses, fetchHarnesses } = useHarnessStore();
  const { runs, fetchRuns } = useRunStore();
  const [selectedHarnessId, setSelectedHarnessId] = useState<string | null>(
    null,
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (projectId) {
      fetchHarnesses(projectId as string).finally(() => setLoading(false));
    }
  }, [projectId, fetchHarnesses]);

  useEffect(() => {
    if (selectedHarnessId) {
      fetchRuns(selectedHarnessId);
    }
  }, [selectedHarnessId, fetchRuns]);

  // Auto-select first harness
  useEffect(() => {
    if (harnesses.length > 0 && !selectedHarnessId) {
      setSelectedHarnessId(harnesses[0].id);
    }
  }, [harnesses, selectedHarnessId]);

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Runs</h1>
        </div>
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Runs</h1>
      </div>

      {harnesses.length > 0 && (
        <div className="flex gap-2 mb-4">
          {harnesses.map((h) => (
            <button
              key={h.id}
              onClick={() => setSelectedHarnessId(h.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                selectedHarnessId === h.id
                  ? "bg-primary text-primary-foreground"
                  : "glass-card hover:bg-white/65"
              }`}
            >
              {h.name}
            </button>
          ))}
        </div>
      )}

      {selectedHarnessId && (
        <div className="space-y-2">
          {runs.map((run: Run) => (
            <button
              key={run.id}
              onClick={() =>
                router.push(`/projects/${projectId}/runs/${run.id}`)
              }
              className="w-full text-left glass-card rounded-xl p-4 hover:bg-white/65 transition-all cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-sm font-mono">{run.id}</h3>
                  <p className="text-muted-foreground text-[11px] mt-0.5">
                    {new Date(run.created_at).toLocaleString()}
                  </p>
                </div>
                <Badge
                  variant={
                    run.status === "completed"
                      ? "success"
                      : run.status === "failed"
                        ? "destructive"
                        : "secondary"
                  }
                >
                  {statusBadge[run.status]?.label || run.status}
                </Badge>
              </div>
            </button>
          ))}
          {runs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Play className="h-10 w-10 text-muted-foreground/40" />
              <h3 className="text-sm font-medium text-foreground">
                No runs yet
              </h3>
              <p className="text-xs text-muted-foreground max-w-sm text-center">
                Execute a harness to see run history and results here.
              </p>
            </div>
          )}
        </div>
      )}

      {harnesses.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <GitBranch className="h-10 w-10 text-muted-foreground/40" />
          <h3 className="text-sm font-medium text-foreground">
            No harnesses found
          </h3>
          <p className="text-xs text-muted-foreground max-w-sm text-center">
            Create a harness first to start running agent workflows.
          </p>
          <Link href={`/projects/${projectId}/harnesses`}>
            <Button size="sm" className="mt-2">
              Go to Harnesses
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}

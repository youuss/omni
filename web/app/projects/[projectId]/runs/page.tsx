"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useHarnessStore } from "@/stores/harness";
import { useRunStore, type Run } from "@/stores/run";

const statusBadge: Record<string, string> = {
  pending: "bg-muted-foreground/20 text-muted-foreground",
  running: "bg-indigo-100 text-indigo-700",
  completed: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
  aborted: "bg-amber-100 text-amber-700",
};

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
        <p className="text-muted-foreground">Loading...</p>
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
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full ${statusBadge[run.status] || "bg-muted-foreground/20 text-muted-foreground"}`}
                >
                  {run.status}
                </span>
              </div>
            </button>
          ))}
          {runs.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground text-xs">
                No runs yet for this harness
              </p>
            </div>
          )}
        </div>
      )}

      {harnesses.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground text-xs">
            No harnesses found. Create a harness first.
          </p>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ReactFlowProvider } from "@xyflow/react";
import { useRunStore } from "@/stores/run";
import { useHarnessStore } from "@/stores/harness";
import { ExecutionView } from "@/components/run/ExecutionView";
import { OutputPanel } from "@/components/run/OutputPanel";
import { GateApproval } from "@/components/run/GateApproval";

const statusBadge: Record<string, string> = {
  pending: "bg-muted-foreground/20 text-muted-foreground",
  running: "bg-indigo-100 text-indigo-700",
  completed: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
  aborted: "bg-amber-100 text-amber-700",
};

export default function RunDetailPage() {
  const { projectId, runId } = useParams();
  const router = useRouter();
  const {
    current: run,
    fetchRun,
    connectWS,
    disconnectWS,
    abortRun,
    nodeStates,
  } = useRunStore();
  const { current: harness, fetchHarness } = useHarnessStore();
  const [aborting, setAborting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (runId) {
      fetchRun(runId as string)
        .then(() => setLoading(false))
        .catch(() => setLoading(false));
      connectWS(runId as string);
    }
    return () => {
      disconnectWS();
    };
  }, [runId, fetchRun, connectWS, disconnectWS]);

  // Fetch harness definition once we know the harness_id
  useEffect(() => {
    if (run?.harness_id) {
      fetchHarness(run.harness_id);
    }
  }, [run?.harness_id, fetchHarness]);

  const handleAbort = useCallback(async () => {
    if (!runId) return;
    setAborting(true);
    try {
      await abortRun(runId as string);
    } finally {
      setAborting(false);
    }
  }, [runId, abortRun]);

  // Find gate nodes that are waiting
  const waitingGates = Object.entries(nodeStates)
    .filter(([, state]) => state.status === "waiting")
    .map(([nodeId]) => nodeId);

  if (loading) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Run not found</p>
      </div>
    );
  }

  const isRunning =
    run.status === "running" || run.status === "pending";

  return (
    <div className="flex flex-col h-[calc(100vh-0px)] overflow-hidden">
      {/* Header bar */}
      <div className="shrink-0 glass-strong border-b border-border/30 px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/projects/${projectId}/runs`)}
            className="text-xs text-muted-foreground hover:underline"
          >
            &larr; Runs
          </button>
          <h1 className="text-sm font-semibold font-mono">{run.id}</h1>
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full ${statusBadge[run.status] || "bg-muted-foreground/20 text-muted-foreground"}`}
          >
            {run.status}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isRunning && (
            <button
              onClick={handleAbort}
              disabled={aborting}
              className="bg-destructive text-white px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
            >
              {aborting ? "Aborting..." : "Abort"}
            </button>
          )}
        </div>
      </div>

      {/* Gate approval banner */}
      {waitingGates.length > 0 && (
        <div className="shrink-0 px-5 py-3 space-y-2">
          {waitingGates.map((nodeId) => (
            <GateApproval
              key={nodeId}
              runId={runId as string}
              nodeId={nodeId}
            />
          ))}
        </div>
      )}

      {/* Main content: DAG + Output */}
      <div className="flex-1 flex min-h-0">
        <div className="flex-1 relative">
          <ReactFlowProvider>
            <ExecutionView
              definitionNodes={harness?.definition?.nodes || []}
              definitionEdges={harness?.definition?.edges || []}
            />
          </ReactFlowProvider>
        </div>
        <div className="w-96 shrink-0 border-l border-border/30">
          <OutputPanel />
        </div>
      </div>
    </div>
  );
}

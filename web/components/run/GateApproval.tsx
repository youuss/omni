"use client";

import { useState } from "react";
import { useRunStore } from "@/stores/run";

export function GateApproval({
  runId,
  nodeId,
}: {
  runId: string;
  nodeId: string;
}) {
  const { approveGate, rejectGate } = useRunStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleApprove = async () => {
    setLoading(true);
    setError("");
    try {
      await approveGate(runId, nodeId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to approve");
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    setLoading(true);
    setError("");
    try {
      await rejectGate(runId, nodeId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to reject");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-card rounded-xl p-4 space-y-3">
      <p className="text-xs font-medium">Gate Checkpoint</p>
      <p className="text-[11px] text-muted-foreground">
        Node <span className="font-mono">{nodeId}</span> is waiting for
        approval.
      </p>
      {error && <p className="text-[11px] text-destructive">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={handleApprove}
          disabled={loading}
          className="bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
        >
          {loading ? "Approving..." : "Approve"}
        </button>
        <button
          onClick={handleReject}
          disabled={loading}
          className="bg-destructive text-white px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
        >
          {loading ? "Rejecting..." : "Reject"}
        </button>
      </div>
    </div>
  );
}

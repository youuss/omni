"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ReactFlowProvider } from "@xyflow/react";
import { useHarnessStore } from "@/stores/harness";
import { HarnessCanvas } from "@/components/harness/HarnessCanvas";
import { AgentPalette } from "@/components/harness/AgentPalette";
import { NodeConfigPanel } from "@/components/harness/NodeConfigPanel";
import { api } from "@/lib/api";

interface Agent {
  id: string;
  name: string;
}

export default function HarnessEditorPage() {
  const { harnessId, projectId } = useParams();
  const router = useRouter();
  const { fetchHarness, current, saveDefinition, selectedNodeId } =
    useHarnessStore();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (harnessId) fetchHarness(harnessId as string);
    if (projectId) {
      api<Agent[]>(`/projects/${projectId}/agents`)
        .then((a) => setAgents(a || []))
        .catch(() => {});
    }
  }, [harnessId, projectId, fetchHarness]);

  const handleSave = useCallback(async () => {
    if (!harnessId) return;
    setSaving(true);
    try {
      await saveDefinition(harnessId as string);
    } finally {
      setSaving(false);
    }
  }, [harnessId, saveDefinition]);

  return (
    <ReactFlowProvider>
      <div className="flex h-[calc(100vh-0px)] overflow-hidden">
        {/* Left sidebar - Agent palette */}
        <aside className="w-48 shrink-0 glass-strong border-r border-border/30 p-3 overflow-auto">
          <button
            onClick={() => router.push(`/projects/${projectId}/harnesses`)}
            className="text-xs text-muted-foreground mb-3 block hover:underline"
          >
            &larr; Harnesses
          </button>
          <AgentPalette agents={agents} />
        </aside>

        {/* Center - Canvas */}
        <main className="flex-1 relative">
          <div className="absolute top-3 right-3 z-10 flex gap-2 items-center">
            <span className="text-xs text-muted-foreground">
              {current?.name || "Untitled"}
            </span>
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
          <HarnessCanvas />
        </main>

        {/* Right sidebar - Config panel */}
        {selectedNodeId && (
          <aside className="w-72 shrink-0 glass-strong border-l border-border/30 p-4 overflow-auto">
            <NodeConfigPanel />
          </aside>
        )}
      </div>
    </ReactFlowProvider>
  );
}

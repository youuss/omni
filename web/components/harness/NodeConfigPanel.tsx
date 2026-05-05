"use client";

import { useHarnessStore } from "@/stores/harness";

export function NodeConfigPanel() {
  const { selectedNodeId, nodes, setNodes } = useHarnessStore();
  const node = nodes.find((n) => n.id === selectedNodeId);

  if (!node) return null;

  const updateData = (key: string, value: string) => {
    setNodes(
      nodes.map((n) =>
        n.id === selectedNodeId
          ? { ...n, data: { ...n.data, [key]: value } }
          : n,
      ),
    );
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium">Node Configuration</h3>
      <div>
        <label className="text-[10px] uppercase tracking-widest text-muted-foreground/60">
          Type
        </label>
        <p className="text-xs mt-1">{node.type}</p>
      </div>
      <div>
        <label className="text-[10px] uppercase tracking-widest text-muted-foreground/60">
          Agent ID
        </label>
        <input
          type="text"
          value={(node.data.agentId as string) || ""}
          onChange={(e) => updateData("agentId", e.target.value)}
          className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border/30 bg-white/50 text-xs"
        />
      </div>
      <div>
        <label className="text-[10px] uppercase tracking-widest text-muted-foreground/60">
          Label
        </label>
        <input
          type="text"
          value={(node.data.label as string) || ""}
          onChange={(e) => updateData("label", e.target.value)}
          className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border/30 bg-white/50 text-xs"
        />
      </div>
    </div>
  );
}

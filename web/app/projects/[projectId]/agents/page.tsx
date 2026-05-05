"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";

interface Agent {
  id: string;
  project_id: string;
  name: string;
  description?: string;
  system_prompt?: string;
  tags: string[];
  is_builtin: boolean;
}

export default function AgentsPage() {
  const { projectId } = useParams();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Create form state
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchAgents = useCallback(async () => {
    try {
      const data = await api<Agent[]>(`/projects/${projectId}/agents`);
      setAgents(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load agents");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (projectId) fetchAgents();
  }, [projectId, fetchAgents]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError("");
    try {
      await api<Agent>(`/projects/${projectId}/agents`, {
        method: "POST",
        body: JSON.stringify({
          name,
          description: description || undefined,
          system_prompt: systemPrompt || undefined,
        }),
      });
      setName("");
      setDescription("");
      setSystemPrompt("");
      setShowForm(false);
      fetchAgents();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create agent");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api(`/projects/${projectId}/agents/${id}`, { method: "DELETE" });
      setAgents((prev) => prev.filter((a) => a.id !== id));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete agent");
    }
  };

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
        <h1 className="text-2xl font-bold">Agents</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-xs font-medium"
        >
          {showForm ? "Cancel" : "New Agent"}
        </button>
      </div>

      {error && <p className="text-destructive text-xs mb-4">{error}</p>}

      {showForm && (
        <div className="glass-card rounded-xl p-4 mb-6">
          <form onSubmit={handleCreate} className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-white/50 text-sm"
                required
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">
                Description
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-white/50 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">
                System Prompt
              </label>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-white/50 text-sm resize-none"
                rows={4}
              />
            </div>
            <button
              type="submit"
              disabled={creating}
              className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-xs font-medium disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create Agent"}
            </button>
          </form>
        </div>
      )}

      <div className="space-y-2">
        {agents.map((agent) => (
          <div
            key={agent.id}
            className="glass-card rounded-xl p-4 flex justify-between items-start"
          >
            <div>
              <h3 className="font-medium">{agent.name}</h3>
              {agent.description && (
                <p className="text-muted-foreground text-xs mt-1">
                  {agent.description}
                </p>
              )}
              {agent.tags && agent.tags.length > 0 && (
                <div className="flex gap-1 mt-2">
                  {agent.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => handleDelete(agent.id)}
              className="text-xs text-muted-foreground hover:text-destructive transition-colors"
            >
              Delete
            </button>
          </div>
        ))}
        {agents.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-4">No agents yet</p>
            <button
              onClick={() => setShowForm(true)}
              className="text-xs underline text-muted-foreground"
            >
              Create your first agent
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

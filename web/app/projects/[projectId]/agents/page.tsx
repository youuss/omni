"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/ui/loading";

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
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Agents</h1>
        </div>
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Agents</h1>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "New Agent"}
        </Button>
      </div>

      {error && <p className="text-destructive text-xs mb-4">{error}</p>}

      {showForm && (
        <Card className="mb-6">
          <form onSubmit={handleCreate} className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1"
                required
              />
            </div>
            <div>
              <Label>Description</Label>
              <Input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>System Prompt</Label>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                className="flex w-full mt-1 rounded-lg border border-border bg-white/50 px-3 py-2 text-sm resize-none placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                rows={4}
              />
            </div>
            <Button type="submit" size="sm" disabled={creating}>
              {creating ? "Creating..." : "Create Agent"}
            </Button>
          </form>
        </Card>
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
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
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
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Bot className="h-10 w-10 text-muted-foreground/40" />
            <h3 className="text-sm font-medium text-foreground">
              No agents yet
            </h3>
            <p className="text-xs text-muted-foreground max-w-sm text-center">
              Create agents to define the AI participants in your harness.
            </p>
            <Button size="sm" className="mt-2" onClick={() => setShowForm(true)}>
              Create Agent
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

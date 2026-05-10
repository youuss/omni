"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useHarnessStore, type Harness } from "@/stores/harness";
import { GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/ui/loading";

export default function HarnessesPage() {
  const { projectId } = useParams();
  const router = useRouter();
  const { harnesses, fetchHarnesses, createHarness } = useHarnessStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      await fetchHarnesses(projectId as string);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load harnesses");
    } finally {
      setLoading(false);
    }
  }, [projectId, fetchHarnesses]);

  useEffect(() => {
    if (projectId) load();
  }, [projectId, load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError("");
    try {
      const harness = await createHarness(projectId as string, name);
      setName("");
      setShowForm(false);
      router.push(`/projects/${projectId}/harnesses/${harness.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create harness");
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Harnesses</h1>
        </div>
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Harnesses</h1>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "New Harness"}
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
            <Button type="submit" size="sm" disabled={creating}>
              {creating ? "Creating..." : "Create Harness"}
            </Button>
          </form>
        </Card>
      )}

      <div className="space-y-2">
        {harnesses.map((harness: Harness) => (
          <button
            key={harness.id}
            onClick={() =>
              router.push(`/projects/${projectId}/harnesses/${harness.id}`)
            }
            className="w-full text-left glass-card rounded-xl p-4 hover:bg-white/65 transition-all cursor-pointer"
          >
            <h3 className="font-medium">{harness.name}</h3>
            {harness.description && (
              <p className="text-muted-foreground text-xs mt-1">
                {harness.description}
              </p>
            )}
            {harness.tags && harness.tags.length > 0 && (
              <div className="flex gap-1 mt-2">
                {harness.tags.map((tag: string) => (
                  <Badge key={tag} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </button>
        ))}
        {harnesses.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <GitBranch className="h-10 w-10 text-muted-foreground/40" />
            <h3 className="text-sm font-medium text-foreground">
              No harnesses yet
            </h3>
            <p className="text-xs text-muted-foreground max-w-sm text-center">
              Create a harness to define agent workflows and orchestration
              patterns.
            </p>
            <Button size="sm" className="mt-2" onClick={() => setShowForm(true)}>
              Create Harness
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

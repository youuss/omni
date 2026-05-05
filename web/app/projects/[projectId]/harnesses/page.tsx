"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useHarnessStore, type Harness } from "@/stores/harness";

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
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Harnesses</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-xs font-medium"
        >
          {showForm ? "Cancel" : "New Harness"}
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
            <button
              type="submit"
              disabled={creating}
              className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-xs font-medium disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create Harness"}
            </button>
          </form>
        </div>
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
                  <span
                    key={tag}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </button>
        ))}
        {harnesses.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-4">No harnesses yet</p>
            <button
              onClick={() => setShowForm(true)}
              className="text-xs underline text-muted-foreground"
            >
              Create your first harness
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

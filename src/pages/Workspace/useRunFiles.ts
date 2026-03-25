import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import type { FileTab } from '../../types/harness';

export function useRunFiles(
  projectPath: string | undefined,
  tabs: FileTab[]
) {
  const [documents, setDocuments] = useState<Record<string, string>>({});
  const [editingTabId, setEditingTabId] = useState<string | null>(null);

  const loadFiles = useCallback(
    async (_runId: string) => {
      if (!projectPath || tabs.length === 0) {
        setDocuments({});
        return;
      }

      const entries = await Promise.all(
        tabs.map(async (tab) => {
          try {
            const fullPath = `${projectPath}/${tab.filePath}`;
            const content = await invoke<string>('read_text_file', { path: fullPath });
            return [tab.id, content] as const;
          } catch {
            return [tab.id, ''] as const;
          }
        })
      );

      const docs: Record<string, string> = {};
      for (const [id, content] of entries) {
        docs[id] = content;
      }
      setDocuments(docs);
      setEditingTabId(null);
    },
    [projectPath, tabs]
  );

  const updateDocument = useCallback(
    (tabId: string, content: string) => {
      setDocuments((prev) => ({ ...prev, [tabId]: content }));
    },
    []
  );

  const saveDocument = useCallback(
    async (tabId: string) => {
      if (!projectPath) return;
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab) return;
      const content = documents[tabId] ?? '';
      try {
        const fullPath = `${projectPath}/${tab.filePath}`;
        await invoke('write_text_file', { path: fullPath, content });
        setEditingTabId(null);
        toast.success('Saved');
      } catch (e) {
        toast.error(`Save failed: ${e}`);
      }
    },
    [projectPath, tabs, documents]
  );

  const clearFiles = useCallback(() => {
    setDocuments({});
    setEditingTabId(null);
  }, []);

  const hasContent = useCallback(
    (tabId: string) => !!(documents[tabId]?.trim()),
    [documents]
  );

  return {
    documents,
    editingTabId,
    setEditingTabId,
    updateDocument,
    saveDocument,
    loadFiles,
    clearFiles,
    hasContent,
  };
}

import { useState, useCallback } from 'react';

export function useRunFiles(
  projectPath: string | undefined,
) {
  const [documents, setDocuments] = useState<Record<string, string>>({});
  const [editingTabId, setEditingTabId] = useState<string | null>(null);

  const loadFiles = useCallback(
    async (_runId: string) => {
      // Simplified: no tabs to load from.
      // Will be wired up when InputPanel replaces ContentTabs.
      setDocuments({});
      setEditingTabId(null);
    },
    [projectPath]
  );

  const updateDocument = useCallback(
    (tabId: string, content: string) => {
      setDocuments((prev) => ({ ...prev, [tabId]: content }));
    },
    []
  );

  const saveDocument = useCallback(
    async (_tabId: string) => {
      // No-op until InputPanel is wired up
    },
    [projectPath, documents]
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

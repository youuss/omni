import { FileText } from 'lucide-react';

/**
 * ContentTabs — placeholder stub.
 * The old FileTab / AgentCategory types have been removed in the harness pivot.
 * This component will be replaced by InputPanel (Task 13).
 */
export default function ContentTabs() {
  return (
    <div className="glass-card rounded-2xl flex items-center justify-center h-full">
      <div className="text-center px-8">
        <FileText className="w-10 h-10 text-muted-foreground/20 mb-3 mx-auto" />
        <p className="text-sm text-muted-foreground">No file tabs</p>
        <p className="text-xs text-muted-foreground/50 mt-1">This panel will be replaced</p>
      </div>
    </div>
  );
}

import { Button } from '@/components/ui/button';
import { Play, Square, Save, RotateCcw } from 'lucide-react';
import { useHarnessStore } from '../../stores/harnessStore';

interface CanvasToolbarProps {
  projectPath: string;
  isRunning: boolean;
  harnessReady: boolean;
  onRunHarness: () => void;
  onAbort: () => void;
}

export default function CanvasToolbar({
  projectPath,
  isRunning,
  harnessReady,
  onRunHarness,
  onAbort,
}: CanvasToolbarProps) {
  const { dirty, saveCurrent, resetExecution } = useHarnessStore();

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/80 backdrop-blur-md border border-border/40 shadow-[0_2px_12px_oklch(0_0_0/0.08)]">
      {isRunning ? (
        <Button
          variant="destructive"
          size="xs"
          className="gap-1 h-7 text-[11px]"
          onClick={onAbort}
        >
          <Square className="w-3 h-3" />
          Abort
        </Button>
      ) : (
        <Button
          size="xs"
          className="gap-1 h-7 text-[11px]"
          disabled={!harnessReady}
          onClick={onRunHarness}
        >
          <Play className="w-3 h-3" />
          Execute
        </Button>
      )}

      {dirty && (
        <Button
          variant="outline"
          size="xs"
          className="gap-1 h-7 text-[11px]"
          onClick={() => saveCurrent(projectPath)}
        >
          <Save className="w-3 h-3" />
          Save
        </Button>
      )}

      {!isRunning && (
        <Button
          variant="ghost"
          size="xs"
          className="gap-1 h-7 text-[11px]"
          onClick={resetExecution}
        >
          <RotateCcw className="w-3 h-3" />
          Reset
        </Button>
      )}
    </div>
  );
}

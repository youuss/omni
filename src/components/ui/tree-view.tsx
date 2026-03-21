import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronRight, Folder, File, Loader2 } from 'lucide-react';

export interface TreeNode {
  name: string;
  path: string;
  is_dir: boolean;
  children?: TreeNode[];
}

interface TreeViewProps {
  data: TreeNode[];
  className?: string;
  onLoadChildren?: (node: TreeNode) => Promise<TreeNode[]>;
}

function TreeItem({
  node,
  level = 0,
  onLoadChildren,
}: {
  node: TreeNode;
  level?: number;
  onLoadChildren?: (node: TreeNode) => Promise<TreeNode[]>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dynamicChildren, setDynamicChildren] = useState<TreeNode[] | null>(
    null
  );

  const children = dynamicChildren ?? node.children;
  const hasChildren = node.is_dir && children && children.length > 0;
  const isExpandable =
    node.is_dir && (hasChildren || (!children && onLoadChildren));

  const handleToggle = async () => {
    if (!isExpandable) return;

    if (!expanded && !children && onLoadChildren) {
      setLoading(true);
      try {
        const loaded = await onLoadChildren(node);
        setDynamicChildren(loaded);
      } catch {
        setDynamicChildren([]);
      } finally {
        setLoading(false);
      }
      setExpanded(true);
    } else {
      setExpanded(!expanded);
    }
  };

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1.5 py-1 px-2 rounded-sm text-sm cursor-default hover:bg-accent transition-colors',
          'select-none'
        )}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={handleToggle}
      >
        {isExpandable ? (
          loading ? (
            <Loader2 className="w-3.5 h-3.5 shrink-0 text-muted-foreground animate-spin" />
          ) : (
            <ChevronRight
              className={cn(
                'w-3.5 h-3.5 shrink-0 text-muted-foreground transition-transform',
                expanded && 'rotate-90'
              )}
            />
          )
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        {node.is_dir ? (
          <Folder className="w-4 h-4 shrink-0 text-primary/70" />
        ) : (
          <File className="w-4 h-4 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate">{node.name}</span>
      </div>
      {expanded && (children?.length ?? 0) > 0 && (
        <div>
          {children!.map((child) => (
            <TreeItem
              key={child.path}
              node={child}
              level={level + 1}
              onLoadChildren={onLoadChildren}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function TreeView({ data, className, onLoadChildren }: TreeViewProps) {
  return (
    <div className={cn('text-sm', className)}>
      {data.map((node) => (
        <TreeItem key={node.path} node={node} onLoadChildren={onLoadChildren} />
      ))}
    </div>
  );
}

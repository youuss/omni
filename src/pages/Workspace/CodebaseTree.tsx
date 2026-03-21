import { useCallback, useEffect, useState } from 'react';
import { TreeView, type TreeNode } from '@/components/ui/tree-view';
import { scanDirectory } from '../../services/project';
import { Loader2 } from 'lucide-react';
import type { DirEntry } from '../../types';

interface Props {
  projectPath: string;
}

function toTreeNode(entry: DirEntry): TreeNode {
  return {
    name: entry.name,
    path: entry.path,
    is_dir: entry.is_dir,
    children: entry.children?.map(toTreeNode),
  };
}

export default function CodebaseTree({ projectPath }: Props) {
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!projectPath) return;
    setLoading(true);
    scanDirectory(projectPath, 3)
      .then((root) => {
        setTreeData(root.children?.map(toTreeNode) ?? []);
      })
      .catch(() => setTreeData([]))
      .finally(() => setLoading(false));
  }, [projectPath]);

  const handleLoadChildren = useCallback(
    async (node: TreeNode): Promise<TreeNode[]> => {
      const result = await scanDirectory(node.path, 2);
      return result.children?.map(toTreeNode) ?? [];
    },
    []
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
          代码结构
        </p>
      </div>
      <div>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <TreeView data={treeData} onLoadChildren={handleLoadChildren} />
        )}
      </div>
    </div>
  );
}

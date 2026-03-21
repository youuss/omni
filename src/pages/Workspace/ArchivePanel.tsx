import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Empty } from '@/components/ui/empty';
import { ScrollArea } from '@/components/ui/scroll-area';
import * as specService from '../../services/spec';
import MarkdownRenderer from '../../components/MarkdownRenderer';
import type { ArchiveInfo } from '../../types';
import { History, FolderOpen } from 'lucide-react';

interface Props {
  projectPath: string;
}

export default function ArchivePanel({ projectPath }: Props) {
  const [archives, setArchives] = useState<ArchiveInfo[]>([]);
  const [selectedArchive, setSelectedArchive] = useState<ArchiveInfo | null>(
    null
  );
  const [fileContents, setFileContents] = useState<Record<string, string>>({});
  const [detailOpen, setDetailOpen] = useState(false);

  const loadArchives = async () => {
    try {
      const list = await specService.listArchivedChanges(projectPath);
      setArchives(list);
    } catch {
      setArchives([]);
    }
  };

  useEffect(() => {
    loadArchives();
  }, [projectPath]);

  const handleViewArchive = async (archive: ArchiveInfo) => {
    setSelectedArchive(archive);
    setDetailOpen(true);

    const contents: Record<string, string> = {};
    const mdFiles = archive.files.filter((f) => f.endsWith('.md'));
    await Promise.all(
      mdFiles.map(async (file) => {
        try {
          contents[file] = await specService.readArchiveFile(
            projectPath,
            archive.name,
            file
          );
        } catch {
          contents[file] = '（无法读取）';
        }
      })
    );
    setFileContents(contents);
  };

  const mdFiles = selectedArchive ? Object.entries(fileContents) : [];

  return (
    <>
      <div>
        <div className="flex items-center gap-2 mb-3">
          <History className="w-3.5 h-3.5 text-muted-foreground" />
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
            历史归档
          </p>
        </div>
        {archives.length === 0 ? (
          <Empty description="暂无归档记录" className="py-6" />
        ) : (
          <div className="space-y-0.5">
            {archives.map((archive) => (
              <button
                key={archive.name}
                onClick={() => handleViewArchive(archive)}
                className="flex items-center gap-2 w-full rounded-lg px-3 py-2.5 text-xs hover:bg-accent/50 transition-colors text-left"
              >
                <FolderOpen className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs truncate font-medium">
                    {archive.original_name}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {archive.date && (
                      <Badge
                        variant="secondary"
                        className="text-[9px] h-3.5 px-1"
                      >
                        {archive.date}
                      </Badge>
                    )}
                    <span className="text-[10px] text-muted-foreground">
                      {archive.files.length} 个文件
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-[720px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-4 h-4" />
              归档详情: {selectedArchive?.original_name}
              {selectedArchive?.date && (
                <Badge variant="secondary" className="text-[10px]">
                  {selectedArchive.date}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {mdFiles.length > 0 ? (
            <Tabs defaultValue={mdFiles[0][0]}>
              <TabsList>
                {mdFiles.map(([fileName]) => (
                  <TabsTrigger key={fileName} value={fileName}>
                    {fileName.replace('.md', '')}
                  </TabsTrigger>
                ))}
              </TabsList>
              {mdFiles.map(([fileName, content]) => (
                <TabsContent key={fileName} value={fileName}>
                  <ScrollArea className="max-h-[480px]">
                    <MarkdownRenderer content={content} />
                  </ScrollArea>
                </TabsContent>
              ))}
            </Tabs>
          ) : (
            <Empty description="无 Markdown 文件" />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

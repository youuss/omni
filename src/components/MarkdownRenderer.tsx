import type { ComponentPropsWithoutRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

interface Props {
  content: string;
}

const LANG_ALIASES: Record<string, string> = {
  vue: 'html',
  svelte: 'html',
  jsonc: 'json',
  zsh: 'bash',
  sh: 'bash',
  yml: 'yaml',
  dockerfile: 'docker',
};

function CodeBlock({
  className,
  children,
  ...rest
}: ComponentPropsWithoutRef<'code'>) {
  const match = /language-(\w+)/.exec(className || '');
  const code = String(children).replace(/\n$/, '');

  if (!match) {
    return (
      <code className={className} {...rest}>
        {children}
      </code>
    );
  }

  const raw = match[1].toLowerCase();
  const language = LANG_ALIASES[raw] ?? raw;

  return (
    <SyntaxHighlighter
      style={oneDark}
      language={language}
      PreTag="div"
      customStyle={{
        margin: 0,
        padding: '1rem',
        background: 'transparent',
        fontSize: '13px',
        lineHeight: 1.7,
      }}
      codeTagProps={{ style: { fontFamily: 'var(--font-mono)' } }}
    >
      {code}
    </SyntaxHighlighter>
  );
}

export default function MarkdownRenderer({ content }: Props) {
  return (
    <div
      className={cn(
        'markdown-prose prose prose-sm prose-neutral max-w-none min-w-0 overflow-x-auto',
        'prose-headings:text-foreground',
        'prose-p:text-foreground/85',
        'prose-li:text-foreground/85',
        'prose-strong:text-foreground',
        'prose-a:text-primary',
        // 行内 code
        'prose-code:bg-muted prose-code:text-foreground',
        'prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md',
        'prose-code:text-[13px] prose-code:font-mono prose-code:font-medium',
        'prose-code:before:content-none prose-code:after:content-none',
        // 围栏代码块 pre
        'prose-pre:my-4 prose-pre:rounded-xl prose-pre:border prose-pre:border-white/[0.08]',
        'prose-pre:bg-[#1e1e2e] prose-pre:p-0 prose-pre:overflow-x-auto',
        // pre 内 code：覆盖行内 code 的样式
        '[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:rounded-none',
        '[&_pre_code]:text-inherit [&_pre_code]:text-[13px] [&_pre_code]:font-normal',
        '[&_pre_code]:before:content-none [&_pre_code]:after:content-none',
        'prose-blockquote:border-primary/40 prose-blockquote:text-muted-foreground',
        'prose-hr:border-border/40',
        // GFM 表格
        'prose-table:w-full prose-table:border-collapse prose-table:text-[13px] prose-table:my-4',
        'prose-th:border prose-th:border-border/70 prose-th:bg-muted/80 prose-th:px-3 prose-th:py-2',
        'prose-th:text-left prose-th:font-semibold prose-th:text-foreground',
        'prose-td:border prose-td:border-border/50 prose-td:px-3 prose-td:py-2 prose-td:text-foreground/90',
        '[&_tbody>tr:nth-child(even)]:bg-muted/20'
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{ code: CodeBlock }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

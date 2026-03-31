import React from "react";

function renderInline(text: string, lineKey: number): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const regex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    nodes.push(
      <strong key={`b-${lineKey}-${match.index}`}>{match[1]}</strong>
    );
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

export function renderMessage(content: string) {
  const parts: React.ReactNode[] = [];
  const lines = content.split("\n");

  lines.forEach((line, lineIdx) => {
    if (lineIdx > 0) {
      parts.push(<br key={`br-${lineIdx}`} />);
    }

    const listMatch = line.match(/^(\s*)-\s+(.*)$/);
    if (listMatch) {
      parts.push(
        <span key={`li-${lineIdx}`} className="flex gap-1.5">
          <span className="shrink-0">&bull;</span>
          <span>{renderInline(listMatch[2], lineIdx)}</span>
        </span>
      );
      return;
    }

    parts.push(
      <span key={`line-${lineIdx}`}>{renderInline(line, lineIdx)}</span>
    );
  });

  return <>{parts}</>;
}

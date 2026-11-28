"use client";

import { Card, CardBody, Button } from "@heroui/react";
import { Copy } from "@/components/ui/icons";
import { useState } from "react";

export default function CodeSnippet({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // no-op
    }
  }

  return (
    <div className="my-3">
      <Card isBlurred className="border border-default-200 bg-surface-deep/40">
        <CardBody className="p-4 relative">
          <Button
            isIconOnly
            size="sm"
            radius="full"
            variant="light"
            onClick={copy}
            className="absolute top-2 right-2 z-10"
          >
            <Copy className={`size-4 ${copied ? 'text-green-500' : 'text-surface-light'}`} />
          </Button>
          <div className="text-surface-light text-sm overflow-auto pr-8">
            {label ? <div className="mb-2 font-medium text-surface-light">{label}</div> : null}
            <pre className="whitespace-pre-wrap break-words"><code>{code}</code></pre>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

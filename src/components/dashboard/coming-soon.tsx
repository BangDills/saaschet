import { Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";

export function ComingSoon({ title }: { title: string }) {
  return (
    <Card className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-muted">
        <Sparkles className="size-6" />
      </div>
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          This section is part of the Celiuz AI platform. The UI shell is ready —
          functionality will be wired up in the next steps.
        </p>
      </div>
    </Card>
  );
}

import { Card, CardContent } from "@/components/ui/card";
import { Construction } from "lucide-react";

export function StubPage({ title }: { title: string }) {
  return (
    <div className="p-6 max-w-[1600px]">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">Module</div>
      <h1 className="text-2xl font-semibold tracking-tight mt-1">{title}</h1>
      <p className="text-sm text-muted-foreground">Prototype scaffolding — module UI lands here next.</p>
      <Card className="mt-6 border-dashed">
        <CardContent className="py-16 flex flex-col items-center gap-3 text-center">
          <div className="h-12 w-12 rounded-full bg-secondary flex items-center justify-center">
            <Construction className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="text-sm font-medium">{title} workspace</div>
          <p className="text-xs text-muted-foreground max-w-sm">
            This surface will host the {title.toLowerCase()} module from the WFI spec — tables, filters, drill-downs, and exports.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
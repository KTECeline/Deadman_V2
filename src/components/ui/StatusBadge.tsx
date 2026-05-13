import { cn } from "@/lib/utils";

type Status = "active" | "warning" | "critical" | "executed";

interface StatusBadgeProps {
  status: Status;
  className?: string;
}

const statusConfig: Record<
  Status,
  { label: string; dotColor: string; textColor: string; glowColor: string }
> = {
  active: {
    label: "Active",
    dotColor: "bg-success",
    textColor: "text-success",
    glowColor: "shadow-success/50",
  },
  warning: {
    label: "Warning",
    dotColor: "bg-warning",
    textColor: "text-warning",
    glowColor: "shadow-warning/50",
  },
  critical: {
    label: "Triggered",
    dotColor: "bg-orange-400",
    textColor: "text-orange-400",
    glowColor: "shadow-orange-400/50",
  },
  executed: {
    label: "Executed",
    dotColor: "bg-muted",
    textColor: "text-muted",
    glowColor: "shadow-muted/50",
  },
};

export default function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1",
        "bg-white/[0.04] border border-white/[0.08]",
        "text-xs font-medium tracking-wide uppercase",
        config.textColor,
        className
      )}
    >
      <span
        className={cn(
          "h-2 w-2 rounded-full",
          config.dotColor,
          "shadow-[0_0_6px]",
          config.glowColor
        )}
      />
      {config.label}
    </span>
  );
}

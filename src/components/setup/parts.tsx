import { ExternalLink as ExternalLinkIcon, Info } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// Small building blocks of the setup and settings forms.

export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-medium text-brand underline-offset-4 hover:underline"
    >
      {children}
      <ExternalLinkIcon className="h-3 w-3" aria-hidden="true" />
    </a>
  );
}

/** Numbered how-to list. */
export function Instructions({ children }: { children: ReactNode }) {
  return (
    <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground marker:font-semibold marker:text-foreground">
      {children}
    </ol>
  );
}

export function Note({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "flex gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground",
        className,
      )}
    >
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

export function Field({
  id,
  label,
  hint,
  ...props
}: { id: string; label: string; hint?: ReactNode } & ComponentProps<typeof Input>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} {...props} />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Secret inputs: never autofilled or spell-checked, and not echoed back by the server. */
export function SecretField(
  props: { id: string; label: string; hint?: ReactNode } & ComponentProps<typeof Input>,
) {
  return (
    <Field type="password" autoComplete="off" spellCheck={false} autoCapitalize="off" {...props} />
  );
}

/** Input validation errors reach the client as the JSON list of zod issues: show the first. */
function readableMessage(message: string): string {
  if (!message.startsWith("[")) return message;
  try {
    const [issue] = JSON.parse(message) as { message?: unknown }[];
    return typeof issue?.message === "string" ? issue.message : message;
  } catch {
    return message;
  }
}

export function FormError({ error }: { error: Error | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {readableMessage(error.message)}
    </p>
  );
}

import { cn } from "@/lib/utils";

/** Trackash mark ("ring pulse"): an allocation ring with a rising line inside, on an emerald tile. */
export function TrackashMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("h-8 w-8 shrink-0", className)} aria-hidden="true">
      <rect width="64" height="64" rx="15" fill="#047857" />
      <g transform="rotate(-90 32 32)" fill="none" stroke="#fff" strokeWidth="6">
        <circle cx="32" cy="32" r="18" pathLength={100} strokeDasharray="52 48" />
        <circle
          cx="32"
          cy="32"
          r="18"
          pathLength={100}
          strokeDasharray="25 75"
          strokeDashoffset={-55}
          strokeOpacity={0.6}
        />
        <circle
          cx="32"
          cy="32"
          r="18"
          pathLength={100}
          strokeDasharray="14 86"
          strokeDashoffset={-83}
          strokeOpacity={0.3}
        />
      </g>
      <path
        d="M23 37L28.5 31.5L33 35L41 27"
        fill="none"
        stroke="#6ee7b7"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TrackashLogo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <TrackashMark className="h-7 w-7" />
      <span className="text-lg font-bold tracking-tight">
        Track<span className="text-brand">ash</span>
      </span>
    </span>
  );
}

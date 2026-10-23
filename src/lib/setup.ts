// The first-run setup: its steps, in order, and which one the owner is on.

export const SETUP_STEPS = [
  "welcome",
  "meu-pluggy",
  "credentials",
  "connections",
  "b3",
  "sync",
] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];

export type SetupProgress = {
  /** Pluggy client id + secret saved (and tested). */
  credentials: boolean;
  /** Meu Pluggy items added. */
  connections: number;
};

/** A step can be opened once everything it depends on is done. */
export function stepReachable(step: SetupStep, progress: SetupProgress): boolean {
  switch (step) {
    case "welcome":
    case "meu-pluggy":
    case "credentials":
      return true;
    case "connections":
      return progress.credentials;
    case "b3":
    case "sync":
      return progress.credentials && progress.connections > 0;
  }
}

/** Where a returning owner resumes: the first required step still missing. */
export function resumeStep(progress: SetupProgress): SetupStep {
  if (!progress.credentials) return "welcome";
  if (progress.connections === 0) return "connections";
  return "b3";
}

/** Meu Pluggy item ids are UUIDs; copying them from the dashboard often brings spaces along. */
export function normalizeItemId(input: string): string {
  return input.trim().toLowerCase();
}

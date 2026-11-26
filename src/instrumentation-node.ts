import { EnvError, parseEnv, productionProblems } from "@/lib/env-check";

if (process.env.NEXT_PHASE !== "phase-production-build") {
  try {
    const env = parseEnv(process.env);
    const problems = productionProblems(env);
    if (problems.length) throw new EnvError(problems);
  } catch (e) {
    console.error(`\n${e instanceof Error ? e.message : String(e)}\n\nHiggsArena will not start until this is fixed. See README → Troubleshooting.\n`);
    process.exit(1);
  }
}

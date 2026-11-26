import "server-only";
import { EnvError, parseEnv, productionProblems, type Env } from "./env-check";

export { DEMO_VALUES, EnvError, parseEnv, productionProblems, type Env } from "./env-check";

let cached: Env | undefined;

export function getEnv(): Env {
  if (cached) return cached;
  const env = parseEnv(process.env);
  const problems = productionProblems(env);
  if (problems.length) throw new EnvError(problems);
  cached = env;
  return env;
}

export const isProduction = () => process.env.NODE_ENV === "production";

export function appUrl(path = ""): string {
  return new URL(path, getEnv().APP_URL).toString();
}

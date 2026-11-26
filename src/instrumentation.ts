/**
 * Runs once when the server starts. In production the app refuses to start
 * when a secret is missing, still a demo value, or APP_URL is not https.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}

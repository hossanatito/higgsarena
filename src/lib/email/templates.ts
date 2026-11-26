/**
 * Email templates: one shared HTML layout and a plain-text version.
 * No tracking pixels, no remote images.
 */

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export type Email = { subject: string; html: string; text: string };

type Block = { heading: string; paragraphs: string[]; action?: { label: string; url: string }; footnote?: string };

function render({ heading, paragraphs, action, footnote }: Block, subject: string): Email {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;background:#0b0b0d;font-family:Figtree,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e7e7ea">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0b0d;padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#141417;border:1px solid #26262b;border-radius:16px">
<tr><td style="padding:28px 28px 8px">
<div style="font-size:15px;font-weight:700;letter-spacing:-0.01em;color:#fafafa"><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:#c6f432;margin-right:8px;vertical-align:middle"></span>HiggsArena</div>
</td></tr>
<tr><td style="padding:12px 28px 4px"><h1 style="margin:0;font-size:22px;line-height:1.3;color:#fafafa;font-weight:700">${esc(heading)}</h1></td></tr>
<tr><td style="padding:8px 28px 4px;font-size:15px;line-height:1.6;color:#c9c9cf">
${paragraphs.map((p) => `<p style="margin:0 0 12px">${esc(p)}</p>`).join("\n")}
</td></tr>
${
  action
    ? `<tr><td style="padding:8px 28px 20px"><a href="${esc(action.url)}" style="display:inline-block;background:#c6f432;color:#0b0b0d;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:999px">${esc(action.label)}</a>
<p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:#8b8b93;word-break:break-all">Or paste this link into your browser:<br>${esc(action.url)}</p></td></tr>`
    : ""
}
<tr><td style="padding:12px 28px 26px;font-size:12px;line-height:1.5;color:#77777f;border-top:1px solid #26262b">${esc(footnote ?? "You received this email because of activity on your HiggsArena studio.")}<br>HiggsArena is an independent open-source project and is not affiliated with Higgsfield.</td></tr>
</table></td></tr></table></body></html>`;
  const text = [
    "HiggsArena",
    "",
    heading,
    "",
    ...paragraphs.flatMap((p) => [p, ""]),
    ...(action ? [`${action.label}: ${action.url}`, ""] : []),
    footnote ?? "You received this email because of activity on your HiggsArena studio.",
    "HiggsArena is an independent open-source project and is not affiliated with Higgsfield.",
  ].join("\n");
  return { subject, html, text };
}

export const templates = {
  verify: (url: string) =>
    render(
      { heading: "Verify your email", paragraphs: ["Confirm this address to finish setting up your HiggsArena account."], action: { label: "Verify email", url }, footnote: "If you did not create an account, you can ignore this email." },
      "Verify your email",
    ),
  resetPassword: (url: string) =>
    render(
      { heading: "Reset your password", paragraphs: ["Someone asked to reset the password for this account. The link works for one hour."], action: { label: "Choose a new password", url }, footnote: "If this wasn't you, ignore this email. Your password stays the same." },
      "Reset your HiggsArena password",
    ),
  invite: (args: { url: string; inviter: string; org: string; role: string }) =>
    render(
      {
        heading: `You've been invited to ${args.org}`,
        paragraphs: [`${args.inviter} invited you to join ${args.org} on HiggsArena as ${args.role === "admin" ? "an admin" : "a member"}.`, "The invitation works once and expires in 7 days. Sign in with this email address to accept it."],
        action: { label: "Accept invitation", url: args.url },
      },
      `You've been invited to ${args.org}`,
    ),
  budget: (args: { scope: string; percent: number; spent: string; limit: string; url: string }) =>
    render(
      {
        heading: `${args.scope} reached ${args.percent}% of its monthly budget`,
        paragraphs: [
          `Spend this month is ${args.spent} of ${args.limit}.`,
          args.percent >= 100 ? "New generations that would go over the budget are now blocked. Members can request an override, and admins can raise the limit." : "Generation continues until the budget is used up.",
        ],
        action: { label: "Open analytics", url: args.url },
      },
      `Budget alert: ${args.scope} at ${args.percent}%`,
    ),
  overrideRequested: (args: { member: string; model: string; amount: string; rule: string; note?: string | null; url: string }) =>
    render(
      {
        heading: "Budget override requested",
        paragraphs: [`${args.member} asked to run one ${args.model} job estimated at ${args.amount}.`, `Blocked by: ${args.rule}`, ...(args.note ? [`Their note: “${args.note}”`] : []), "Requests expire after 24 hours."],
        action: { label: "Review request", url: args.url },
      },
      `Override request from ${args.member}`,
    ),
  overrideDecided: (args: { approved: boolean; model: string; amount: string; note?: string | null; url: string }) =>
    render(
      {
        heading: args.approved ? "Your override was approved" : "Your override was declined",
        paragraphs: [
          args.approved ? `Your ${args.model} job (${args.amount}) has been submitted.` : `Your ${args.model} job (${args.amount}) was not approved.`,
          ...(args.note ? [`Admin note: “${args.note}”`] : []),
        ],
        action: { label: "Open studio", url: args.url },
      },
      args.approved ? "Override approved" : "Override declined",
    ),
  keyProblem: (args: { problem: string; url: string }) =>
    render(
      { heading: "There's a problem with the Higgsfield key", paragraphs: [args.problem, "Generations will fail until this is fixed."], action: { label: "Open API keys", url: args.url } },
      "Higgsfield key problem",
    ),
  modelFailing: (args: { model: string; rate: string; url: string }) =>
    render(
      { heading: `${args.model} is failing often`, paragraphs: [`${args.rate} of jobs failed in the last 24 hours. You may want to switch members to a different model.`], action: { label: "Open models", url: args.url } },
      `Model alert: ${args.model}`,
    ),
  generationFinished: (args: { model: string; status: string; url: string }) =>
    render(
      { heading: args.status === "completed" ? "Your generation is ready" : `Your generation ended: ${args.status}`, paragraphs: [`${args.model} finished.`], action: { label: "Open library", url: args.url } },
      args.status === "completed" ? `Ready: ${args.model}` : `${args.model}: ${args.status}`,
    ),
  test: () => render({ heading: "Test email", paragraphs: ["Email delivery from HiggsArena is working."] }, "HiggsArena test email"),
};

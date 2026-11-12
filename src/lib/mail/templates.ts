import { product } from "@/config/product";
import { brand } from "@/lib/brand";

// Plain, accessible HTML email templates (no external CSS, no images). Each returns {subject, text, html}.
// Kept dependency free instead of react-email to stay small; the shape matches react-email's render output.
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function layout(title: string, bodyHtml: string, footer = `${product.fullName} · ${product.company}`) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title></head>
<body style="margin:0;padding:24px;background:${brand.concrete};font-family:'IBM Plex Sans','Segoe UI',ui-sans-serif,system-ui,sans-serif;color:${brand.ink}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:${brand.panel};border:2px solid ${brand.ink};border-radius:4px">
<tr><td style="height:8px;background:${brand.teal};font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="padding:32px">
<p style="margin:0 0 24px;font-size:14px;font-weight:700;letter-spacing:2px;text-transform:uppercase">${esc(product.name)}</p>
${bodyHtml}
</td></tr></table>
<p style="max-width:520px;margin:16px auto 0;font-size:12px;color:${brand.inkSubtle}">${esc(footer)}</p>
</body></html>`;
}

const button = (href: string, label: string) =>
  `<p style="margin:24px 0"><a href="${esc(href)}" style="display:inline-block;padding:12px 16px;background:${brand.teal};color:#ffffff;border-radius:3px;text-decoration:none;font-weight:600">${esc(label)}</a></p>`;

export function magicLinkEmail(url: string) {
  const subject = `Sign in to ${product.name}`;
  const text = `Use this link to sign in to ${product.name}. It works once and expires in 10 minutes.\n\n${url}\n\nIf you did not ask for this, you can ignore this email.`;
  const html = layout(subject, `<h1 style="margin:0 0 8px;font-size:20px">Sign in to ${esc(product.name)}</h1>
<p style="margin:0;font-size:14px;line-height:20px;color:${brand.inkSubtle}">This link works once and expires in 10 minutes.</p>
${button(url, "Sign in")}
<p style="margin:0;font-size:12px;line-height:16px;color:${brand.inkSubtle};word-break:break-all">Or paste this address into your browser: ${esc(url)}</p>
<p style="margin:16px 0 0;font-size:12px;color:${brand.inkSubtle}">If you did not ask for this, you can ignore this email.</p>`);
  return { subject, text, html };
}

export function otpEmail(code: string) {
  const subject = `${code} is your ${product.name} code`;
  const text = `Your ${product.name} sign-in code is ${code}. It expires in 10 minutes.`;
  const html = layout(subject, `<h1 style="margin:0 0 8px;font-size:20px">Your sign-in code</h1>
<p style="margin:16px 0;font-size:30px;letter-spacing:4px;font-family:'IBM Plex Mono',ui-monospace,monospace;font-weight:600">${esc(code)}</p>
<p style="margin:0;font-size:14px;color:${brand.inkSubtle}">It expires in 10 minutes.</p>`);
  return { subject, text, html };
}

export function inviteEmail(opts: { orgName: string; inviter: string; url: string; role: string }) {
  const subject = `${opts.inviter} invited you to ${opts.orgName} on ${product.name}`;
  const text = `${opts.inviter} invited you to join ${opts.orgName} on ${product.name} as ${opts.role}.\n\nAccept: ${opts.url}`;
  const html = layout(subject, `<h1 style="margin:0 0 8px;font-size:20px">Join ${esc(opts.orgName)}</h1>
<p style="margin:0;font-size:14px;line-height:20px;color:${brand.inkSubtle}">${esc(opts.inviter)} invited you as ${esc(opts.role)}.</p>
${button(opts.url, "Accept invitation")}`);
  return { subject, text, html };
}

export function noticeEmail(opts: { title: string; body: string; actionUrl?: string; actionLabel?: string }) {
  const text = `${opts.title}\n\n${opts.body}${opts.actionUrl ? `\n\n${opts.actionUrl}` : ""}`;
  const html = layout(opts.title, `<h1 style="margin:0 0 8px;font-size:20px">${esc(opts.title)}</h1>
<p style="margin:0;font-size:14px;line-height:20px;color:${brand.inkSubtle}">${esc(opts.body)}</p>
${opts.actionUrl ? button(opts.actionUrl, opts.actionLabel ?? "Open") : ""}`);
  return { subject: opts.title, text, html };
}

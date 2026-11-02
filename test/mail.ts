// The e-mails the local Supabase stack "sent", read from its mail catcher (Mailpit, the
// [local_smtp] port in supabase/config.toml). Real mail, real codes: nothing here is faked.
const MAILPIT = 'http://127.0.0.1:54324/api/v1';

type Summary = { ID: string };

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${MAILPIT}${path}`);
  if (!res.ok) throw new Error(`mail catcher answered ${res.status} for ${path}`);
  return (await res.json()) as T;
}

/** Every e-mail sent to this address so far, newest first. */
async function mailTo(email: string): Promise<Summary[]> {
  const found = await get<{ messages: Summary[] }>(`/search?query=${encodeURIComponent(`to:"${email}"`)}`);
  return found.messages;
}

export async function mailCount(email: string) {
  return (await mailTo(email)).length;
}

/**
 * The 6-digit code in the newest e-mail to this address, waiting until more than `seen` e-mails
 * have arrived (GoTrue sends them asynchronously over SMTP).
 */
export async function waitForCode(email: string, seen = 0, timeoutMs = 10_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const messages = await mailTo(email);
    if (messages.length > seen) {
      const { Text, HTML } = await get<{ Text: string; HTML: string }>(`/message/${messages[0].ID}`);
      const code = /\b(\d{6})\b/.exec(Text || HTML)?.[1];
      if (!code) throw new Error(`the newest e-mail to ${email} has no 6-digit code:\n${Text || HTML}`);
      return code;
    }
    if (Date.now() > deadline) throw new Error(`no e-mail reached ${email} within ${timeoutMs} ms`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

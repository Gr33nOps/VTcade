# Email templates

Supabase sends the confirmation and password-reset emails, and its stock
templates are unstyled black-on-white with a "powered by Supabase" footer, which
looks like it belongs to a different product than the rest of the site. These are
replacements in the site's own idiom: black, green, monospace, a `>>>` status
line and a `READY: _` prompt.

They live here rather than in the app because Supabase stores them itself. The
app never renders them, so nothing in `FrontEnd/` or `BackEnd/` reads these
files.

## Installing them

Dashboard → **Authentication → Emails**, pick the template, paste the file in,
and set the subject:

| Template | File | Subject |
|---|---|---|
| Confirm signup | `confirm-signup.html` | `VTCADE // CONFIRM YOUR ACCOUNT` |
| Reset password | `reset-password.html` | `VTCADE // PASSWORD RESET` |

The other templates (magic link, invite, change email, reauthentication) are left
alone because this app never triggers them.

Same thing over the Management API, if you would rather not click:

```bash
export SUPABASE_ACCESS_TOKEN="..."          # supabase.com/dashboard/account/tokens
export PROJECT_REF="tjvtjffmeznkuxextxmw"

curl -X PATCH "https://api.supabase.com/v1/projects/$PROJECT_REF/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(node -e '
    const fs = require("fs");
    console.log(JSON.stringify({
      mailer_subjects_confirmation: "VTCADE // CONFIRM YOUR ACCOUNT",
      mailer_templates_confirmation_content: fs.readFileSync("email-templates/confirm-signup.html", "utf8"),
      mailer_subjects_recovery: "VTCADE // PASSWORD RESET",
      mailer_templates_recovery_content: fs.readFileSync("email-templates/reset-password.html", "utf8")
    }));
  ')"
```

Read the current values back with `GET` on the same URL before writing, so you
can see the field names this project's API version actually uses and put the old
content somewhere if you want to go back.

## What a template cannot change

Two parts of that email are not the template's to style, and both are visible in
the stock version:

* **The sender.** `Supabase Auth <noreply@mail.app.supabase.io>` is the built-in
  email service. The template cannot change it.
* **The footer.** "You're receiving this email because you signed up for an
  application powered by Supabase" and its opt-out link are appended below the
  body by that same service, underneath whatever the template renders.

Both go away only by configuring custom SMTP (Authentication → Emails → SMTP
Settings) with a provider such as Resend, Brevo or Postmark, at which point the
From name and address are yours and nothing is appended.

There is a second reason to do it: the built-in service is rate limited to a
handful of emails an hour and is explicitly not meant for production traffic. A
signup burst will silently stop sending confirmations without custom SMTP.

## Why they are written the way they are

Email clients are not browsers, so the site's CSS could not simply be reused.

* **Every style is inline, on a table layout.** Gmail strips much of what is in
  a `<style>` block, and Outlook ignores large parts of CSS layout. `bgcolor`
  attributes sit alongside the `background` styles for the same reason.
* **The `====` rules are borders, not characters.** A row of 60 fixed-width
  characters cannot wrap, so on a narrow phone it forces the whole email
  sideways. A 2px green border reads the same and cannot overflow.
* **The button is a table cell with `bgcolor`**, not a styled `<a>`, because
  Outlook drops padding on links. Green block, black text: the same treatment
  the site gives the row your cursor is on.
* **No scanlines, no flicker, no web font.** Animation and overlays do not
  survive an email client, and `Courier New` is already the site's typeface and
  is present everywhere.
* **The link is repeated as plain text**, since some clients refuse to render the
  button at all.

`{{ .ConfirmationURL }}` and `{{ .Email }}` are Supabase's own template
variables. `{{ .Data.username }}` is also available (the app sets it at signup),
but it is deliberately not used: a missing key renders as `<no value>`, and a
broken greeting in every confirmation email is worse than no greeting.

## Where the confirmation link goes

`BackEnd/routes/authRoutes.js` sends `emailRedirectTo` to
`FRONTEND_URL/login/login.html`, and Supabase appends the new session to that URL
as a fragment. `login.html` adopts it, so following the link confirms the address
*and* signs the player in, landing them on the dashboard. Changing the redirect to
a new path would need that path added to the dashboard's redirect allow-list
first, or Supabase silently falls back to the Site URL.

# Signup confirmation emails

Keep **Confirm email** enabled. Applicator uses Supabase email/password signup; Supabase sends confirmation emails through your SMTP provider. Invitation links created in Owner controls are shared manually and do not send email. Application reminder emails remain excluded.

## Free Brevo setup

Brevo currently offers 300 emails per day on its Free plan. Create a free account, complete its required activation, and verify a sender address you control. If you own a domain, authenticate it with Brevo. For unverified domains or free email addresses, Brevo may replace the sending address with an address under its own sending domain; do not invent a no-reply address on a domain you cannot verify.

In Brevo's **SMTP & API** settings, copy the **SMTP login** and create an **SMTP key**. This is different from a Brevo API key. Keep it out of chat and source files.

In Supabase, open **Authentication → SMTP Settings**, enable custom SMTP, and enter:

| Setting | Value |
| --- | --- |
| Sender email | Your verified Brevo sender address |
| Sender name | Applicator |
| Host | smtp-relay.brevo.com |
| Port | 587 |
| Username | SMTP login displayed in Brevo |
| Password | Brevo SMTP key |

Save the settings. Under **Authentication → Sign In / Providers → Email**, keep email signup and Confirm email enabled. Under **URL Configuration**, set the Site URL and allowed redirects to the app origin: `http://127.0.0.1:8787` locally, and the final HTTPS origin when deployed. A confirmation opened on another device needs an app URL that device can reach; localhost points to that device itself.

## Check delivery

Use Create account with an email address you control. Open the confirmation email, then sign in. If a previous signup already created an unconfirmed user, use Supabase's confirmation resend action for that existing user rather than assuming a second signup will create another account.

If no email arrives, check spam, Supabase Auth logs, Brevo transactional logs, sender verification, account activation, SMTP login/key, and both services' rate limits. SMTP setup belongs in Supabase; changing Applicator's `.env` does not configure Supabase email delivery. Do not give friends access to your Supabase project team as a workaround for its default sender restrictions.

Sources checked October 14, 2026:

- [Supabase custom SMTP and default-sender restrictions](https://supabase.com/docs/guides/auth/auth-smtp)
- [Brevo Free plan limits](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan)
- [Brevo SMTP connection settings](https://help.brevo.com/hc/en-us/articles/7924908994450-Send-transactional-emails-using-Brevo-SMTP)
- [Brevo sender-domain replacement](https://help.brevo.com/hc/en-us/articles/16045394674066-Troubleshooting-Domain-authentication)

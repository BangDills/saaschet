# Privacy Policy — Celiuz AI

**Last updated: July 31, 2026**

*This Privacy Policy is provided in English. A Bahasa Indonesia version can be made available on request; in case of conflict, the English version governs.*

Celiuz AI ("Celiuz", "we", "us") is an AI coding-agent platform operated by an individual developer based in the Republic of Indonesia, available at **app.celiuz.my.id**. This policy explains what personal data we collect, why, who we share it with, and the rights you have. We handle personal data in accordance with Indonesian Law No. 27 of 2022 on Personal Data Protection (the "PDP Law") and other applicable laws.

## 1. Data We Collect

- **Account data.** Email address and authentication credentials (passwords are hashed and managed by Supabase Auth; we never see them). If you sign in with GitHub OAuth, we receive your GitHub user ID, username, email, and public profile.
- **GitHub integration data.** When you install our GitHub App, we receive the installation ID and the repositories you select. Only for repositories you explicitly connect: repository contents, branches, commits, and pull-request metadata needed to perform the agent actions you request.
- **Conversations.** Your prompts, messages, and the agent's responses, stored in our Postgres database.
- **Code and indexing data.** Code from connected repositories may be chunked and converted into vector embeddings (stored with pgvector) to provide semantic codebase search and context for the agent.
- **Memory data.** Vector embeddings (generated via Jina AI) and a structured profile memory (generated via Fireworks AI) that records preferences, habits, and project context so the agent can remember you across chats.
- **Usage and billing data.** Credit balance and spend events (recorded through our atomic `spend_credits` ledger), your tier (Free/Pro), trial requests (including the WhatsApp number you contact us from), and administrative actions.
- **Technical data.** IP address, browser/device information, and server logs used for security and debugging.

## 2. How We Use Your Data

- To operate the Service: chat, agent actions on your repositories, sandbox execution, codebase indexing.
- To personalize the agent across sessions (memory features).
- To manage credits, billing, trials, and the admin dashboard (user management and aggregate credit charts).
- For security, abuse prevention, debugging, and improving the Service.

We **do not sell** your personal data and we **do not use your private code to train our own models**. Code and conversation context are sent to third-party processors only to produce the outputs you request.

## 3. Third-Party Processors

To provide the Service, data is transmitted to:

- **Supabase** — authentication and Postgres database hosting
- **Fireworks AI** — LLM inference (GLM, Kimi, DeepSeek, Qwen, MiniMax models) and structured profile memory
- **Jina AI** — vector embeddings
- **Daytona** — isolated sandbox environments for running code
- **GitHub** — OAuth sign-in and GitHub App repository access
- **Tavily** — web search; **Context7** — library documentation lookup
- **Hosting provider** — the Service is deployed with Coolify on our rented server infrastructure

Prompts, code context, and relevant memory snippets are sent to these processors as needed to fulfill your requests. Each processor handles data under its own privacy policy. Data may be processed outside Indonesia (including the United States and the EU); where the PDP Law requires it, we rely on appropriate contractual safeguards for cross-border transfers.

## 4. Data Retention

Account, conversation, and memory data are retained while your account is active. Repository embeddings are deleted when you disconnect a repository or uninstall the GitHub App (within 30 days). Server logs are kept for up to 90 days. When you delete your account, we delete or irreversibly anonymize your personal data within 30 days, except where the law requires longer retention; encrypted backups cycle out within a further 30 days.

## 5. Your Rights

Under the PDP Law you may request **access, correction, deletion, and portability** of your personal data, and may **withdraw consent** at any time. In practice:

- **Disconnect GitHub:** uninstall the Celiuz GitHub App from your GitHub settings. This immediately revokes our access — we hold no long-lived GitHub tokens, only short-lived installation tokens that expire. Previously created embeddings are then deleted as described above.
- **Delete conversations or memory:** use the controls in the app, or email us.
- **Export your data:** email us for a machine-readable export of your profile and conversations.
- **Delete your account:** email us; we will process it within 30 days.

## 6. Security

We enforce Postgres **Row Level Security** on all user tables, so each user's data is isolated at the database level. GitHub access uses short-lived GitHub App installation tokens, **scoped per-repository** — we store no long-lived GitHub credentials. Code execution happens in isolated Daytona sandboxes. Traffic is encrypted in transit (TLS) and data is encrypted at rest by our infrastructure providers. No system is perfectly secure, but we apply least-privilege access throughout.

## 7. Cookies

We use only strictly necessary cookies/local storage for authentication sessions (Supabase Auth) and interface preferences. We use no advertising or third-party tracking cookies.

## 8. Children

The Service is not directed at anyone under 16. We do not knowingly collect data from children; contact us if you believe a child has provided personal data.

## 9. Changes

We may update this policy and will post the new version with a revised date; material changes will be announced in the app or by email. Continued use after changes take effect constitutes acceptance.

## 10. Contact

Operator: individual developer, Indonesia.
Email: **support@celiuz.my.id** · WhatsApp: the number shown at app.celiuz.my.id.
You also have the right to lodge a complaint with the competent data-protection authority under the PDP Law.

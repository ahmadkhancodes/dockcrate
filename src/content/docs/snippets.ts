/**
 * Copy-paste snippets shared by the docs and the app, so the curl a customer copies after creating a key is the same
 * command the docs show (tests/e2e/docs-work.spec.ts runs both against the running app).
 */
export const apiKeySnippet = (baseUrl: string, key = "YOUR_API_KEY") => `curl ${baseUrl.replace(/\/$/, "")}/api/v1/me \\\n  -H "x-api-key: ${key}"`;

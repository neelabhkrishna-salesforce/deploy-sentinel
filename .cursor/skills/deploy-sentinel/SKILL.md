---
name: deploy-sentinel
description: Use this skill after a Copado promotion or deployment lands in a Salesforce org, or when the user asks to smoke test, verify, or check the health of a release. It selects the smoke tests the change needs, runs them in Copado Robotic Testing through Agentia, and turns failures into a release verdict, an evidence report and one Jira-ready bug per root cause.
---

# Deploy Sentinel

Use this skill to verify a Salesforce org right after a Copado promotion, using the Agentia CLI, Agentia MCP tools and the `agentia sentinel` plugin commands.

Prefer Agentia MCP tools (`agentia mcp start`) for Copado and CRT operations when they are available. Use the CLI commands below as the fallback, and always add `--json` when you parse the result.

## Start Here

1. Check the plugin is installed: `agentia plugins` must list `agentia-plugin-deploy-sentinel`. If not, run `agentia plugins link <path-to-deploy-sentinel>` after `npm run build`.
2. Check CRT is ready: `agentia auth get --crt --json` must report `ready: true`. `set: true` alone is not enough. If it is not ready, stop and tell the user what is `missing`.
3. Find `sentinel.config.json` in the repository root. It maps metadata to Robot Framework smoke tags and holds the CRT project and job Ids. If it is missing, copy the plugin's example and ask the user for the CRT Ids.
4. If the user only wants to see how it works, or there is no Copado or CRT access, run the simulation in the last section instead.

## Workflow

Run the steps in this order. Do not skip the plan; the report depends on `plan.json`.

1. **Identify the release.** Get the user story (and promotion if the user gave one):
   `agentia cicd work get <US-name> --json` and `agentia cicd promotion get <promotion-id> --json`.
2. **Plan the smoke run** from the repository root:
   `agentia sentinel plan --story <US-name> --out out/sentinel --json`
   The plugin reads the work item through the Agentia host, diffs the story branch against its base branch, and returns `tags` and the exact `crtCommand`. Show the user the selected areas and why each one was chosen.
3. **Run the selected smoke tests** with the `crtCommand` from the plan, unchanged. It has this shape:
   `agentia testing test run <job-id> --project <project-id> --include <tag>... --record failed --wait-for-result --no-exit-code --xunit out/sentinel/xunit_report.xml --save-artifacts out/sentinel/artifacts.zip --json`
   Do not add `--stream-logs` or `--watch`; they do not work with `--json`. If the run times out, poll with `agentia testing build get <build-id> --project <project-id> --job <job-id> --json`.
4. **Unpack the evidence:** `unzip -o out/sentinel/artifacts.zip -d out/sentinel/artifacts`.
5. **Report:**
   `agentia sentinel report --out out/sentinel --environment <target-env> --promotion <promotion> --build <build-id> --json`
6. **Act on the verdict.**
   - GREEN: tell the user the release is healthy and link `out/sentinel/report.html`.
   - RED: summarise each bug in one sentence: what broke, for whom, and the top likely cause. Before filing, offer to rerun only the failed tests with `agentia testing test run <job-id> --project <project-id> --rerun-failed <build-id> --wait-for-result --json`. A `Timeout` category is often a flaky test.
7. **File bugs only with approval.** After the user agrees, rerun the report with `--post-jira`. It needs `JIRA_BASE_URL`, `JIRA_EMAIL` and `JIRA_API_TOKEN` in the environment; never ask the user to paste the token into chat.

## Pipeline gate

In CI, run the report with `--gate`. It exits with code 1 on a RED verdict so the pipeline step fails and the next promotion is blocked.

## Simulation

Without Copado or CRT access, run the same two plugin commands on bundled sample data:

```bash
agentia sentinel plan --simulate --out out/demo
agentia sentinel report --simulate --out out/demo
```

Always tell the user the output is simulated. Never present simulated results as a test of a real org.

## Report Back

Report the user story, target environment, selected smoke tags, CRT build Id, verdict, pass and fail counts, each bug with its top likely cause, and the paths to `report.html`, `summary.md` and the `bugs/` folder. Do not include PAKs, API keys or tokens.

# Deploy Sentinel

**Post-deployment smoke testing, evidence capture and bug filing for Copado promotions, built on the Agentia CLI.**

A green Copado deployment only proves the metadata was accepted. It does not prove that sales reps can still close an Opportunity. Deploy Sentinel closes that gap: right after a promotion lands, it works out which business flows the change put at risk, runs only those smoke tests in Copado Robotic Testing (CRT), and turns every failure into a release verdict and a Jira-ready bug with evidence and the most likely cause.

Built for the Agentia Headless Virtual Hackathon 2026 by Neelabh Krishna, Senior Quality Assurance Consultant, Salesforce.

## How it works

```text
Copado promotion lands
        |
        v
agentia sentinel plan      user story (Agentia host) + git diff  ->  changed components  ->  smoke areas and Robot tags
        |
        v
agentia testing test run   CRT runs only the selected tags, saves xUnit and artifacts      (built-in Agentia command / MCP tool)
        |
        v
agentia sentinel report    xUnit + screenshots + logs  ->  verdict, root-cause groups, likely cause, report, Jira bugs
        |
        v
GREEN: release is healthy        RED: --gate blocks the pipeline, bugs go to Jira after approval
```

It uses all three Agentia extension points:

| Extension point | What Deploy Sentinel adds |
| --- | --- |
| **Commands** (plugin) | `agentia sentinel plan` and `agentia sentinel report`, built with `@copado/agentia-plugin-sdk`. They read the work item and credential readiness through the Agentia host API and print tables with the CLI's own formatter. |
| **Skills** | `.cursor/skills/deploy-sentinel/SKILL.md` teaches a coding agent the full order: check CRT readiness, plan, run the CRT command, unpack evidence, report, offer a rerun of failed tests, and file bugs only after approval. |
| **MCP** | The agent drives Copado CI/CD and CRT through the built-in `agentia mcp start` tools. Plugins cannot register MCP tools today, so the skill bridges the plugin commands and the MCP tools. |

## What it does

- **Change-aware test selection.** Maps source-format paths to Salesforce metadata types (CustomField, ValidationRule, Flow, ApexClass, FlexiPage, LWC, PermissionSet and more), then to business smoke areas defined in `sentinel.config.json`. A critical-path tag always runs.
- **Exact CRT command.** Emits the `agentia testing test run ... --include <tag>` command with `--xunit` and `--save-artifacts`, so results are reproducible and scriptable.
- **Root-cause grouping.** Parses the Robot Framework xUnit report, classifies each failure (validation rule, flow, Apex, access, UI element, timeout) and groups failures with the same cause on different records into one bug.
- **Likely cause.** Ranks the changed components that match the failure type and business area, for example the validation rule before the field it reads.
- **Evidence.** Matches screenshots to failed tests, copies them next to a self-contained `report.html`, and writes a Slack-ready `summary.md`.
- **Jira.** Writes one REST v2 issue payload per root cause to `bugs/`. With `--post-jira` it creates the issues and attaches the evidence.
- **Pipeline gate.** `--gate` exits with code 1 on a RED verdict.

## Quick start

Requirements: Node.js 22.12 or newer and the Agentia CLI (`npm install -g @copado/agentia-cli@beta`).

```bash
git clone https://github.com/neelabhkrishna-salesforce/deploy-sentinel.git && cd deploy-sentinel
npm install
npm run build
npm test
agentia plugins link .
```

### Try it without a Copado org

The `--simulate` flag runs the real plugin code on bundled sample data: a user story that adds discount approval to Opportunity closing, nine changed files and a CRT run with four failures.

```bash
agentia sentinel plan --simulate --out out/demo
agentia sentinel report --simulate --out out/demo
open out/demo/report.html
```

Simulation output is labelled as simulated in the terminal, the report and the Jira drafts.

### Run it for real

1. Run `agentia setup` and confirm `agentia auth get --crt --json` reports `ready: true`.
2. Copy `sentinel.config.json` to your Salesforce repository root, then set `crt.projectId`, `crt.jobId`, your smoke areas and your Jira project.
3. Tag your CRT smoke tests with the Robot tags from the config (`smoke-critical`, `smoke-opportunity`, ...).
4. After a promotion:

```bash
agentia sentinel plan --story US-0001234 --out out/sentinel
# run the crtCommand printed by the plan
unzip -o out/sentinel/artifacts.zip -d out/sentinel/artifacts
agentia sentinel report --out out/sentinel --environment UAT --promotion P-00042 --gate
```

To create the bugs in Jira, set `JIRA_BASE_URL`, `JIRA_EMAIL` and `JIRA_API_TOKEN` and add `--post-jira`.

Or ask your coding agent: "Smoke test the UAT promotion for US-0001234." The Deploy Sentinel skill takes it from there.

## Commands

```text
agentia sentinel plan    [--story <id|name>] [--base <ref>] [--changed <file>] [--config <file>] [--out <dir>] [--simulate] [--json]
agentia sentinel report  [--out <dir>] [--xunit <file>] [--artifacts <dir>] [--environment <name>] [--promotion <id>] [--build <id>]
                         [--config <file>] [--post-jira] [--gate] [--simulate] [--json]
```

## Configuration

`sentinel.config.json` holds everything that is specific to an org:

- `alwaysRun`: the critical-path tag that runs on every deployment.
- `areas`: each business area's Robot tag, the metadata globs that put it at risk, and the test-name globs that attribute results to it.
- `crt`: the CRT project and smoke job Ids, and the recording mode.
- `jira`: project key, issue type and labels.

## Project layout

```text
src/commands/sentinel/   plan.ts, report.ts       Agentia plugin commands
src/lib/                 impact, xunit, triage, evidence, report, jira, config
.cursor/skills/          deploy-sentinel/SKILL.md  Agent skill
fixtures/simulated/      sample work item, changes, CRT xUnit and artifacts
test/                    unit tests (vitest)
demo/                    scripts that build the demo video and slide deck
```

## Limits and next steps

- The Agentia plugin host does not expose promotions or CRT runs yet, so the agent skill runs those steps with built-in commands. When the host adds them, the plugin can run the whole flow itself.
- Jira posting is unit tested against a mocked API, not yet against a live Jira site.
- Next: write the verdict back to the Copado promotion, use Copado AI to draft the plain-language bug summary, and learn area mappings from past failures.

## License

MIT

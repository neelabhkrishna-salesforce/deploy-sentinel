import fs from 'node:fs'
import path from 'node:path'

import {AgentiaCommand, getAgentiaHost} from '@copado/agentia-plugin-sdk'
import {Flags} from '@oclif/core'

import {DEFAULT_CONFIG_FILE, loadConfig} from '../../lib/config.js'
import {type Evidence, findEvidence} from '../../lib/evidence.js'
import {analyzeImpact, readChangedFiles} from '../../lib/impact.js'
import {buildBugDrafts, jiraFromEnv, postBugs, type RunContext} from '../../lib/jira.js'
import {type RunSummary, summarize, writeReports} from '../../lib/report.js'
import {BUNDLED_CONFIG, readJson, simulated, simulatedRun, simulatedWorkItem} from '../../lib/simulation.js'
import {type FailureGroup, groupFailures} from '../../lib/triage.js'
import {readXunit} from '../../lib/xunit.js'
import type {SentinelPlanResult} from './plan.js'

export type SentinelReportResult = {
  simulated: boolean
  summary: RunSummary
  bugs: Array<{key: string; priority: string; summary: string; category: string; likelyCauses: string[]; tests: string[]; jiraKey?: string}>
  files: {html: string; markdown: string; bugs: string}
}

export default class SentinelReport extends AgentiaCommand {
  static override description = 'Turn a Copado Robotic Testing smoke run into a release verdict, an evidence report, and one Jira-ready bug per root cause'
  static override examples = [
    '<%= config.bin %> <%= command.id %> --out out/sentinel',
    '<%= config.bin %> <%= command.id %> --out out/sentinel --environment UAT --promotion P-00042 --gate',
    '<%= config.bin %> <%= command.id %> --out out/sentinel --post-jira',
    '<%= config.bin %> <%= command.id %> --simulate',
  ]
  static override flags = {
    artifacts: Flags.string({description: 'Unzipped CRT artifacts folder. Defaults to <out>/artifacts.'}),
    build: Flags.string({description: 'CRT build Id, shown in the report and bugs.'}),
    config: Flags.string({description: `Sentinel config file. Defaults to ./${DEFAULT_CONFIG_FILE}.`}),
    environment: Flags.string({description: 'Target environment that was tested. Defaults to the plan story environment.'}),
    gate: Flags.boolean({default: false, description: 'Exit with code 1 when the verdict is RED, so a pipeline step can block the release.'}),
    out: Flags.string({default: 'out/sentinel', description: 'Folder that holds plan.json and receives the report.'}),
    'post-jira': Flags.boolean({default: false, description: 'Create the bugs in Jira using JIRA_BASE_URL, JIRA_EMAIL and JIRA_API_TOKEN.'}),
    promotion: Flags.string({description: 'Copado promotion Id or name, shown in the report and bugs.'}),
    simulate: Flags.boolean({default: false, description: 'Use the bundled simulated CRT run instead of real run output.'}),
    xunit: Flags.string({description: 'xUnit report from the CRT run. Defaults to <out>/xunit_report.xml.'}),
  }

  public async run(): Promise<SentinelReportResult> {
    const {flags} = await this.parse(SentinelReport)
    // Keep this list in sync with "agentia.requires" in package.json.
    const host = getAgentiaHost({requires: ['auth.status', 'format.table', 'work.getWorkItem']})
    const config = loadConfig(flags.config ?? (flags.simulate && !fs.existsSync(DEFAULT_CONFIG_FILE) ? BUNDLED_CONFIG : DEFAULT_CONFIG_FILE))
    const outDir = flags.out
    const planFile = path.join(outDir, 'plan.json')

    const plan: Pick<SentinelPlanResult, 'components' | 'selected' | 'story'> = fs.existsSync(planFile)
      ? readJson<SentinelPlanResult>(planFile)
      : flags.simulate
        ? {...analyzeImpact(readChangedFiles(simulated.changedFiles), config), story: simulatedWorkItem()}
        : this.error(`No plan found at ${planFile}. Run "agentia sentinel plan --out ${outDir}" first.`)

    const run = flags.simulate ? simulatedRun() : undefined
    const results = readXunit(flags.xunit ?? (flags.simulate ? simulated.xunit : path.join(outDir, 'xunit_report.xml')))
    const artifacts = flags.artifacts ?? (flags.simulate ? simulated.artifacts : path.join(outDir, 'artifacts'))
    const context: RunContext = {
      crtBuild: flags.build ?? run?.crtBuild,
      environment: flags.environment ?? run?.environment ?? plan.story.environment ?? 'target environment',
      promotion: flags.promotion ?? run?.promotion,
      simulated: flags.simulate,
      storyName: plan.story.name ?? plan.story.id,
      storyTitle: plan.story.title ?? '',
    }

    const summary = summarize(results)
    const groups = groupFailures(results, plan.components, config)
    const evidence = new Map<FailureGroup, Evidence>()
    for (const group of groups) {
      const found = group.tests.map((test) => findEvidence(artifacts, test))
      evidence.set(group, {
        logs: [...new Set(found.flatMap((item) => item.logs))],
        screenshots: [...new Set(found.flatMap((item) => item.screenshots))],
      })
    }

    const bugs = buildBugDrafts(groups, evidence, context, config)
    const files = writeReports({bugs, components: plan.components, context, evidence, groups, results, selected: plan.selected, summary}, outDir)

    let jiraKeys: string[] = []
    if (flags['post-jira'] && bugs.length > 0) {
      const jira = jiraFromEnv()
      if (!jira) this.error('Set JIRA_BASE_URL, JIRA_EMAIL and JIRA_API_TOKEN to post bugs, or drop --post-jira to keep drafts only.')
      jiraKeys = await this.withSpinner(`Creating ${bugs.length} Jira bug(s)`, () => postBugs(bugs, jira))
    }

    const result: SentinelReportResult = {
      bugs: bugs.map((bug, index) => ({
        category: groups[index].category.label,
        jiraKey: jiraKeys[index],
        key: bug.key,
        likelyCauses: groups[index].likelyCauses.map((cause) => `${cause.type} ${cause.name}`),
        priority: bug.priority,
        summary: bug.summary,
        tests: groups[index].tests.map((test) => test.name),
      })),
      files: {...files, bugs: path.join(outDir, 'bugs')},
      simulated: flags.simulate,
      summary,
    }

    this.display(() => {
      if (flags.simulate) this.log('SIMULATION: CRT results and evidence come from bundled sample data, not a real org.\n')
      this.log(`Release verdict: ${summary.verdict}   ${context.storyName} on ${context.environment}`)
      this.log(`${summary.passed}/${summary.total} smoke tests passed, ${summary.failed} failed, ${groups.length} root cause(s)\n`)
      if (bugs.length > 0) {
        this.log(
          host.format.table(
            [
              {field: 'key', header: 'Bug'},
              {field: 'priority', header: 'Priority'},
              {field: 'category', header: 'Category'},
              {align: 'right', field: 'tests', header: 'Tests'},
              {field: 'cause', header: 'Top likely cause', wrap: true},
            ],
            result.bugs.map((bug) => ({...bug, cause: bug.likelyCauses[0] ?? 'unknown', key: bug.jiraKey ?? bug.key, tests: bug.tests.length})),
          ),
        )
      }

      this.log(`\nReport        ${files.html}`)
      this.log(`Summary       ${files.markdown}`)
      this.log(`Jira drafts   ${result.files.bugs}${jiraKeys.length > 0 ? `  (created ${jiraKeys.join(', ')})` : ''}`)
    })

    if (flags.gate && summary.verdict === 'RED') process.exitCode = 1
    return result
  }
}

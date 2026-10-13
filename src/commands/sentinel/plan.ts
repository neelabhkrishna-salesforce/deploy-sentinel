import fs from 'node:fs'
import path from 'node:path'

import {AgentiaCommand, getAgentiaHost, type PluginWorkItem} from '@copado/agentia-plugin-sdk'
import {Flags} from '@oclif/core'

import {DEFAULT_CONFIG_FILE, loadConfig} from '../../lib/config.js'
import {analyzeImpact, crtRunCommand, gitChangedFiles, readChangedFiles} from '../../lib/impact.js'
import {BUNDLED_CONFIG, simulated, simulatedWorkItem} from '../../lib/simulation.js'

export type SentinelPlanResult = {
  simulated: boolean
  story: {id: string; name?: string; title?: string; status?: string; environment?: string; baseBranch?: string}
  readiness: {cicd: boolean; crt: boolean}
  components: ReturnType<typeof analyzeImpact>['components']
  selected: ReturnType<typeof analyzeImpact>['selected']
  tags: string[]
  crtCommand: string
  planFile: string
}

export default class SentinelPlan extends AgentiaCommand {
  static override description = 'Work out which post-deployment smoke tests a user story needs, and the exact Copado Robotic Testing command to run them'
  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --story US-0001234 --base main',
    '<%= config.bin %> <%= command.id %> --changed changed-files.txt --json',
    '<%= config.bin %> <%= command.id %> --simulate',
  ]
  static override flags = {
    base: Flags.string({description: 'Git ref to diff against. Defaults to the work item base branch, then main.'}),
    changed: Flags.string({description: 'File listing changed source paths, one per line. Used instead of git diff.'}),
    config: Flags.string({description: `Sentinel config file. Defaults to ./${DEFAULT_CONFIG_FILE}.`}),
    out: Flags.string({default: 'out/sentinel', description: 'Folder for plan.json and the CRT run output.'}),
    simulate: Flags.boolean({default: false, description: 'Use the bundled simulated user story and changes instead of Copado and Git.'}),
    story: Flags.string({description: 'Work item Id or name, for example US-0001234. Defaults to the active work item.'}),
  }

  public async run(): Promise<SentinelPlanResult> {
    const {flags} = await this.parse(SentinelPlan)
    // Keep this list in sync with "agentia.requires" in package.json.
    const host = getAgentiaHost({requires: ['auth.status', 'format.table', 'work.getWorkItem']})
    const config = loadConfig(flags.config ?? (flags.simulate && !fs.existsSync(DEFAULT_CONFIG_FILE) ? BUNDLED_CONFIG : DEFAULT_CONFIG_FILE))
    const auth = host.auth.status()

    const story: PluginWorkItem = flags.simulate
      ? simulatedWorkItem()
      : await this.withSpinner('Reading the user story from Copado', () => host.work.getWorkItem(flags.story))

    const changedPaths = flags.simulate
      ? readChangedFiles(simulated.changedFiles)
      : flags.changed
        ? readChangedFiles(flags.changed)
        : gitChangedFiles(flags.base ?? story.baseBranch ?? 'main')

    const impact = analyzeImpact(changedPaths, config)
    const outDir = flags.out
    const crtCommand = crtRunCommand(config, impact.tags, outDir)
    fs.mkdirSync(outDir, {recursive: true})
    const planFile = path.join(outDir, 'plan.json')

    const result: SentinelPlanResult = {
      components: impact.components,
      crtCommand,
      planFile,
      readiness: {cicd: auth.cicd.configured, crt: auth.crt.ready ?? false},
      selected: impact.selected,
      simulated: flags.simulate,
      story: {
        baseBranch: story.baseBranch,
        environment: story.sourceEnvironmentName,
        id: story.id,
        name: story.name,
        status: story.status,
        title: story.title,
      },
      tags: impact.tags,
    }
    fs.writeFileSync(planFile, JSON.stringify(result, null, 2) + '\n')

    this.display(() => {
      if (flags.simulate) this.log('SIMULATION: user story and changes come from bundled sample data, not Copado.\n')
      this.log(`User story  ${story.name ?? story.id}  ${story.title ?? ''}`)
      this.log(`Status      ${story.status ?? '-'}    Base branch ${story.baseBranch ?? '-'}\n`)
      this.log(`Changed components (${impact.components.length})`)
      this.log(
        host.format.table(
          [
            {field: 'type', header: 'Type'},
            {field: 'name', header: 'Component'},
            {field: 'areas', header: 'Smoke area'},
          ],
          impact.components.map((component) => ({...component, areas: component.areas.join(', ') || '-'})),
        ),
      )
      this.log(`\nSmoke tests selected (${impact.selected.length} of ${config.areas.length + 1} areas)`)
      this.log(
        host.format.table(
          [
            {field: 'name', header: 'Area'},
            {field: 'tag', header: 'Robot tag'},
            {field: 'reason', header: 'Why', wrap: true},
          ],
          impact.selected,
        ),
      )
      this.log(`\nCopado CI/CD credentials  ${auth.cicd.configured ? 'configured' : 'not configured'}`)
      this.log(`Robotic Testing (CRT)     ${auth.crt.ready ? 'ready' : 'not ready'}${flags.simulate ? '  (not needed in simulation)' : ''}`)
      this.log(`\nRun the selected smoke tests:\n  ${crtCommand}`)
      this.log(`\nThen report:\n  agentia sentinel report --out ${outDir}${flags.simulate ? ' --simulate' : ''}`)
      this.log(`\nPlan saved to ${planFile}`)
    })

    return result
  }
}

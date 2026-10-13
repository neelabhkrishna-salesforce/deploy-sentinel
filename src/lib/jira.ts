import fs from 'node:fs'
import path from 'node:path'

import type {SentinelConfig} from './config.js'
import type {Evidence} from './evidence.js'
import type {FailureGroup} from './triage.js'

export type RunContext = {
  storyName: string
  storyTitle: string
  environment: string
  promotion?: string
  crtBuild?: string
  simulated: boolean
}

export type BugDraft = {
  key: string
  summary: string
  priority: 'High' | 'Medium'
  evidence: Evidence
  payload: {
    fields: {
      description: string
      issuetype: {name: string}
      labels: string[]
      priority: {name: string}
      project: {key: string}
      summary: string
    }
  }
}

const bullet = (lines: readonly string[]): string => lines.map((line) => `* ${line}`).join('\n')

/** Builds Jira REST v2 issue payloads (wiki markup), one per failure group. */
export function buildBugDrafts(groups: readonly FailureGroup[], evidence: ReadonlyMap<FailureGroup, Evidence>, context: RunContext, config: SentinelConfig): BugDraft[] {
  return groups.map((group, index) => {
    const first = group.tests[0]
    const summary = `[Deploy Sentinel] ${group.area}: ${first.name} fails after ${context.storyName} (${group.category.label})`.slice(0, 250)
    const found = evidence.get(group) ?? {logs: [], screenshots: []}
    const causes = group.likelyCauses.map((cause) => `${cause.type} {{${cause.name}}} (${cause.path})`)
    const description = [
      context.simulated ? '{panel:title=Simulation}Generated from simulated Copado data by Deploy Sentinel. No real org was tested.{panel}' : '',
      'h3. What failed',
      `Post-deployment smoke testing of *${context.environment}* failed in *${group.area}*.`,
      bullet(group.tests.map((test) => `${test.suite} / ${test.name} (${test.seconds.toFixed(1)}s)`)),
      'h3. Error',
      `{noformat}${group.message}{noformat}`,
      'h3. Likely cause',
      `*${group.category.label}.* ${group.category.hint}`,
      causes.length > 0 ? bullet(causes) : 'No changed component in this promotion matches this failure type.',
      'h3. Deployment',
      bullet([
        `User story: ${context.storyName} - ${context.storyTitle}`,
        `Target environment: ${context.environment}`,
        ...(context.promotion ? [`Promotion: ${context.promotion}`] : []),
        ...(context.crtBuild ? [`CRT build: ${context.crtBuild}`] : []),
      ]),
      'h3. Evidence',
      found.screenshots.length + found.logs.length > 0
        ? bullet([...found.screenshots, ...found.logs].map((file) => `[^${path.basename(file)}]`))
        : 'No screenshots or logs were found in the run artifacts.',
      'h3. Reproduce',
      bullet([`Log in to ${context.environment} as the smoke-test user.`, `Run the "${first.name}" test, or repeat its steps manually.`]),
    ]
      .filter(Boolean)
      .join('\n\n')

    const priority = group.area.startsWith('Critical') || group.tests.length > 1 ? 'High' : 'Medium'
    return {
      evidence: found,
      key: `BUG-${String(index + 1).padStart(2, '0')}`,
      payload: {
        fields: {
          description,
          issuetype: {name: config.jira.issueType},
          labels: [...config.jira.labels, `story-${context.storyName}`.replace(/[^\w-]/g, '-'), `category-${group.category.id}`],
          priority: {name: priority},
          project: {key: config.jira.projectKey},
          summary,
        },
      },
      priority,
      summary,
    }
  })
}

export type JiraConnection = {baseUrl: string; email: string; token: string}

export function jiraFromEnv(env: NodeJS.ProcessEnv = process.env): JiraConnection | undefined {
  const {JIRA_API_TOKEN: token, JIRA_BASE_URL: baseUrl, JIRA_EMAIL: email} = env
  return baseUrl && email && token ? {baseUrl: baseUrl.replace(/\/+$/, ''), email, token} : undefined
}

/** Creates each issue, then attaches its evidence files. Returns the created issue keys in draft order. */
export async function postBugs(drafts: readonly BugDraft[], jira: JiraConnection, fetchImpl: typeof fetch = fetch): Promise<string[]> {
  const auth = `Basic ${Buffer.from(`${jira.email}:${jira.token}`).toString('base64')}`
  const keys: string[] = []
  for (const draft of drafts) {
    const created = await fetchImpl(`${jira.baseUrl}/rest/api/2/issue`, {
      body: JSON.stringify(draft.payload),
      headers: {Accept: 'application/json', Authorization: auth, 'Content-Type': 'application/json'},
      method: 'POST',
    })
    if (!created.ok) throw new Error(`Jira rejected ${draft.key}: HTTP ${created.status} ${await created.text()}`)
    const {key} = (await created.json()) as {key: string}
    keys.push(key)

    const files = [...draft.evidence.screenshots, ...draft.evidence.logs]
    if (files.length === 0) continue
    const form = new FormData()
    for (const file of files) form.append('file', new Blob([fs.readFileSync(file)]), path.basename(file))
    const attached = await fetchImpl(`${jira.baseUrl}/rest/api/2/issue/${key}/attachments`, {
      body: form,
      headers: {Authorization: auth, 'X-Atlassian-Token': 'no-check'},
      method: 'POST',
    })
    if (!attached.ok) throw new Error(`Jira created ${key} but rejected its attachments: HTTP ${attached.status}`)
  }

  return keys
}

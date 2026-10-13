import {execFileSync} from 'node:child_process'
import fs from 'node:fs'

import {type SentinelConfig, matchesAny} from './config.js'

export type ChangedComponent = {
  /** Path relative to the source root, for example `flows/Opportunity_Close.flow-meta.xml`. */
  path: string
  type: string
  name: string
  areas: string[]
}

export type SelectedArea = {
  name: string
  tag: string
  reason: string
}

export type ImpactPlan = {
  components: ChangedComponent[]
  selected: SelectedArea[]
  tags: string[]
}

const FOLDER_TYPES: Record<string, string> = {
  aura: 'AuraDefinitionBundle',
  classes: 'ApexClass',
  flexipages: 'FlexiPage',
  flows: 'Flow',
  layouts: 'Layout',
  lwc: 'LightningComponentBundle',
  objects: 'CustomObject',
  permissionsets: 'PermissionSet',
  profiles: 'Profile',
  triggers: 'ApexTrigger',
}

const OBJECT_CHILD_TYPES: Record<string, string> = {
  fields: 'CustomField',
  listViews: 'ListView',
  recordTypes: 'RecordType',
  validationRules: 'ValidationRule',
}

const META_SUFFIX = /(-meta\.xml|\.(cls|trigger|js|html|css))$/

/** Turns a source-format path (relative to the source root) into a Salesforce metadata type and name. */
export function describeComponent(relativePath: string): {name: string; type: string} {
  const parts = relativePath.split('/')
  const folder = parts[0]
  if (folder === 'objects' && parts.length >= 4 && OBJECT_CHILD_TYPES[parts[2]]) {
    const child = parts[3].replace(META_SUFFIX, '').replace(/\.[^.]+$/, '')
    return {name: `${parts[1]}.${child}`, type: OBJECT_CHILD_TYPES[parts[2]]}
  }

  if (folder === 'objects' && parts.length >= 2) {
    return {name: parts[1], type: 'CustomObject'}
  }

  if ((folder === 'lwc' || folder === 'aura') && parts.length >= 2) {
    return {name: parts[1], type: FOLDER_TYPES[folder]}
  }

  const file = parts.at(-1) ?? relativePath
  const name = file.replace(META_SUFFIX, '').replace(/\.[^.]+$/, '')
  return {name, type: FOLDER_TYPES[folder] ?? 'Other'}
}

/** Reads changed paths from a newline-separated file, ignoring blanks and `#` comments. */
export function readChangedFiles(file: string): string[] {
  return fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
}

/** Lists files changed between `base` and HEAD in the current Git working tree. */
export function gitChangedFiles(base: string, cwd = process.cwd()): string[] {
  const output = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], {cwd, encoding: 'utf8'})
  return output.split(/\r?\n/).filter(Boolean)
}

export function analyzeImpact(changedPaths: readonly string[], config: SentinelConfig): ImpactPlan {
  const root = config.sourceRoot.replace(/\/+$/, '') + '/'
  const seen = new Set<string>()
  const components: ChangedComponent[] = []

  for (const changed of changedPaths) {
    const relative = changed.startsWith(root) ? changed.slice(root.length) : changed
    const {name, type} = describeComponent(relative)
    const key = `${type}:${name}`
    if (seen.has(key)) continue
    seen.add(key)
    const areas = config.areas.filter((area) => matchesAny(relative, area.metadata)).map((area) => area.name)
    components.push({areas, name, path: relative, type})
  }

  const selected: SelectedArea[] = [
    {name: 'Critical path (always run)', reason: config.alwaysRun.description, tag: config.alwaysRun.tag},
  ]
  for (const area of config.areas) {
    const hits = components.filter((component) => component.areas.includes(area.name))
    if (hits.length === 0) continue
    const listed = hits.slice(0, 3).map((hit) => `${hit.type} ${hit.name}`)
    const more = hits.length > 3 ? ` and ${hits.length - 3} more` : ''
    selected.push({name: area.name, reason: `Changed: ${listed.join(', ')}${more}`, tag: area.tag})
  }

  return {components, selected, tags: selected.map((area) => area.tag)}
}

/** The CRT command an agent or pipeline runs to execute exactly the selected smoke tests. */
export function crtRunCommand(config: SentinelConfig, tags: readonly string[], outDir: string): string {
  const include = tags.map((tag) => `--include ${tag}`).join(' ')
  return [
    `agentia testing test run ${config.crt.jobId} --project ${config.crt.projectId}`,
    include,
    `--record ${config.crt.record} --wait-for-result --no-exit-code`,
    `--xunit ${outDir}/xunit_report.xml --save-artifacts ${outDir}/artifacts.zip --json`,
  ].join(' ')
}

import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

import type {PluginWorkItem} from '@copado/agentia-plugin-sdk'

/** Plugin root, resolved from `dist/lib/` so bundled fixtures work after `agentia plugins link` or install. */
export const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
export const SIMULATION_DIR = path.join(PLUGIN_ROOT, 'fixtures', 'simulated')
export const BUNDLED_CONFIG = path.join(PLUGIN_ROOT, 'sentinel.config.json')

export const simulated = {
  artifacts: path.join(SIMULATION_DIR, 'artifacts'),
  changedFiles: path.join(SIMULATION_DIR, 'changed-files.txt'),
  run: path.join(SIMULATION_DIR, 'run.json'),
  workItem: path.join(SIMULATION_DIR, 'work-item.json'),
  xunit: path.join(SIMULATION_DIR, 'xunit_report.xml'),
}

export type SimulatedRun = {environment: string; promotion: string; crtBuild: string}

export const readJson = <T>(file: string): T => JSON.parse(fs.readFileSync(file, 'utf8')) as T

export const simulatedWorkItem = (): PluginWorkItem => readJson<PluginWorkItem>(simulated.workItem)
export const simulatedRun = (): SimulatedRun => readJson<SimulatedRun>(simulated.run)

import fs from 'node:fs'
import path from 'node:path'

import type {Evidence} from './evidence.js'
import type {ChangedComponent, SelectedArea} from './impact.js'
import type {BugDraft, RunContext} from './jira.js'
import type {FailureGroup} from './triage.js'
import type {TestResult} from './xunit.js'

export type Verdict = 'GREEN' | 'RED'

export type RunSummary = {
  verdict: Verdict
  total: number
  passed: number
  failed: number
  skipped: number
  seconds: number
}

export function summarize(results: readonly TestResult[]): RunSummary {
  const failed = results.filter((test) => test.status === 'fail' || test.status === 'error').length
  return {
    failed,
    passed: results.filter((test) => test.status === 'pass').length,
    seconds: results.reduce((sum, test) => sum + test.seconds, 0),
    skipped: results.filter((test) => test.status === 'skip').length,
    total: results.length,
    verdict: failed === 0 && results.length > 0 ? 'GREEN' : 'RED',
  }
}

export type ReportInput = {
  context: RunContext
  summary: RunSummary
  results: TestResult[]
  selected: SelectedArea[]
  components: ChangedComponent[]
  groups: FailureGroup[]
  evidence: ReadonlyMap<FailureGroup, Evidence>
  bugs: BugDraft[]
}

const escape = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => ({'"': '&quot;', '&': '&amp;', "'": '&#39;', '<': '&lt;', '>': '&gt;'})[char] ?? char)

/** Copies evidence next to the report so the HTML works when the folder is zipped, shared, or opened offline. */
function copyEvidence(files: readonly string[], outDir: string): Map<string, string> {
  const target = path.join(outDir, 'evidence')
  fs.mkdirSync(target, {recursive: true})
  const copied = new Map<string, string>()
  for (const file of files) {
    const name = path.basename(file)
    fs.copyFileSync(file, path.join(target, name))
    copied.set(file, `evidence/${name}`)
  }

  return copied
}

export function writeReports(input: ReportInput, outDir: string): {html: string; markdown: string} {
  fs.mkdirSync(outDir, {recursive: true})
  const {bugs, components, context, groups, results, selected, summary} = input
  const allEvidence = [...new Set([...input.evidence.values()].flatMap((found) => [...found.screenshots, ...found.logs]))]
  const copied = copyEvidence(allEvidence, outDir)

  const groupCards = groups
    .map((group, index) => {
      const found = input.evidence.get(group) ?? {logs: [], screenshots: []}
      const shots = found.screenshots
        .map((file) => `<figure><img src="${escape(copied.get(file) ?? file)}" alt="Screenshot for ${escape(group.tests[0].name)}"><figcaption>${escape(path.basename(file))}</figcaption></figure>`)
        .join('')
      const causes = group.likelyCauses.length > 0
        ? group.likelyCauses.map((cause) => `<li><code>${escape(cause.type)}</code> ${escape(cause.name)}</li>`).join('')
        : '<li>No changed component matches this failure type.</li>'
      return `<section class="card fail">
  <header><span class="pill">${escape(bugs[index]?.key ?? '')}</span><h3>${escape(group.area)}: ${escape(group.tests.map((test) => test.name).join(', '))}</h3><span class="tag">${escape(group.category.label)}</span></header>
  <pre>${escape(group.message)}</pre>
  <div class="cols"><div><h4>Likely cause</h4><p>${escape(group.category.hint)}</p><ul>${causes}</ul></div>
  <div><h4>Evidence</h4>${shots || '<p>No screenshot found.</p>'}${found.logs.map((file) => `<p><a href="${escape(copied.get(file) ?? file)}">${escape(path.basename(file))}</a></p>`).join('')}</div></div>
</section>`
    })
    .join('\n')

  const rows = results
    .map((test) => `<tr class="${test.status}"><td>${escape(test.suite)}</td><td>${escape(test.name)}</td><td>${test.status.toUpperCase()}</td><td>${test.seconds.toFixed(1)}s</td></tr>`)
    .join('')

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Deploy Sentinel - ${escape(context.storyName)}</title>
<style>
:root{--red:#c23934;--green:#2e844a;--ink:#181818;--muted:#5c5c5c;--line:#e5e5e5;--bg:#f3f3f3;--blue:#0176d3}
*{box-sizing:border-box}body{margin:0;font:15px/1.5 -apple-system,"Segoe UI",Helvetica,Arial,sans-serif;color:var(--ink);background:var(--bg)}
main{max-width:1100px;margin:0 auto;padding:28px}
.banner{background:#fff3cd;border:1px solid #f0d58c;border-radius:10px;padding:10px 14px;margin-bottom:16px}
.hero{display:flex;gap:20px;align-items:center;background:#fff;border-radius:14px;padding:22px;border:1px solid var(--line)}
.verdict{font-size:30px;font-weight:800;color:#fff;border-radius:12px;padding:14px 22px}.verdict.RED{background:var(--red)}.verdict.GREEN{background:var(--green)}
.meta{color:var(--muted)}.meta b{color:var(--ink)}
.stats{display:flex;gap:10px;margin:16px 0}.stat{flex:1;background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px 16px}.stat b{display:block;font-size:24px}
h2{margin:26px 0 10px}.card{background:#fff;border:1px solid var(--line);border-left:6px solid var(--red);border-radius:12px;padding:16px 18px;margin-bottom:14px}
.card header{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.card h3{margin:0;font-size:17px;flex:1}
.pill{background:var(--ink);color:#fff;border-radius:6px;padding:2px 8px;font-size:12px;font-weight:700}.tag{background:#fde7e7;color:var(--red);border-radius:20px;padding:3px 10px;font-size:13px;font-weight:600}
pre{background:#1e1e1e;color:#f8f8f2;border-radius:8px;padding:12px;white-space:pre-wrap;font-size:13px}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:18px}figure{margin:0}img{max-width:100%;border:1px solid var(--line);border-radius:8px}figcaption{font-size:12px;color:var(--muted)}
table{width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;border:1px solid var(--line)}th,td{text-align:left;padding:8px 12px;border-bottom:1px solid var(--line)}
th{background:#fafafa}tr.fail td:nth-child(3),tr.error td:nth-child(3){color:var(--red);font-weight:700}tr.pass td:nth-child(3){color:var(--green);font-weight:700}
code{background:#eef4ff;color:var(--blue);padding:1px 6px;border-radius:5px}
</style></head><body><main>
${context.simulated ? '<div class="banner"><b>Simulation.</b> This report was generated by Deploy Sentinel from simulated Copado and CRT data. No real org was tested.</div>' : ''}
<div class="hero"><div class="verdict ${summary.verdict}">${summary.verdict}</div><div>
<div style="font-size:20px;font-weight:700">${escape(context.storyName)} - ${escape(context.storyTitle)}</div>
<div class="meta">Target <b>${escape(context.environment)}</b>${context.promotion ? ` &middot; Promotion <b>${escape(context.promotion)}</b>` : ''}${context.crtBuild ? ` &middot; CRT build <b>${escape(context.crtBuild)}</b>` : ''}</div>
</div></div>
<div class="stats"><div class="stat"><b>${summary.total}</b>tests run</div><div class="stat"><b style="color:var(--green)">${summary.passed}</b>passed</div><div class="stat"><b style="color:var(--red)">${summary.failed}</b>failed</div><div class="stat"><b>${groups.length}</b>bugs drafted</div><div class="stat"><b>${summary.seconds.toFixed(0)}s</b>test time</div></div>
<h2>Why these tests ran</h2>
<table><tr><th>Smoke area</th><th>Robot tag</th><th>Reason</th></tr>${selected.map((area) => `<tr><td>${escape(area.name)}</td><td><code>${escape(area.tag)}</code></td><td>${escape(area.reason)}</td></tr>`).join('')}</table>
<h2>Failures (${groups.length} root cause${groups.length === 1 ? '' : 's'})</h2>
${groupCards || '<p>No failures. The release is healthy.</p>'}
<h2>All results</h2>
<table><tr><th>Suite</th><th>Test</th><th>Status</th><th>Time</th></tr>${rows}</table>
<h2>Changed components (${components.length})</h2>
<table><tr><th>Type</th><th>Name</th><th>Smoke areas</th></tr>${components.map((component) => `<tr><td>${escape(component.type)}</td><td>${escape(component.name)}</td><td>${escape(component.areas.join(', ') || '-')}</td></tr>`).join('')}</table>
</main></body></html>`

  const markdown = [
    `## Deploy Sentinel: ${summary.verdict === 'GREEN' ? ':white_check_mark: GREEN' : ':red_circle: RED'} for ${context.storyName}`,
    context.simulated ? '_Simulation: generated from simulated Copado and CRT data._' : '',
    `**${context.storyTitle}** deployed to **${context.environment}**${context.promotion ? ` (promotion ${context.promotion})` : ''}.`,
    `${summary.passed}/${summary.total} smoke tests passed, ${summary.failed} failed, grouped into ${groups.length} bug${groups.length === 1 ? '' : 's'}.`,
    ...bugs.map((bug, index) => `- **${bug.key}** (${bug.priority}) ${groups[index].area}: ${groups[index].category.label}. Likely cause: ${groups[index].likelyCauses.map((cause) => `${cause.type} ${cause.name}`).join(', ') || 'unknown'}`),
  ]
    .filter(Boolean)
    .join('\n')

  const htmlPath = path.join(outDir, 'report.html')
  const markdownPath = path.join(outDir, 'summary.md')
  fs.writeFileSync(htmlPath, html)
  fs.writeFileSync(markdownPath, markdown + '\n')
  const bugDir = path.join(outDir, 'bugs')
  fs.mkdirSync(bugDir, {recursive: true})
  for (const bug of bugs) fs.writeFileSync(path.join(bugDir, `${bug.key}.json`), JSON.stringify(bug.payload, null, 2) + '\n')
  return {html: htmlPath, markdown: markdownPath}
}

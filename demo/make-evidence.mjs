// Renders the simulated CRT failure screenshots bundled in fixtures/simulated/artifacts.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {launch} from './browser.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'fixtures', 'simulated', 'artifacts')
fs.mkdirSync(outDir, {recursive: true})

const shell = (body) => `<!doctype html><html><head><style>
*{box-sizing:border-box}body{margin:0;font:14px -apple-system,"Segoe UI",Arial,sans-serif;background:#b0c4df;color:#181818}
.top{height:46px;background:#fff;border-bottom:1px solid #ddd;display:flex;align-items:center;padding:0 16px;gap:14px}
.logo{width:30px;height:22px;border-radius:11px;background:#00a1e0}.search{flex:1;max-width:520px;height:30px;border:1px solid #c9c9c9;border-radius:6px;padding:6px 10px;color:#747474}
.nav{height:40px;background:#fff;border-bottom:3px solid #0176d3;display:flex;align-items:center;padding:0 16px;gap:22px;font-weight:600}
.nav span.active{color:#0176d3}.page{padding:16px}.card{background:#fff;border-radius:6px;border:1px solid #ddd;padding:16px;margin-bottom:12px}
.hdr{display:flex;align-items:center;gap:12px}.icon{width:36px;height:36px;border-radius:6px;background:#ff5d2d}
.title small{display:block;color:#5c5c5c;font-size:12px}.title b{font-size:20px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 30px;margin-top:10px}.f label{display:block;color:#5c5c5c;font-size:12px}.f div{border-bottom:1px solid #eee;padding:4px 0}
.err{background:#fef1ee;border:1px solid #ea001e;border-radius:6px;padding:12px 14px;color:#ba0517}.err b{display:block;margin-bottom:4px}
.btn{display:inline-block;border:1px solid #0176d3;color:#fff;background:#0176d3;border-radius:4px;padding:6px 14px;margin-right:6px}
.btn.o{background:#fff;color:#0176d3}.ring{outline:3px solid #ea001e;outline-offset:3px}
.missing{border:2px dashed #ea001e;border-radius:6px;padding:16px;color:#ba0517;text-align:center}
</style></head><body><div class="top"><div class="logo"></div><div class="search">Search...</div></div>
<div class="nav"><span>Home</span><span>Accounts</span><span class="active">Opportunities</span><span>Cases</span><span>Reports</span></div>
<div class="page">${body}</div></body></html>`

const header = (name, stage) => `<div class="card"><div class="hdr"><div class="icon"></div><div class="title"><small>Opportunity</small><b>${name}</b></div>
<div style="margin-left:auto"><span class="btn o">Edit</span><span class="btn">Mark Stage as Complete</span></div></div>
<div class="grid"><div class="f"><label>Account Name</label><div>Edge Communications</div></div><div class="f"><label>Stage</label><div>${stage}</div></div>
<div class="f"><label>Amount</label><div>$120,000.00</div></div><div class="f"><label>Discount Percent</label><div>0%</div></div></div></div>`

const shots = [
  {
    file: 'close-opportunity-as-won.png',
    html: shell(`${header('Edge Emergency Generator', 'Negotiation/Review')}
<div class="card err ring"><b>We hit a snag.</b>Discounts above 10% need Sales Manager approval before closing. [Discount_Requires_Approval]</div>
<div class="card"><div class="f"><label>Stage</label><div>Closed Won (not saved)</div></div></div>`),
  },
  {
    file: 'opportunity-page-shows-discount-banner.png',
    html: shell(`${header('Edge Installation Q4', 'Proposal/Price Quote')}
<div class="card missing ring">Expected text "Discount approval required" was not found.<br>The discountApprovalBanner component did not render in this region.</div>`),
  },
  {
    file: 'sales-manager-can-approve-discount.png',
    html: shell(`${header('Edge SLA Renewal', 'Negotiation/Review')}
<div class="card err ring"><b>Insufficient privileges</b>You don't have access to edit the field Discount Percent. Signed in as: Sales Manager (smoke-test user).</div>`),
  },
]

const browser = await launch()
const page = await browser.newPage({viewport: {height: 620, width: 1100}})
for (const shot of shots) {
  await page.setContent(shot.html)
  await page.screenshot({path: path.join(outDir, shot.file)})
  console.log('wrote', shot.file)
}

await browser.close()

fs.writeFileSync(
  path.join(outDir, 'log.html'),
  `<!doctype html><html><body style="font-family:monospace"><h2>Robot Framework log</h2>
<p>Suite Smoke: 10 tests, 6 passed, 4 failed. Build sim-build-7781.</p>
<pre>
FAIL Close Opportunity As Won: FIELD_CUSTOM_VALIDATION_EXCEPTION Discount_Requires_Approval
FAIL Close Opportunity With Small Discount: FIELD_CUSTOM_VALIDATION_EXCEPTION Discount_Requires_Approval
FAIL Opportunity Page Shows Discount Banner: QWeb VerifyText 'Discount approval required' not found
FAIL Sales Manager Can Approve Discount: INSUFFICIENT_ACCESS_OR_READONLY Discount_Percent__c
</pre></body></html>\n`,
)
console.log('wrote log.html')

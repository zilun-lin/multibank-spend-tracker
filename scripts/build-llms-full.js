// Concatenate the docs into llms-full.txt for AI crawlers and agents. Run after editing docs.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const files = ['README.md', 'AGENTS.md', 'docs/bank-feeds.md', 'docs/configuration.md', 'docs/data-model.md', 'docs/alternatives.md', 'docs/privacy.md',
  ...fs.readdirSync(path.join(root, 'docs/recipes')).filter(f => f !== 'README.md').sort().map(f => 'docs/recipes/' + f),
  'skills/finance-assistant/SKILL.md', 'skills/personal-cfo/SKILL.md', 'skills/finance-dashboard-design/SKILL.md',
  'agents/daily-pipeline.md', 'agents/receipt-enrichment.md'];
const out = ['# multibank-spend-tracker — full documentation', '', 'Source: https://github.com/zilun-lin/multibank-spend-tracker (MIT)', ''];
for (const f of files) out.push('', '---', '', `<!-- file: ${f} -->`, '', fs.readFileSync(path.join(root, f), 'utf8').replace(/!\[[^\]]*\]\([^)]*\)\n?/g, ''));
fs.writeFileSync(path.join(root, 'llms-full.txt'), out.join('\n'));
console.log('llms-full.txt', Math.round(out.join('\n').length / 1024) + ' KB');

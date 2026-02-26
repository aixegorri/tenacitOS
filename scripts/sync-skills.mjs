#!/usr/bin/env node
/**
 * sync-skills.mjs
 *
 * Syncs OpenClaw skills to data/configured-skills.json.
 * Queries `openclaw skills list --json`, enriches the schema with
 * eligibility/missing-deps/source metadata, and writes the result.
 *
 * Usage:
 *   node scripts/sync-skills.mjs
 *
 * Typically invoked via an OpenClaw cron job after installing new skills,
 * or run manually at any time. The output file is gitignored — it is
 * local runtime data, not source-controlled config.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = path.join(__dirname, '..');
const CONFIG_PATH = path.join(PROJECT_DIR, 'data', 'configured-skills.json');
const DEFAULT_SYSTEM_PATH = '/usr/lib/node_modules/openclaw/skills';

/**
 * Build a skillName → fullFolderPath map for managed skills.
 *
 * Necessary because a skill's internal `name` field (declared in SKILL.md
 * front matter) may differ from the folder name on disk.
 * Example: folder `self-improving-agent` → SKILL.md name `self-improvement`.
 *
 * @param {string} managedDir  Path to the managed-skills directory
 * @returns {Map<string, string>}  skill name → absolute folder path
 */
function buildManagedFolderMap(managedDir) {
  const map = new Map();
  try {
    const entries = fs.readdirSync(managedDir, { withFileTypes: true });
    for (const d of entries) {
      if (!d.isDirectory()) continue;
      const skillMd = path.join(managedDir, d.name, 'SKILL.md');
      if (!fs.existsSync(skillMd)) continue;
      try {
        const content = fs.readFileSync(skillMd, 'utf-8');
        const nameMatch = content.match(/^name:\s*(.+)$/m);
        const skillName = nameMatch ? nameMatch[1].trim() : d.name;
        map.set(skillName, path.join(managedDir, d.name));
      } catch {
        // Skip unreadable SKILL.md
      }
    }
  } catch {
    // managedDir may not exist yet
  }
  return map;
}

async function main() {
  console.log('🔍 Querying OpenClaw skills...');

  let parsed;
  try {
    const raw = execSync('openclaw skills list --json', {
      encoding: 'utf-8',
      timeout: 15000,
    });
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error('❌ Failed to run `openclaw skills list --json`:', err.message);
    console.error('   Is openclaw installed and on PATH?');
    process.exit(1);
  }

  const managedDir =
    parsed.managedSkillsDir ||
    `${process.env.HOME || '/root'}/.openclaw/skills`;

  const managedFolderMap = buildManagedFolderMap(managedDir);

  const skills = [];
  for (const entry of parsed.skills) {
    const isManaged = entry.source === 'openclaw-managed';

    let location;
    if (isManaged) {
      // Use the resolved full path so skill-parser.ts can find the folder
      // even when the folder name differs from the skill name.
      location =
        managedFolderMap.get(entry.name) || path.join(managedDir, entry.name);
    } else {
      // Bundled skills are always under the system skills path
      location = 'system';
    }

    const skillEntry = {
      name: entry.name,
      location,
      source: entry.source || 'openclaw-bundled',
      eligible: entry.eligible ?? false,
    };

    if (entry.emoji) skillEntry.emoji = entry.emoji;
    if (entry.homepage) skillEntry.homepage = entry.homepage;

    if (entry.missing) {
      skillEntry.missing = {
        bins: entry.missing.bins ?? [],
        env: entry.missing.env ?? [],
        config: entry.missing.config ?? [],
      };
    }

    skills.push(skillEntry);
  }

  const config = {
    lastUpdated: new Date().toISOString(),
    systemSkillsPath: DEFAULT_SYSTEM_PATH,
    managedSkillsDir: managedDir,
    skills,
  };

  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');

  const eligible = skills.filter((s) => s.eligible).length;
  const managed = skills.filter((s) => s.source === 'openclaw-managed').length;
  const bundled = skills.length - managed;

  console.log(`✅ Synced ${skills.length} skills → ${CONFIG_PATH}`);
  console.log(`   ${eligible} ready · ${bundled} bundled · ${managed} managed`);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});

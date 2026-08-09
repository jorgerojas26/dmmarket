/**
 * Dedupe @nivo/tooltip in bun's install store.
 *
 * bun 1.3 installs @nivo/tooltip@0.74.0 into TWO store entries with different
 * hashes (closure-based dedup: core/line resolve one copy, pie/bar/arcs resolve
 * the other). nivo's tooltip uses a React context created inside that module;
 * with two module instances the context never matches, so every nivo tooltip
 * silently no-ops (useTooltip falls back to the default no-op actions).
 *
 * This script collapses the duplicates onto a single real directory by aliasing
 * the extra store entries to it. Runs as a root postinstall so the fix survives
 * fresh installs.
 */
import { existsSync, lstatSync, readdirSync, renameSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";

const store = join(import.meta.dirname, "..", "node_modules", ".bun");
if (!existsSync(store)) process.exit(0);

const entries = readdirSync(store).filter((e) => /^@nivo\+tooltip@[\d.]+[+][0-9a-f]+$/.test(e));
if (entries.length < 2) process.exit(0); // already single — nothing to do

const canonical = entries.find((e) => lstatSync(join(store, e)).isDirectory());
if (!canonical) process.exit(0); // no real entry left; leave the graph alone

for (const entry of entries) {
  if (entry === canonical) continue;
  const target = join(store, entry);
  if (lstatSync(target).isDirectory()) {
    const backup = join(store, `${entry}.orig`);
    if (existsSync(backup)) rmSync(backup, { recursive: true, force: true });
    renameSync(target, backup);
  }
  rmSync(target, { recursive: true, force: true });
  symlinkSync(canonical, target, "dir");
}

console.log(`[dedupe-nivo] aliased ${entries.length - 1} duplicate @nivo/tooltip store entries -> ${canonical}`);

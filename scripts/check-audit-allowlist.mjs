#!/usr/bin/env node
/**
 * check-audit-allowlist.mjs — reviewed-exception gate for `npm audit`.
 *
 * Closes F-1d50a285: bare `npm audit --audit-level=high` had no allowlist,
 * override, or escalation mechanism — the moment any dependency (including
 * a transitive one entirely outside this repo's control) gets a new
 * high/critical advisory published upstream, CI goes red on every PR on
 * every Node version with no interim path to unblock unrelated work while a
 * real fix is prepared. This happened for real (brace-expansion + postcss),
 * fixed only by an ad-hoc manual dependency bump under time pressure.
 *
 * This script does NOT weaken the gate — any advisory not explicitly listed
 * (or listed but past its expiry) still fails the build exactly as before.
 * It only lets a *reviewed, time-boxed, git-tracked* exception (added via a
 * normal PR to .github/audit-allowlist.json, reviewed like any other change)
 * pass while a real fix is prepared.
 *
 * Usage:
 *   node scripts/check-audit-allowlist.mjs <audit-report.json> <allowlist.json> <npmAuditExitCode>
 *
 * Exit code: 0 if every flagged high/critical advisory is either absent or
 * covered by a non-expired allowlist entry; 1 otherwise (also 1, "failing
 * closed", if the audit report can't be parsed at all or an entry can't be
 * verified — ambiguous states are never treated as a pass).
 */
import { readFileSync, existsSync } from 'node:fs';

const [, , auditReportPath, allowlistPath, npmAuditExitCodeArg] = process.argv;

if (!auditReportPath || !allowlistPath || npmAuditExitCodeArg === undefined) {
  console.error(
    'Usage: node scripts/check-audit-allowlist.mjs <audit-report.json> <allowlist.json> <npmAuditExitCode>'
  );
  process.exit(1);
}

const npmAuditExitCode = Number(npmAuditExitCodeArg);

if (npmAuditExitCode === 0) {
  console.log('npm audit: no high/critical advisories.');
  process.exit(0);
}

let auditReportRaw;
try {
  auditReportRaw = readFileSync(auditReportPath, 'utf-8');
} catch (err) {
  console.error(`Could not read audit report at ${auditReportPath}: ${err.message}`);
  console.error('Failing closed (treating as a real audit failure).');
  process.exit(npmAuditExitCode || 1);
}

let auditReport;
try {
  auditReport = JSON.parse(auditReportRaw);
} catch (err) {
  console.error('npm audit did not return parseable JSON — likely a network error or npm-internal');
  console.error('failure rather than a real advisory list. Failing closed.');
  console.error(err.message);
  console.error(auditReportRaw.slice(0, 2000));
  process.exit(npmAuditExitCode || 1);
}

// Collect every distinct advisory id (npm's numeric `source` field) attached
// to a high/critical severity package. `via[]` entries are either a plain
// string (naming another vulnerable package this one flows through — no new
// advisory) or an object carrying the actual advisory (source/title/url/...).
const flaggedIds = new Set();
for (const vuln of Object.values(auditReport.vulnerabilities ?? {})) {
  if (vuln.severity !== 'high' && vuln.severity !== 'critical') continue;
  for (const via of vuln.via ?? []) {
    if (via && typeof via === 'object' && via.source !== undefined) {
      flaggedIds.add(String(via.source));
    }
  }
}

if (flaggedIds.size === 0) {
  console.error(
    `npm audit exited ${npmAuditExitCode} (non-zero) but no high/critical advisory objects were found in its JSON.`
  );
  console.error('Failing closed rather than silently passing an unrecognized failure mode.');
  console.error(auditReportRaw.slice(0, 2000));
  process.exit(npmAuditExitCode || 1);
}

let allowlist = { exceptions: [] };
if (existsSync(allowlistPath)) {
  try {
    allowlist = JSON.parse(readFileSync(allowlistPath, 'utf-8'));
  } catch (err) {
    console.error(`${allowlistPath} exists but is not valid JSON: ${err.message}`);
    console.error('Fix the allowlist file — failing closed until it parses.');
    process.exit(1);
  }
}

const today = new Date().toISOString().slice(0, 10); // UTC YYYY-MM-DD
const validExceptionIds = new Map(); // id -> expiresOn, for the "covered by" log line
for (const exception of allowlist.exceptions ?? []) {
  if (typeof exception?.id !== 'string' && typeof exception?.id !== 'number') continue;
  if (typeof exception?.expiresOn !== 'string') continue;
  if (exception.expiresOn >= today) {
    validExceptionIds.set(String(exception.id), exception.expiresOn);
  }
}

const uncovered = [];
for (const id of flaggedIds) {
  if (validExceptionIds.has(id)) {
    console.log(
      `npm audit: advisory ${id} is covered by a reviewed exception in ${allowlistPath} (expires ${validExceptionIds.get(id)}).`
    );
  } else {
    uncovered.push(id);
  }
}

if (uncovered.length > 0) {
  console.error('');
  console.error(`::error::npm audit found high/critical advisories with no valid exception: ${uncovered.join(', ')}`);
  console.error(
    `Add a time-boxed entry to ${allowlistPath} (id, package, reason, approvedBy, addedOn, expiresOn — see`
  );
  console.error('its "description" field for the full procedure) via a normal reviewed PR, or fix/bump the');
  console.error('dependency instead. An expired exception is treated the same as no exception at all.');
  process.exit(1);
}

console.log('npm audit: all flagged advisories are covered by reviewed, non-expired exceptions — passing.');
process.exit(0);

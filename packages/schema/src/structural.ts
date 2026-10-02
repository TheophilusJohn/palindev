// Checks on a record's structure that JSON Schema can't express, reported under rule id `schema`.

import { isIsoDate } from "./formats.js";
import type { PalinRecord } from "./generated/record.js";
import type { Issue } from "./problems.js";

/**
 * A sandbox_run's `trace_path` is `runs/YYYY/MM/<run_id>.json` for its own run and month, and its
 * `tested_on.variant` points at a variant the record has (SCHEMA.md "evidence" and "variants").
 */
export function checkStructure(record: PalinRecord): Issue[] {
  const issues: Issue[] = [];
  const variantCount = record.variants?.length ?? 0;
  record.evidence.forEach((item, index) => {
    if (item.type !== "sandbox_run") return;
    const at = `evidence[${index}]`;
    if (!item.trace_path.endsWith(`/${item.run_id}.json`)) {
      issues.push({ path: `${at}.trace_path`, message: `must name this run's trace, ${item.run_id}.json` });
    } else if (isIsoDate(item.date)) {
      const expected = `runs/${item.date.slice(0, 4)}/${item.date.slice(5, 7)}/${item.run_id}.json`;
      if (item.trace_path !== expected) {
        issues.push({ path: `${at}.trace_path`, message: `must be ${expected}, under the month of the run's date` });
      }
    }
    const variant = item.tested_on.variant;
    if (variant !== null && variant >= variantCount) {
      issues.push({
        path: `${at}.tested_on.variant`,
        message:
          variantCount === 0
            ? "points at a variant, but the record has none"
            : `points at variant ${variant}, but the record has ${variantCount} (counted from 0)`,
      });
    }
  });
  return issues;
}

import { afterAll, describe, expect, it } from "vitest";
import { formatProblem } from "../../src/problems.js";
import { v16 } from "../../src/rules/v16.js";
import { baseText, brief, check, fixtureTests, removeTempRoots, tempRoot } from "../helpers.js";

afterAll(removeTempRoots);

// Every secret-shaped string in this file is fake and says FAKE on its line (the guard requires it).
const FAKE_STRIPE = "sk_test_FAKE0000000000000000"; // FAKE
const FAKE_GITHUB = "ghp_FAKE00000000000000000000000000000000"; // FAKE
const FAKE_AWS = "AKIAFAKE0000000000AB"; // FAKE
const FAKE_AWS_SECRET = "FAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE"; // FAKE: 40 characters, shaped like a secret access key

describe("V16: no secrets or real email addresses", () => {
  fixtureTests("V16", ["invoices.get.yaml V16 notes"]);

  it("finds secrets with no FAKE exemption and never repeats them", () => {
    const findings = v16(`notes: ${FAKE_STRIPE}\nother: ${FAKE_GITHUB}\n`);
    expect(findings.map((finding) => [finding.line, finding.col])).toEqual([
      [1, 8],
      [2, 8],
    ]);
    for (const finding of findings) {
      expect(finding.message).not.toContain(FAKE_STRIPE);
      expect(finding.message).not.toContain(FAKE_GITHUB);
    }
  });

  it("allows example domains and rejects others, naming only the domain", () => {
    expect(v16("a@example.com b@example.org c@docs.acme.example")).toEqual([]);
    const [finding] = v16("contact: someone@mail.acme.io");
    expect(finding?.message).toContain("mail.acme.io");
    expect(finding?.message).not.toContain("someone");
  });

  it("finds addresses in Markdown, URL paths and non-ASCII text", () => {
    for (const text of ["_john@acme.com_", "https://groups.acme.com/archive/john@acme.com", "owner: josé@gmail.com", "jane@gmaïl.com"]) {
      expect(v16(text), text).toHaveLength(1);
    }
  });

  it("doesn't mistake package specs and versioned URLs for addresses", () => {
    for (const text of [
      "https://cdn.jsdelivr.net/npm/@acme/acme-mcp@1.4.2/dist/tools.js",
      "@modelcontextprotocol/server-github@2025.4.8",
      "acme/acme-mcp@v1.2",
      "pkg@1.0.0-beta.1",
    ]) {
      expect(v16(text), text).toEqual([]);
    }
  });

  it("stays fast on long lines without an address", () => {
    const started = performance.now();
    v16(`${"x".repeat(200_000)}\n${"a.".repeat(100_000)}@`);
    expect(performance.now() - started).toBeLessThan(1_000);
  });

  it("allows the probe domain only when one is set", () => {
    expect(v16("to: run-1@probe.palin.dev")).toHaveLength(1);
    expect(v16("to: run-1@probe.palin.dev", { probeMailDomain: "probe.palin.dev" })).toEqual([]);
    expect(v16("to: run-1@probe.palin.dev", { probeMailDomain: "" })).toHaveLength(1);
  });

  it("scans every text file under the root, reports binary files and skips .DS_Store", () => {
    const root = tempRoot({
      "acme/_provider.yaml": baseText("provider"),
      LICENSE: `Copyright notice\n${FAKE_STRIPE}\n`,
      "acme/.notes": `owner: someone@mail.acme.io\n`,
      "acme/.thumbnail.bin": Buffer.concat([Buffer.from([0, 1, 2]), Buffer.from(FAKE_STRIPE)]),
      ".DS_Store": Buffer.from([0, 0, 0, 1]),
    });
    // The binary file is reported, and so is the key in its raw bytes.
    expect(brief(check(root))).toEqual(["LICENSE V16 (file)", ".notes V16 (file)", ".thumbnail.bin V16 (file)", ".thumbnail.bin V16 (file)"]);
  });

  it("decodes UTF-16 files before scanning them", () => {
    const utf16 = (text: string) => Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")]);
    const root = tempRoot({ "acme/_provider.yaml": baseText("provider"), "README.md": utf16(`key ${FAKE_STRIPE}\n`) });
    expect(brief(check(root))).toEqual(["README.md V16 (file)"]);
  });

  it("doesn't let a byte-order mark or a binary wrapper hide a key", () => {
    const bom = (bytes: number[], text: string) => Buffer.concat([Buffer.from(bytes), Buffer.from(text, "latin1")]);
    const root = tempRoot({
      "acme/_provider.yaml": baseText("provider"),
      "acme/.a": bom([0xff, 0xfe], `key ${FAKE_STRIPE}\n`),
      "acme/.b": bom([0xfe, 0xff], `key ${FAKE_STRIPE}\n`),
      "acme/.c": Buffer.concat([Buffer.from([0xff, 0xfe, 0, 0]), Buffer.from(`k\0\0\0`, "latin1")]),
      ".DS_Store": Buffer.concat([Buffer.from([0, 1]), Buffer.from(FAKE_STRIPE)]),
    });
    const problems = check(root).map((problem) => {
      const kind = /looks? like a Stripe/.test(problem.message) ? "key" : problem.message.startsWith("is a binary file") ? "binary" : problem.message;
      return `${problem.file.split("/").pop()} ${kind}`;
    });
    // .a and .b carry a UTF-16 mark over plain ASCII, so they're read as UTF-8 and scanned normally.
    expect(problems).toEqual([".DS_Store key", ".a key", ".b key", ".c binary"]);
  });

  it("finds an AWS secret access key whose value isn't on its key's line", () => {
    const layouts = [
      `aws_secret_access_key:\n            ${FAKE_AWS_SECRET}`,
      `aws_secret_access_key: >-\n            ${FAKE_AWS_SECRET}`,
      `"aws_secret\\x5Faccess_key": ${FAKE_AWS_SECRET}`,
    ];
    for (const layout of layouts) {
      const record = baseText("r3").replace(
        "confidence: documented\n",
        `variants:\n  - when:\n      args:\n        ${layout}\nconfidence: documented\n`,
      );
      const root = tempRoot({ "acme/_provider.yaml": baseText("provider"), "acme/invoices.send.yaml": record });
      expect(brief(check(root)), layout).toEqual(["invoices.send.yaml V16 variants[0].when.args.aws_secret_access_key"]);
    }
    const root = tempRoot({ LICENSE: `aws_secret_access_key =\n  ${FAKE_AWS_SECRET}\n` });
    expect(check(root).map((problem) => [problem.rule, problem.line])).toEqual([["V16", 1]]);
  });

  it("reads past block-scalar headers in files that aren't YAML", () => {
    const root = tempRoot({ "acme/.notes": `aws_secret_access_key: |\n  ${FAKE_AWS_SECRET}\n` });
    expect(check(root).map((problem) => [problem.rule, problem.line])).toEqual([["V16", 1]]);
  });

  it("finds an address in UTF-8 text behind a UTF-16 mark, even with a stray NUL byte", () => {
    const bytes = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("owner: jane.doe@realcorp.io\n"), Buffer.from([0])]);
    const root = tempRoot({ "acme/.notes": bytes });
    expect(check(root).some((problem) => problem.message.startsWith("has an email address on realcorp.io"))).toBe(true);
  });

  it("rejects ordered maps and sets, which would hide their contents", () => {
    const record = baseText("r2").replace(
      "confidence: documented\n",
      `variants:\n  - when:\n      settings: !!omap\n        - aws_secret_access_key: >-\n            ${FAKE_AWS_SECRET}\nconfidence: documented\n`,
    );
    const root = tempRoot({ "acme/_provider.yaml": baseText("provider"), "acme/tags.update.yaml": record });
    expect(brief(check(root))).toEqual(["tags.update.yaml yaml (file)"]);
  });

  it("survives a self-referencing alias", () => {
    const record = baseText("r0").replace("last_verified: 2026-09-28\n", "last_verified: 2026-09-28\nnotes: &a [*a]\n");
    const root = tempRoot({ "acme/_provider.yaml": baseText("provider"), "acme/invoices.get.yaml": record });
    expect(brief(check(root))).toEqual(["invoices.get.yaml schema notes"]);
  });

  it("reads past a byte-order mark that the bytes don't back up", () => {
    const root = tempRoot({ "README.md": Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("owner: jane.doe@realcorp.io\n")]) });
    expect(check(root).map((problem) => problem.message)).toEqual([
      "has an email address on realcorp.io; use example.com, example.org, a .example domain or the probe domain",
    ]);
  });

  it("finds addresses written with combining marks", () => {
    expect(v16("owner: josé@realcorp.io")).toHaveLength(1);
  });

  it("finds keys spelled with YAML escapes, at their field", () => {
    const escaped = FAKE_STRIPE.replace("FAKE", "\\x46AKE"); // FAKE
    const root = tempRoot({
      "acme/_provider.yaml": baseText("provider").replace('  notes: "Test-mode keys start with sk_test_."\n', `  notes: "${escaped}"\n`),
    });
    const [problem] = check(root);
    expect([problem?.rule, problem?.path, problem?.line]).toEqual(["V16", "sandbox.notes", 18]);
  });

  it("reports a secret once even when both the text and the parsed value show it", () => {
    const root = tempRoot({
      "acme/_provider.yaml": baseText("provider").replace('  notes: "Test-mode keys start with sk_test_."\n', `  notes: "Key ${FAKE_STRIPE}"\n`),
    });
    expect(brief(check(root))).toEqual(["_provider.yaml V16 sandbox.notes"]);
  });

  it("points at the YAML field and line that holds a secret", () => {
    const root = tempRoot({
      "acme/_provider.yaml": baseText("provider").replace('  notes: "Test-mode keys start with sk_test_."\n', `  notes: "Key ${FAKE_STRIPE}"\n`),
    });
    const [problem] = check(root);
    expect([problem?.rule, problem?.path, problem?.line]).toEqual(["V16", "sandbox.notes", 18]);
  });

  it("never prints a secret or an address used as a key, a file name or an alias name", () => {
    const record = baseText("r0").replace(
      "last_verified: 2026-09-28\n",
      `last_verified: 2026-09-28\nnotes: *${FAKE_STRIPE}\n`,
    );
    const root = tempRoot({
      "acme/_provider.yaml": baseText("provider").replace("last_reviewed: 2026-09-28\n", `last_reviewed: 2026-09-28\n${FAKE_GITHUB}: true\nalice@corp.io: true\n`),
      "acme/invoices.get.yaml": record,
      [`acme/${FAKE_STRIPE}.yaml`]: baseText("r0"),
    });
    const output = check(root)
      .map((problem) => formatProblem(problem, root))
      .join("\n");
    expect(output).not.toContain(FAKE_STRIPE);
    expect(output).not.toContain(FAKE_GITHUB);
    expect(output).not.toContain("alice");
    expect(output).toContain("the file name looks like a Stripe secret");
  });

  it("keeps a key hidden in an address's domain redacted, in any case", () => {
    const root = tempRoot({ "acme/_provider.yaml": baseText("provider"), LICENSE: `mail x@${FAKE_AWS}.com\n` });
    const output = check(root)
      .map((problem) => formatProblem(problem, root))
      .join("\n");
    expect(output.toUpperCase()).not.toContain(FAKE_AWS);
    expect(output).toContain("[an AWS access key id]");
  });

  it("stays fast on a file with thousands of findings", () => {
    const lines = Array.from({ length: 4_000 }, (_, index) => `  - owner${index}@mail.acme.io`).join("\n");
    const root = tempRoot({ "acme/_provider.yaml": baseText("provider"), "acme/notes.yaml": `list:\n${lines}\n` });
    const started = performance.now();
    check(root);
    expect(performance.now() - started).toBeLessThan(5_000);
  });
});

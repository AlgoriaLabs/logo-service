// The deploy helpers that touch files and secrets: parsing tfvars, editing them, reading the kit's output, and
// building the OCI profile CI gets. Offline.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain JavaScript module without type declarations
import * as untyped from "../scripts/lib/deploy-lib.mjs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const lib: any = untyped;
const { ciOciConfig, parseOciConfig, parseTfvars, payToFromOutput, registeredAgentFromOutput, setEnvVar, setTfvar, stateHcl, versionAtLeast } = lib;

const TFVARS = `# comment
region           = "eu-frankfurt-1"                # ★ the region= line
compartment_ocid = "ocid1.tenancy.oc1..aaa"
# availability_domain_index = 1
stellar_network = "testnet"
agent_id_testnet = ""
ocpus = 2
`;

describe("tfvars", () => {
  it("parseTfvars reads quoted and bare values, ignores comments", () => {
    const vars = parseTfvars(TFVARS);
    expect(vars).toMatchObject({ region: "eu-frankfurt-1", compartment_ocid: "ocid1.tenancy.oc1..aaa", agent_id_testnet: "", ocpus: "2" });
    expect(vars.availability_domain_index).toBeUndefined();
  });

  it("setTfvar replaces a line, uncomments a commented one, or appends", () => {
    let text = setTfvar(TFVARS, "agent_id_testnet", "42");
    expect(text).toMatch(/^agent_id_testnet = "42"$/m);
    text = setTfvar(text, "availability_domain_index", 1);
    expect(text).toMatch(/^availability_domain_index = "1"$/m);
    text = setTfvar(text, "agent_id_mainnet", "7");
    expect(text.endsWith('agent_id_mainnet = "7"\n')).toBe(true);
    expect(parseTfvars(text).region).toBe("eu-frankfurt-1");
  });

  it("setTfvar escapes quotes, so a value can't break the file", () => {
    expect(parseTfvars(setTfvar("", "domain", 'a"b')).domain).toBe('a"b');
  });

  it("the example parses and has every required key", () => {
    const text = readFileSync(new URL("../deploy/terraform/terraform.tfvars.example", import.meta.url), "utf8");
    expect(Object.keys(parseTfvars(text))).toEqual(expect.arrayContaining(["region", "compartment_ocid", "stellar_network", "pay_to_testnet", "gemini_api_key"]));
  });
});

describe(".env and kit output", () => {
  it("setEnvVar replaces or appends", () => {
    expect(setEnvVar("A=1\nPAY_TO_TESTNET=\nB=2\n", "PAY_TO_TESTNET", "GX")).toBe("A=1\nPAY_TO_TESTNET=GX\nB=2\n");
    expect(setEnvVar("A=1", "C", "3")).toBe("A=1\nC=3\n");
  });

  it("reads the payout address and the agent id the kit prints", () => {
    const address = "GDZTNESUUP2YODFWW5TIOVV2PN43JTJFIEZ7ML4JC2VCHOXWNSTV44SC";
    expect(payToFromOutput(`✓ trustline\nUse it as your payout address: PAY_TO=${address}\n`)).toBe(address);
    expect(payToFromOutput("nothing here")).toBeUndefined();
    expect(registeredAgentFromOutput("Registered agent 121 on stellar:testnet.")).toEqual({ id: "121", network: "testnet" });
    expect(registeredAgentFromOutput("Registered agent 7 on stellar:pubnet.")).toEqual({ id: "7", network: "mainnet" });
  });
});

const OCI = `[DEFAULT]
user=ocid1.user.oc1..u
fingerprint=aa:bb
tenancy=ocid1.tenancy.oc1..t
region=eu-frankfurt-1
key_file=~/.oci/oci_api_key.pem

[WORK]
user = ocid1.user.oc1..w
key_file = /keys/work.pem

[SESSION]
security_token_file=/tmp/token
key_file=/keys/s.pem
`;

describe("OCI profile for CI", () => {
  it("keeps one profile, drops key_file, and finds the key", () => {
    const { config, keyFile } = ciOciConfig(OCI, "DEFAULT");
    expect(config).toBe("[DEFAULT]\nuser=ocid1.user.oc1..u\nfingerprint=aa:bb\ntenancy=ocid1.tenancy.oc1..t\nregion=eu-frankfurt-1\n");
    expect(keyFile.endsWith("/.oci/oci_api_key.pem") && !keyFile.startsWith("~")).toBe(true);
  });

  it("other profiles inherit DEFAULT, as the OCI SDKs read them", () => {
    const { config, keyFile } = ciOciConfig(OCI, "WORK");
    expect(config).toMatch(/^\[WORK\]\nuser=ocid1\.user\.oc1\.\.w\nfingerprint=aa:bb\ntenancy=/);
    expect(keyFile).toBe("/keys/work.pem");
  });

  it("refuses session tokens and missing profiles", () => {
    expect(() => ciOciConfig(OCI, "SESSION")).toThrow(/session token/);
    expect(() => ciOciConfig(OCI, "NOPE")).toThrow(/isn't in/);
    expect(() => ciOciConfig("[DEFAULT]\nuser=u\n", "DEFAULT")).toThrow(/no fingerprint=/);
  });

  it("parseOciConfig handles spaces around =", () => {
    expect(parseOciConfig(OCI).WORK.key_file).toBe("/keys/work.pem");
  });
});

describe("state and versions", () => {
  it("stateHcl holds the location only", () => {
    const text = stateHcl({ bucket: "b", namespace: "ns", region: "eu-frankfurt-1", profile: "DEFAULT" });
    expect(text).toMatch(/bucket\s+= "b"/);
    expect(text).toMatch(/key\s+= "logo-agent\.tfstate"/);
    expect(text).not.toMatch(/fingerprint|key_file|ocid1\.user/);
  });

  it("versionAtLeast", () => {
    expect(versionAtLeast("1.13.4", "1.12")).toBe(true);
    expect(versionAtLeast("1.12.0", "1.12")).toBe(true);
    expect(versionAtLeast("1.11.9", "1.12")).toBe(false);
  });
});

/**
 * In-memory proving: noir_js computes the witness and bb.js builds the UltraHonk proof. Card data, the witness and
 * Prover.toml are never written to disk. verifierTarget "evm" = keccak transcript + zero-knowledge (spec section I),
 * the same setting the Solidity verifier is generated with.
 */
import { readFileSync } from "node:fs";
import { Barretenberg, UltraHonkBackend } from "@aztec-foundation/bb.js";
import { Noir } from "@noir-lang/noir_js";
import type { InputMap } from "./inputs.ts";

export interface ProofResult {
  proof: `0x${string}`;
  publicInputs: `0x${string}`[];
  provingMs: number;
}

export class WatermarkProver {
  private readonly noir: Noir;
  private readonly backend: UltraHonkBackend;
  private readonly api: Barretenberg;

  private constructor(noir: Noir, backend: UltraHonkBackend, api: Barretenberg) {
    this.noir = noir;
    this.backend = backend;
    this.api = api;
  }

  /** `circuitPath` is the compiled circuit, circuits/target/watermark.json (`nargo compile`). */
  static async load(circuitPath: string): Promise<WatermarkProver> {
    const circuit = JSON.parse(readFileSync(circuitPath, "utf8"));
    const api = await Barretenberg.new();
    return new WatermarkProver(new Noir(circuit), new UltraHonkBackend(circuit.bytecode, api), api);
  }

  async prove(inputs: InputMap): Promise<ProofResult> {
    const t = performance.now();
    const { witness } = await this.noir.execute(inputs as never);
    const data = await this.backend.generateProof(witness, { verifierTarget: "evm" });
    const ok = await this.backend.verifyProof(data, { verifierTarget: "evm" });
    if (!ok) throw new Error("proof did not verify");
    return {
      proof: `0x${Buffer.from(data.proof).toString("hex")}`,
      publicInputs: data.publicInputs as `0x${string}`[],
      provingMs: Math.round(performance.now() - t),
    };
  }

  async solidityVerifier(): Promise<string> {
    const vk = await this.backend.getVerificationKey({ verifierTarget: "evm" });
    return this.backend.getSolidityVerifier(vk, { verifierTarget: "evm" });
  }

  async destroy(): Promise<void> {
    await this.api.destroy();
  }
}

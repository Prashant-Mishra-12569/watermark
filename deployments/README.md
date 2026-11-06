# deployments

Deployed contract addresses, committed so every part reads the same values (interfaces F11).

- `whitechain.json`: Whitechain Sepolia (1874)
- `devnet.json`: alt mempool devnet (1337). The devnet can reset, so re-run the deploy scripts and update this file.
  `contracts/script/deployment-json.ts 1337` writes the registry part; the EF paymaster fields (`paymaster`,
  `demoCounter`, `stakingRegistry`, `stake`, `stampedWallet`, `altMempool`, and the extra `txHashes`) are added by hand
  from the broadcast logs, so re-add them after re-running it. Runbook: `tools/ef-sender/README.md`.

```json
{ "chainId": 1874, "registry": "0x…", "verifier": "0x…", "sponsor": "0x…", "paymaster": null,
  "usdt": "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7", "deployedAt": "ISO-8601", "txHashes": {} }
```

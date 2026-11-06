# Evidence: the alt mempool transaction

The devnet explorer keeps its history in memory, so the page for our transaction can disappear if the devnet is reset.
These files were saved from the devnet on 7 Nov 2026 so the result can still be checked.

- [`altmempool-tx-explorer.png`](altmempool-tx-explorer.png): the explorer page for
  [tx `0xcab8c9e2…`](https://explorer.altmempool.wtf/tx/0xcab8c9e2171a8048c8f5e12d4bb830c92cba7f458763d2c7ac8f23ab1faa8a93?node=https%3A%2F%2Faltmempool.forshtat.com%2Frpc),
  as seen by the miner node: on chain, every admission rule passed, 5 frames, our QuotaPaymaster as the payer.
- [`altmempool-tx-admission-record.json`](altmempool-tx-admission-record.json): the miner sidecar's admission record
  (`skandha_explorer_getTransaction`): outcome `included`, status `OnChain`, 24 of 24 checks `pass`.
- [`altmempool-tx-receipt.json`](altmempool-tx-receipt.json): the chain receipt (`eth_getTransactionReceipt` on
  `https://altmempool.forshtat.com`): status `0x1`, block 3,699, 191,864 gas, the paymaster as payer.

The link needs its `?node=` part: without it the explorer shows the gateway node, which never saw this transaction.
The code that builds and submits it is in [`tools/ef-sender/`](../../tools/ef-sender).

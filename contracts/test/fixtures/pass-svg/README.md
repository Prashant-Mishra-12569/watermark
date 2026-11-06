# Genesis Pass artwork fixtures

`<id>.svg` (1 to 100) is the Watermark Genesis Pass artwork for that token, written by
`script/pass-art/generator.mjs`, the single source of truth for the art. `WatermarkPassRenderer.t.sol` checks that
`WatermarkPassRenderer.svg(id)` returns these bytes exactly for every id, and the pass tests check the image in
`tokenURI`. Don't edit these files by hand.

`generator.sha256` is the SHA-256 of `script/pass-art/generator.mjs` at the time the fixtures were written (the first
command below writes it). `WatermarkPassRenderer.t.sol` hashes the generator and compares, so plain `forge test`, the
only contracts check CI runs, fails when the generator was edited and the fixtures were not regenerated. The website
should draw the pass from `svg()` in the generator or from these files, never from a copy of its own.

After changing the generator, run from `contracts/`:

```sh
node script/pass-art/generator.mjs           # rewrite the 100 fixtures and generator.sha256
node script/pass-art/generator.mjs --sol     # rewrite the generated constants in src/WatermarkPassRenderer.sol
node script/pass-art/generator.mjs --check   # exit 1 if a fixture, the hash or the constants are out of date
forge build --sizes && forge test --match-path 'test/*{PassRenderer,GenesisPass}*'
```

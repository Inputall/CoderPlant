# Legacy TypeScript Edition

This directory contains the original LLM API Doctor implementation:

- `src/`: TypeScript CLI and diagnostic core
- `tests/`: Node.js tests
- `desktop/`: Electron desktop application
- `examples/`: legacy usage examples

The actively developed native implementation is in [`../rust/`](../rust/).

## Test the legacy CLI

```powershell
npm.cmd install
npm.cmd run build
npm.cmd test
```

## Test the legacy Electron desktop app

```powershell
cd desktop
npm.cmd install
npm.cmd test
```

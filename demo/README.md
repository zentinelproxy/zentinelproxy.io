# Demo Recording

Terminal demo for zentinelproxy.io.

## Record with VHS

```bash
cd demo
vhs demo.tape
```

Outputs `demo.gif` and `demo.webm`.

## Customize

Edit `demo.tape` to change the flow. Key settings at the top:
- `Set Width/Height` — terminal dimensions
- `Set TypingSpeed` — how fast text appears
- `Set Theme` — color scheme (uses Catppuccin Mocha)

The demo simulates output with hidden `echo` commands so it doesn't need a real backend running.

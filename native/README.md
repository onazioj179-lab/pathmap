# PathMap native core

`pathmap_core` is an **optional** Rust extension that accelerates the A* route
search. The Python backend works without it (pure-Python fallback in
`backend/pathfinding/a_star.py`); building it just makes routing faster.

## What it does

The road network lives as a NetworkX graph in Python. The hot path - the
shortest-path search itself - is converted once into a compact CSR adjacency
view and handed to this Rust module, which runs the identical A* (same metre
edge weights, same admissible great-circle heuristic, same `visited` order) and
returns the result. Output is byte-for-byte compatible with the Python core.

## Build

Requires the Rust toolchain (https://rustup.rs) and `maturin`.

```powershell
# from the repo root, with the backend's Python environment active
pip install maturin
./native/build.ps1
```

`build.ps1` runs `maturin develop --release` inside `native/pathmap_core`, which
compiles the module and installs it into the active Python environment. Restart
the backend; on startup `native_routing.NATIVE_AVAILABLE` becomes `True` and
routing uses the native path automatically.

To confirm:

```python
from backend.pathfinding import native_routing
print(native_routing.NATIVE_AVAILABLE, native_routing.NATIVE_VERSION)
```

## Notes

- Not built? Nothing breaks - the backend logs nothing and uses Python.
- The CSR view is cached on the graph object and rebuilt only when the graph
  changes, so conversion cost is paid once per graph load.

//! Native A* routing core for PathMap.
//!
//! The Python backend stores its road network as a NetworkX graph. For the hot
//! path (the actual shortest-path search) that interpreter loop is the
//! bottleneck, so this crate runs the identical algorithm over a compact CSR
//! (compressed sparse row) representation of the same graph and returns the
//! result to Python. Semantics are kept byte-for-byte compatible with
//! `backend/pathfinding/a_star.py`:
//!   * edge weights are road lengths in metres,
//!   * the heuristic is the equirectangular great-circle distance in metres
//!     (admissible, so the route stays optimal),
//!   * `visited` is the order in which nodes are settled (popped).
//!
//! If this module is not built/installed, the backend transparently falls back
//! to the pure-Python implementation, so the app always runs.

use pyo3::prelude::*;
use std::cmp::Ordering;
use std::collections::BinaryHeap;

const EARTH_RADIUS_M: f64 = 6_371_000.0;

/// A min-heap entry keyed on the A* f-score. `f64` is not `Ord`, so we wrap it
/// and define a total ordering (reversed, because `BinaryHeap` is a max-heap).
struct State {
    f: f64,
    // Monotonic insertion order. On equal f-scores the entry pushed first is
    // popped first (FIFO), mirroring the `counter` tiebreak in the Python core
    // (a_star.py) so `visited` order and the reconstructed path match exactly.
    order: u64,
    node: u32,
}

impl PartialEq for State {
    fn eq(&self, other: &Self) -> bool {
        self.f == other.f && self.order == other.order
    }
}
impl Eq for State {}

impl Ord for State {
    fn cmp(&self, other: &Self) -> Ordering {
        // Reversed so the smallest f-score is popped first; ties broken by the
        // lowest insertion order (FIFO), matching Python.
        other
            .f
            .total_cmp(&self.f)
            .then_with(|| other.order.cmp(&self.order))
    }
}
impl PartialOrd for State {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

/// Equirectangular approximation of the great-circle distance, in metres.
/// Matches `AStar._heuristic_estimate` in the Python core.
#[inline]
fn heuristic(xs: &[f64], ys: &[f64], a: usize, b: usize) -> f64 {
    let lat1 = ys[a].to_radians();
    let lat2 = ys[b].to_radians();
    let dlat = lat2 - lat1;
    let dlon = (xs[b] - xs[a]).to_radians();
    let mean_lat = (lat1 + lat2) * 0.5;
    let x = dlon * mean_lat.cos();
    x.hypot(dlat) * EARTH_RADIUS_M
}

/// Run A* over a CSR graph.
///
/// Arguments
/// * `xs`, `ys` - per-node longitude (x) and latitude (y).
/// * `indptr`, `indices`, `weights` - CSR adjacency: neighbours of node `i` are
///   `indices[indptr[i]..indptr[i+1]]` with the matching `weights`.
/// * `start`, `goal` - dense node indices.
///
/// Returns `(path_node_indices, visited_order, cost_metres)`. On failure the
/// path is empty and cost is `0.0`, mirroring the Python contract.
#[pyfunction]
#[allow(clippy::too_many_arguments)]
fn astar(
    xs: Vec<f64>,
    ys: Vec<f64>,
    indptr: Vec<u32>,
    indices: Vec<u32>,
    weights: Vec<f64>,
    start: u32,
    goal: u32,
) -> PyResult<(Vec<u32>, Vec<u32>, f64)> {
    let n = xs.len();
    let start = start as usize;
    let goal = goal as usize;

    // Validate the CSR contract up front. The empty/no-path tuple is the
    // documented failure result, so a malformed input degrades gracefully (the
    // Python caller then falls back) instead of ever indexing out of bounds.
    // Every slice access below is provably in-bounds given these invariants.
    if start >= n
        || goal >= n
        || ys.len() != n
        || indptr.len() != n + 1
        || indices.len() != weights.len()
    {
        return Ok((Vec::new(), Vec::new(), 0.0));
    }

    let mut g_score = vec![f64::INFINITY; n];
    let mut came_from = vec![u32::MAX; n];
    let mut closed = vec![false; n];
    let mut visited: Vec<u32> = Vec::new();

    g_score[start] = 0.0;
    let mut counter: u64 = 0;
    let mut heap = BinaryHeap::new();
    heap.push(State {
        f: heuristic(&xs, &ys, start, goal),
        order: 0,
        node: start as u32,
    });

    while let Some(State { node, .. }) = heap.pop() {
        let cur = node as usize;
        if closed[cur] {
            continue;
        }
        closed[cur] = true;
        visited.push(node);

        if cur == goal {
            // Reconstruct the path back to the start.
            let mut path = vec![goal as u32];
            let mut c = goal;
            while came_from[c] != u32::MAX {
                c = came_from[c] as usize;
                path.push(c as u32);
            }
            path.reverse();
            return Ok((path, visited, g_score[goal]));
        }

        // cur < n and indptr.len() == n + 1 (validated), so indptr[cur+1] is
        // safe. Clamp to indices.len() to stay safe even if indptr values are
        // not monotonic; an inverted range simply yields no neighbours.
        let lo = (indptr[cur] as usize).min(indices.len());
        let hi = (indptr[cur + 1] as usize).min(indices.len());
        for e in lo..hi {
            let nb = indices[e] as usize;
            if nb >= n {
                continue; // skip any out-of-range neighbour id
            }
            if closed[nb] {
                continue;
            }
            let w = weights[e];
            // Skip non-finite weights (matches the Python core's inf check).
            if !w.is_finite() {
                continue;
            }
            let tentative = g_score[cur] + w;
            if tentative < g_score[nb] {
                came_from[nb] = cur as u32;
                g_score[nb] = tentative;
                counter += 1;
                heap.push(State {
                    f: tentative + heuristic(&xs, &ys, nb, goal),
                    order: counter,
                    node: nb as u32,
                });
            }
        }
    }

    // No path found: return the nodes explored, like the Python core.
    Ok((Vec::new(), visited, 0.0))
}

#[pymodule]
fn pathmap_core(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(astar, m)?)?;
    m.add("__version__", env!("CARGO_PKG_VERSION"))?;
    Ok(())
}

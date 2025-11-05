import type { PrerenderedRoute } from '../types'

interface TrieNode {
  /**
   * The children of the node. Each key is a unique string representation of a parameter value,
   * and the value is the next TrieNode in the path.
   */
  children: Map<string, TrieNode>

  /**
   * The routes that are associated with this specific parameter combination (node).
   * These are the routes whose concrete parameters lead to this node in the Trie.
   */
  routes: PrerenderedRoute[]
}

/**
 * Assigns the throwOnEmptyStaticShell property to each of the prerendered routes.
 * This function uses a Trie data structure to efficiently determine whether each route
 * should throw an error when its static shell is empty.
 *
 * A route should not throw on empty static shell if it has child routes in the Trie. For example,
 * if we have two routes, `/blog/first-post` and `/blog/[slug]`, the route for
 * `/blog/[slug]` should not throw because `/blog/first-post` is a more specific concrete route.
 *
 * @param prerenderedRoutes - The prerendered routes.
 * @param childrenRouteParams - The keys of the route parameters.
 */
export function assignErrorIfEmpty(
  prerenderedRoutes: readonly PrerenderedRoute[],
  childrenRouteParams: ReadonlyArray<{
    readonly paramName: string
  }>
): void {
  // If there are no routes to process, exit early.
  if (prerenderedRoutes.length === 0) {
    return
  }

  // Initialize the root of the Trie. This node represents the starting point
  // before any parameters have been considered.
  const root: TrieNode = { children: new Map(), routes: [] }

  // Phase 1: Build the Trie.
  // Iterate over each prerendered route and insert it into the Trie.
  // Each route's concrete parameter values form a path in the Trie.
  for (const route of prerenderedRoutes) {
    let currentNode = root // Start building the path from the root for each route.

    // Iterate through the sorted parameter keys. The order of keys is crucial
    // for ensuring that routes with the same concrete parameters follow the
    // same path in the Trie, regardless of the original order of properties
    // in the `params` object.
    for (const { paramName: key } of childrenRouteParams) {
      // Check if the current route actually has a concrete value for this parameter.
      // If a dynamic segment is not filled (i.e., it's a fallback), it won't have
      // this property, and we stop building the path for this route at this point.
      if (route.params.hasOwnProperty(key)) {
        const value = route.params[key]

        // Generate a unique key for the parameter's value. This is critical
        // to prevent collisions between different data types that might have
        // the same string representation (e.g., `['a', 'b']` vs `'a,b'`).
        // A type prefix (`A:` for Array, `S:` for String, `U:` for undefined)
        // is added to the value to prevent collisions. This ensures that
        // different types with the same string representation are treated as
        // distinct.
        let valueKey: string
        if (Array.isArray(value)) {
          valueKey = `A:${value.join(',')}`
        } else if (value === undefined) {
          valueKey = `U:undefined`
        } else {
          valueKey = `S:${value}`
        }

        // Look for a child node corresponding to this `valueKey` from the `currentNode`.
        let childNode = currentNode.children.get(valueKey)
        if (!childNode) {
          // If the child node doesn't exist, create a new one and add it to
          // the current node's children.
          childNode = { children: new Map(), routes: [] }
          currentNode.children.set(valueKey, childNode)
        }
        // Move deeper into the Trie to the `childNode` for the next parameter.
        currentNode = childNode
      }
    }
    // After processing all concrete parameters for the route, add the full
    // `PrerenderedRoute` object to the `routes` array of the `currentNode`.
    // This node represents the unique concrete parameter combination for this route.
    currentNode.routes.push(route)
  }

  // Phase 2: Traverse the Trie to assign the `throwOnEmptyStaticShell` property.
  // This is done using an iterative Depth-First Search (DFS) approach with an
  // explicit stack to avoid JavaScript's recursion depth limits (stack overflow)
  // for very deep routing structures.
  const stack: TrieNode[] = [root] // Initialize the stack with the root node.

  while (stack.length > 0) {
    const node = stack.pop()! // Pop the next node to process from the stack.

    // `hasChildren` indicates if this node has any more specific concrete
    // parameter combinations branching off from it. If true, it means this
    // node represents a prefix for other, more specific routes.
    const hasChildren = node.children.size > 0

    // If the current node has routes associated with it (meaning, routes whose
    // concrete parameters lead to this node's path in the Trie).
    if (node.routes.length > 0) {
      // Determine the minimum number of fallback parameters among all routes
      // that are associated with this current Trie node. This is used to
      // identify if a route should not throw on empty static shell relative to another route *at the same level*
      // of concrete parameters, but with fewer fallback parameters.
      let minFallbacks = Infinity
      for (const r of node.routes) {
        // `fallbackRouteParams?.length ?? 0` handles cases where `fallbackRouteParams`
        // might be `undefined` or `null`, treating them as 0 length.
        minFallbacks = Math.min(
          minFallbacks,
          r.fallbackRouteParams ? r.fallbackRouteParams.length : 0
        )
      }

      // Now, for each `PrerenderedRoute` associated with this node:
      for (const route of node.routes) {
        // A route is ok not to throw on an empty static shell (and thus
        // `throwOnEmptyStaticShell` should be `false`) if either of the
        // following conditions is met:
        // 1. `hasChildren` is true: This node has further concrete parameter children.
        //    This means the current route is a parent to more specific routes (e.g.,
        //    `/blog/[slug]` should not throw when concrete routes like `/blog/first-post` exist).
        // OR
        // 2. `route.fallbackRouteParams.length > minFallbacks`: This route has
        //    more fallback parameters than another route at the same Trie node.
        //    This implies the current route is a more general version that should not throw
        //    compared to a more specific route that has fewer fallback parameters
        //    (e.g., `/1234/[...slug]` should not throw relative to `/[id]/[...slug]`).
        if (
          hasChildren ||
          (route.fallbackRouteParams &&
            route.fallbackRouteParams.length > minFallbacks)
        ) {
          route.throwOnEmptyStaticShell = false // Should not throw on empty static shell.
        } else {
          route.throwOnEmptyStaticShell = true // Should throw on empty static shell.
        }
      }
    }

    // Add all children of the current node to the stack. This ensures that
    // the traversal continues to explore deeper paths in the Trie.
    for (const child of node.children.values()) {
      stack.push(child)
    }
  }
}

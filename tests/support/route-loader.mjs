// Node runs the real routes and lib/server.ts. Only the two runtime boundaries
// (Worker bindings and the signed-in identity) point at the test environment.
export function resolve(specifier, context, nextResolve) {
  if (specifier === 'cloudflare:workers' || specifier === '@/app/chatgpt-auth') {
    return { shortCircuit: true, url: new URL('./route-env.ts', import.meta.url).href };
  }
  if (specifier.startsWith('@/')) {
    return nextResolve(new URL('../../' + specifier.slice(2) + '.ts', import.meta.url).href, context);
  }
  return nextResolve(specifier, context);
}

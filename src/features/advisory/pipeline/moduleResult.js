export const PIPELINE_VERSION = "1.0.0";

/**
 * Standard shape returned by every advisory pipeline module.
 * @template T
 * @param {string} module
 * @param {T} data
 * @param {{ warnings?: string[], errors?: string[] }} [meta]
 */
export function moduleResult(module, data, meta = {}) {
  return {
    module,
    version: PIPELINE_VERSION,
    ok: !(meta.errors?.length),
    data,
    warnings: meta.warnings ?? [],
    errors: meta.errors ?? [],
    completedAt: new Date().toISOString(),
  };
}

/**
 * @param {import('./advisoryContext.js').AdvisoryPipelineContext} ctx
 * @param {import('./advisoryContext.js').AdvisoryPipelineContext['modules'][string]} result
 */
export function registerModule(ctx, result) {
  ctx.modules[result.module] = result;
  if (result.errors?.length) {
    ctx.errors.push(...result.errors.map((e) => `${result.module}: ${e}`));
  }
  if (result.warnings?.length) {
    ctx.warnings.push(...result.warnings.map((w) => `${result.module}: ${w}`));
  }
}

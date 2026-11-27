// Fake HTTP: routes requests to globalThis.__HTTP__(method, url, body) supplied by the test.
function create() {
  const call = async (method, url, body) => {
    const handler = globalThis.__HTTP__;
    const r = handler ? await handler(method, url, body) : { status: 404 };
    if (!r || r.status >= 400) { const e = new Error(`HTTP ${r?.status || 404} ${url}`); e.response = { status: r?.status || 404, data: r?.data }; throw e; }
    return { data: r.data, status: 200 };
  };
  return { get: (url) => call("GET", url), post: (url, body) => call("POST", url, body) };
}
const axios = { create, ...create() };
export default axios;

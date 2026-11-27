function Router() { const routes = []; const r = {}; for (const m of ["get", "post", "patch", "put", "delete"]) r[m] = (path, ...h) => { routes.push({ method: m.toUpperCase(), path, handlers: h }); return r; }; r.routes = routes; return r; }
export default { Router };

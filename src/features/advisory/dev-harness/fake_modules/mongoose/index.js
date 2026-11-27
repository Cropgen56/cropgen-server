// Minimal in-memory mongoose stand-in for integration tests (only what the advisory code uses).
import { randomBytes } from "node:crypto";
const DB = (globalThis.__DB__ ||= {});
class ObjectId {
  constructor(v) { this._v = v ? String(v) : randomBytes(12).toString("hex"); }
  toString() { return this._v; } toJSON() { return this._v; } valueOf() { return this._v; }
  static isValid(v) { return /^[0-9a-f]{24}$/i.test(String(v ?? "")); }
}
const id = (v) => (v === null || v === undefined ? v : String(v?._id ?? v));
function get(doc, path) { return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), doc); }
function cmp(a, b) { if (a instanceof Date || b instanceof Date) return new Date(a) - new Date(b); return a < b ? -1 : a > b ? 1 : 0; }
function matchVal(v, cond) {
  if (cond && typeof cond === "object" && !(cond instanceof Date) && !(cond instanceof ObjectId) && !Array.isArray(cond)) {
    return Object.entries(cond).every(([op, x]) => {
      if (op === "$in") return x.map(String).includes(String(id(v)));
      if (op === "$ne") return String(id(v)) !== String(id(x));
      if (op === "$gte") return v != null && cmp(v, x) >= 0;
      if (op === "$lte") return v != null && cmp(v, x) <= 0;
      if (op === "$lt") return v != null && cmp(v, x) < 0;
      if (op === "$gt") return v != null && cmp(v, x) > 0;
      return false;
    });
  }
  if (cond === null) return v === null || v === undefined;
  return String(id(v)) === String(id(cond));
}
function matches(doc, q = {}) {
  return Object.entries(q).every(([k, c]) => {
    if (k === "$or") return c.some((sub) => matches(doc, sub));
    return matchVal(get(doc, k), c);
  });
}
const clone = (d) => (d === undefined ? d : JSON.parse(JSON.stringify(d, (k, v) => (v instanceof ObjectId ? String(v) : v))));
function revive(d) { if (!d) return d; for (const k of ["createdAt", "updatedAt"]) if (d[k]) d[k] = new Date(d[k]); return d; }
class Query {
  constructor(model, exec) { this.model = model; this._exec = exec; this._sort = null; this._limit = null; this._lean = false; }
  sort(s) { this._sort = s; return this; } limit(n) { this._limit = n; return this; } select() { return this; }
  populate() { return this; } lean() { this._lean = true; return this; }
  async exec() {
    let r = this._exec();
    if (Array.isArray(r)) {
      if (this._sort) { const [[k, dir]] = Object.entries(this._sort); r = [...r].sort((a, b) => cmp(get(a, k), get(b, k)) * (dir < 0 ? -1 : 1)); }
      if (this._limit) r = r.slice(0, this._limit);
      return r.map((d) => this.model._wrap(d, this._lean));
    }
    if (r && this._single) return this.model._wrap(r, this._lean);
    return r ? this.model._wrap(r, this._lean) : null;
  }
  then(a, b) { return this.exec().then(a, b); }
}
class Schema {
  constructor(def, opts) { this.def = def; this.opts = opts || {}; this.indexes = []; }
  index(i, o) { this.indexes.push([i, o]); }
  static Types = { ObjectId, Mixed: "Mixed" };
}
function applyDefaults(def, obj) {
  for (const [k, v] of Object.entries(def || {})) {
    if (obj[k] === undefined && v && typeof v === "object" && "default" in v) obj[k] = typeof v.default === "function" ? v.default() : clone(v.default);
  }
  return obj;
}
const models = {};
function model(name, schema) {
  const coll = (DB[name] ||= []);
  class Model {
    constructor(data) { Object.assign(this, applyDefaults(schema?.def, clone(data) || {})); if (!this._id) this._id = String(new ObjectId()); }
    toObject() { return clone(this); } markModified() {}
    async save() { const now = new Date(); const i = coll.findIndex((d) => d._id === this._id); const plain = clone(this); plain.updatedAt = now.toISOString(); if (i >= 0) coll[i] = { ...coll[i], ...plain }; else { plain.createdAt = now.toISOString(); coll.push(plain); } return this; }
    static _wrap(d, lean) { const c = revive(clone(d)); if (lean) return c; const m = new Model(c); m._id = c._id; return m; }
    static async create(data) { const m = new Model(data); const now = new Date().toISOString(); const plain = clone(m); plain.createdAt = now; plain.updatedAt = now; coll.push(plain); return Model._wrap(plain, false); }
    static async insertMany(arr) { const out = []; for (const a of arr) out.push(await Model.create(a)); return out; }
    static find(q) { return new Query(Model, () => coll.filter((d) => matches(d, q))); }
    static findOne(q) { const qq = new Query(Model, () => { const r = coll.filter((d) => matches(d, q)); return r; }); const exec = qq.exec.bind(qq); qq.exec = async () => { const r = await exec(); return r[0] || null; }; return qq; }
    static findById(i) { return Model.findOne({ _id: String(i) }); }
    static async findByIdAndUpdate(i, upd, o) { const d = coll.find((x) => x._id === String(i)); if (!d) return null; Object.assign(d, clone(upd.$set || upd)); d.updatedAt = new Date().toISOString(); return Model._wrap(d, false); }
    static async findOneAndUpdate(q, upd) { let d = coll.find((x) => matches(x, q)); if (!d) { d = clone({ ...q, _id: String(new ObjectId()), createdAt: new Date().toISOString() }); coll.push(d); } Object.assign(d, clone(upd.$set || upd)); return Model._wrap(d, false); }
    static async updateOne(q, upd) { const d = coll.find((x) => matches(x, q)); if (d) Object.assign(d, clone(upd.$set || upd)); return { modifiedCount: d ? 1 : 0 }; }
    static async updateMany(q, upd) { let n = 0; for (const d of coll) if (matches(d, q)) { Object.assign(d, clone(upd.$set || upd)); n++; } return { modifiedCount: n }; }
    static async deleteMany(q) { let n = 0; for (let i = coll.length - 1; i >= 0; i--) if (matches(coll[i], q)) { coll.splice(i, 1); n++; } return { deletedCount: n }; }
    static async countDocuments(q) { return coll.filter((d) => matches(d, q)).length; }
    static async bulkWrite(ops) { for (const op of ops) { if (op.insertOne) await Model.create(op.insertOne.document); if (op.updateOne) await Model.updateOne(op.updateOne.filter, op.updateOne.update); } return {}; }
    static async aggregate() { return []; }
  }
  Model.modelName = name;
  models[name] = Model;
  return Model;
}
const mongoose = { Schema, model, models, Types: { ObjectId } };
export default mongoose;
export { Schema, model, models };

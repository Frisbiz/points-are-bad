export function createDiscordFirestore(seed = {}) {
  const values = new Map(Object.entries(structuredClone(seed)));
  let queue = Promise.resolve();
  const ref = id => ({ id });
  const snap = r => ({ id: r.id, ref: r, exists: values.has(r.id), data: () => values.has(r.id) ? { value: structuredClone(values.get(r.id)) } : undefined });
  const query = (filters = [], count = Infinity) => ({
    doc: id => ref(id),
    where: (field, op, value) => query([...filters, { field, op, value }], count),
    limit: n => query(filters, n),
    get: async () => ({ docs: [...values.keys()].filter(id => filters.every(f => {
      const value = f.field.split(".").slice(1).reduce((a, k) => a?.[k], values.get(id));
      return f.op === "==" ? value === f.value : value <= f.value;
    })).slice(0, count).map(id => snap(ref(id))) }),
  });
  const db = {
    collection: () => query(),
    batch: () => {
      const deletes = [];
      return { delete: r => deletes.push(r.id), commit: async () => { deletes.forEach(id => values.delete(id)); } };
    },
    runTransaction: callback => {
      const run = queue.then(async () => {
        const changes = [];
        const transaction = {
          get: async r => { if (changes.length) throw new Error("Firestore requires reads before writes"); return snap(r); },
          set: (r, data) => changes.push({ id: r.id, value: structuredClone(data.value) }),
          delete: r => changes.push({ id: r.id, remove: true }),
        };
        const result = await callback(transaction);
        for (const c of changes) { if (c.remove) values.delete(c.id); else values.set(c.id, c.value); }
        return result;
      });
      queue = run.catch(() => {});
      return run;
    },
  };
  return { db, values };
}

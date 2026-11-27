class Queue { constructor() {} async add(n, d, o) { return { id: o?.jobId }; } }
class Worker { constructor() {} on() {} }
export default { Queue, Worker };

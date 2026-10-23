// after() runs work once the response is sent; in tests, run it straight away.
export function after(task) {
  Promise.resolve()
    .then(() => (typeof task === "function" ? task() : task))
    .catch(() => {});
}

// The spike's page: connects to the host with the token the shell gave it and lists each item.
const state = document.getElementById("state");
const list = document.getElementById("items");
function show(item) {
  const li = document.createElement("li");
  li.className = item.ok ? "ok" : "fail";
  li.textContent = item.id + (item.ms !== undefined ? ` (${item.ms} ms)` : "");
  const detail = document.createElement("div");
  detail.className = "detail";
  detail.textContent = item.detail;
  li.appendChild(detail);
  list.appendChild(li);
}
if (window.__HOST_ERROR__) {
  state.textContent = "The shell could not start the host: " + window.__HOST_ERROR__;
} else if (!window.__HOST__) {
  state.textContent = "The shell gave the page no host address.";
} else {
  const { port, token } = window.__HOST__;
  const ws = new WebSocket(`ws://127.0.0.1:${port}/seat?token=${token}`);
  ws.onopen = () => {
    state.textContent = `Connected to 127.0.0.1:${port}.`;
    ws.send(JSON.stringify({ type: "page", userAgent: navigator.userAgent }));
  };
  ws.onerror = () => { state.textContent = `The WebSocket to 127.0.0.1:${port} failed.`; };
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "hello") message.items.forEach(show);
    if (message.type === "item") show(message.item);
    if (message.type === "done") state.textContent = (message.all_ok ? "All items work. " : "Some items failed. ") + "Report: " + message.report;
  };
}

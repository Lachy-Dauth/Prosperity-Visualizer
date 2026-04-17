export async function loadDemoLog() {
  const url = new URL("../demo.log", import.meta.url).href;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load demo log: ${res.status}`);
  return res.text();
}

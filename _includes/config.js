async function loadConfig() {
  const response = await fetch('/config.json');
  return await response.json();
}

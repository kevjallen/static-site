async function fetchConfig(path) {
  const response = await fetch(path);

  if (response.status == 200) {
    return await response.json();
  }
}

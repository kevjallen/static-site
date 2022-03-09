async function fetchConfig(path, prop) {
  var configResponse = await fetch(path);

  if (configResponse.status == 200) {
    return (await configResponse.json())[prop];
  }
}

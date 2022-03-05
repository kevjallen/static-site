async function helloMessage() {
  var config = await loadConfig();

  var message = config.helloMessage || 'Welcome to my site!';
  document.getElementById('helloMessage').innerText = message;
}

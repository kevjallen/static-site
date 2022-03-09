async function helloMessage(configPath) {
  var elementId = 'helloMessage';

  var message = await fetchConfig(configPath, elementId) || 'Welcome!';
  
  document.getElementById(elementId).innerText = message;
}

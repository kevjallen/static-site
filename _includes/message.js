async function helloMessage(messageConfig) {
  var config = await fetchConfig(messageConfig);

  var message = config?.helloMessage || 'Welcome!';
  
  document.getElementById('helloMessage').innerText = message;
}

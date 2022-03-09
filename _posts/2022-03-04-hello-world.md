---
layout: single
---
{% if jekyll.environment != 'production' %}
<body onload="helloMessage('/public/config.json');">
{% else %}
<body onload="helloMessage('/config');">
{% endif %}
  <p id="helloMessage"/>
</body>

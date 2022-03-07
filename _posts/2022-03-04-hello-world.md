---
layout: single
---
<script>{% include fetch-config.js %}</script>
<script>{% include message.js %}</script>
{% if jekyll.environment != 'production' %}
<body onload="helloMessage('/config.json');">
{% else %}
<body onload="helloMessage('/config');">
{% endif %}
  <p id="helloMessage"/>
</body>

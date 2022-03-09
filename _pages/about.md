---
layout: single
permalink: about
---
# Hosting this site
{% assign image_files = site.static_files | where: 'image', true %}
{% for file in image_files %}
  {% if file.name == 'platform.png' %}
![Platform]({{ file.path }})
  {% endif %}
{% endfor %}

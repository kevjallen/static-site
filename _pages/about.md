---
layout: single
permalink: about
---
{% for image_file in site.static_files | where: "image", true %}
  {% if image_file.name == 'platform.png' %}
![Platform]({{ image_file.path }})
  {% endif %}
{% endfor %}
import os
from urllib import request

def handler(event, context):
  application = os.environ['CONFIG_APP']
  environment = os.environ['CONFIG_ENV']
  config = os.environ['CONFIG_NAME']

  config_url = f'http://localhost:2772/applications/{application}'
  config_url += f'/environments/{environment}/configurations/{config}'

  return request.urlopen(config_url).read()

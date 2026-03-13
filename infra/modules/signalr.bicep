@description('Resource name for the SignalR Service')
param name string

@description('Azure region')
param location string

resource signalR 'Microsoft.SignalRService/signalR@2023-02-01' = {
  name: name
  location: location
  sku: {
    name: 'Free_F1'
    tier: 'Free'
    capacity: 1
  }
  kind: 'SignalR'
  properties: {
    features: [
      {
        flag: 'ServiceMode'
        value: 'Serverless'
      }
      {
        flag: 'EnableConnectivityLogs'
        value: 'false'
      }
    ]
    cors: {
      allowedOrigins: [
        'https://buzzin.dotheneedful.dev',
        'https://salmon-coast-0f942d20f.1.azurestaticapps.net',
        'http://localhost:5173'
      ]
    }
    upstream: {}
  }
}

@description('Primary connection string for the SignalR Service')
output connectionString string = signalR.listKeys().primaryConnectionString

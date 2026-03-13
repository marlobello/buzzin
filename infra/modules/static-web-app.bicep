@description('Static Web App resource name')
param name string

@description('Azure region. Free SWA is available only in select regions.')
@allowed([
  'eastus2'
  'centralus'
  'westus2'
  'westeurope'
  'eastasia'
])
param location string

@description('Azure Storage connection string (passed as Function app setting)')
@secure()
param storageConnectionString string

@description('Azure SignalR connection string (passed as Function app setting)')
@secure()
param signalrConnectionString string

@description('GitHub repository owner')
param repoOwner string

@description('GitHub repository name')
param repoName string

resource swa 'Microsoft.Web/staticSites@2023-12-01' = {
  name: name
  location: location
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {
    repositoryUrl: 'https://github.com/${repoOwner}/${repoName}'
    branch: 'main'
    buildProperties: {
      appLocation: '/'
      apiLocation: 'api'
      outputLocation: 'build'
      skipGithubActionWorkflowGeneration: true
    }
    stagingEnvironmentPolicy: 'Disabled'
  }
}

// Inject connection strings as application settings for the managed Functions
resource swaAppSettings 'Microsoft.Web/staticSites/config@2023-12-01' = {
  parent: swa
  name: 'appsettings'
  properties: {
    AZURE_STORAGE_CONNECTION_STRING: storageConnectionString
    AZURE_SIGNALR_CONNECTION_STRING: signalrConnectionString
  }
}

resource swaCustomDomain 'Microsoft.Web/staticSites/customDomains@2023-12-01' = {
  parent: swa
  name: 'buzzin.dotheneedful.dev'
  properties: {}
}

@description('Default hostname of the Static Web App')
output hostname string = swa.properties.defaultHostname

@description('Deployment token for GitHub Actions')
@secure()
output deploymentToken string = swa.listSecrets().properties.apiKey

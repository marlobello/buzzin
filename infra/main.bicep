@description('Environment name (used for resource naming)')
param environment string = 'prod'

@description('Azure region for all resources. SWA only supports certain regions.')
@allowed([
  'eastus2'
  'centralus'
  'westus2'
  'westeurope'
  'eastasia'
])
param location string = 'eastus2'

@description('GitHub repository owner (e.g. marlobello)')
param repoOwner string

@description('GitHub repository name (e.g. buzzin)')
param repoName string = 'buzzin'

var prefix = 'buzzin-${environment}'

// ── Resource Group is managed outside Bicep (created via az group create) ──

module signalr 'modules/signalr.bicep' = {
  name: 'signalr'
  params: {
    name: 'signalr-${prefix}'
    location: location
  }
}

module storage 'modules/storage.bicep' = {
  name: 'storage'
  params: {
    name: 'st${replace(prefix, '-', '')}${uniqueString(resourceGroup().id)}'
    location: location
  }
}

module staticWebApp 'modules/static-web-app.bicep' = {
  name: 'staticWebApp'
  params: {
    name: 'swa-${prefix}'
    location: location
    storageConnectionString: storage.outputs.connectionString
    signalrConnectionString: signalr.outputs.connectionString
    repoOwner: repoOwner
    repoName: repoName
  }
}

// ── Outputs ──────────────────────────────────────────────────────────────

@description('Static Web App hostname')
output swaHostname string = staticWebApp.outputs.hostname

@description('Deployment token — store as AZURE_STATIC_WEB_APPS_API_TOKEN in GitHub secrets')
@secure()
output swaDeploymentToken string = staticWebApp.outputs.deploymentToken

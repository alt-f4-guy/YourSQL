param([ValidateSet('Create','Extract')][string]$Action,[string]$Source,[string]$Destination)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
if($Action -eq 'Create'){
  [IO.Compression.ZipFile]::CreateFromDirectory($Source,$Destination,[IO.Compression.CompressionLevel]::Optimal,$true)
}else{
  [IO.Compression.ZipFile]::ExtractToDirectory($Source,$Destination)
}

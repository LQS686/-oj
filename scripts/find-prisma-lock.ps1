$target = "query_engine-windows.dll.node"
Get-Process node -ErrorAction SilentlyContinue | ForEach-Object {
  $proc = $_
  $proc.Modules | Where-Object { $_.FileName -like "*$target*" } | ForEach-Object {
    Write-Output "PID: $($proc.Id)  Name: $($proc.ProcessName)  Path: $($proc.Path)"
  }
}

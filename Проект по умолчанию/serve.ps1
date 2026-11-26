# Простой локальный веб-сервер на PowerShell (без установки Python/Node)
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$prefix = 'http://localhost:8000/'

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($prefix)
$listener.Start()
Write-Host "Сайт доступен: $prefix"
Start-Process $prefix

function Get-Mime($ext) {
  switch ($ext.ToLowerInvariant()) {
    '.html' { 'text/html; charset=utf-8' }
    '.css'  { 'text/css; charset=utf-8' }
    '.js'   { 'application/javascript; charset=utf-8' }
    '.json' { 'application/json; charset=utf-8' }
    '.svg'  { 'image/svg+xml' }
    '.png'  { 'image/png' }
    '.jpg'  { 'image/jpeg' }
    '.jpeg' { 'image/jpeg' }
    '.webp' { 'image/webp' }
    '.mp4'  { 'video/mp4' }
    '.glb'  { 'model/gltf-binary' }
    '.gltf' { 'model/gltf+json' }
    '.obj'  { 'text/plain; charset=utf-8' }
    '.mtl'  { 'text/plain; charset=utf-8' }
    '.stl'  { 'application/octet-stream' }
    default { 'application/octet-stream' }
  }
}

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $relative = [Uri]::UnescapeDataString($context.Request.Url.AbsolutePath).TrimStart('/')
    if ([string]::IsNullOrWhiteSpace($relative)) { $relative = 'index.html' }
    $full = [IO.Path]::GetFullPath((Join-Path $root ($relative -replace '/', '\')))

    if ($full.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -and [IO.File]::Exists($full)) {
      $bytes = [IO.File]::ReadAllBytes($full)
      $context.Response.ContentType = Get-Mime ([IO.Path]::GetExtension($full))
      $context.Response.ContentLength64 = $bytes.Length
      $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $context.Response.StatusCode = 404
      $msg = [Text.Encoding]::UTF8.GetBytes('Not found')
      $context.Response.OutputStream.Write($msg, 0, $msg.Length)
    }
    $context.Response.Close()
  }
} finally {
  $listener.Stop()
  $listener.Close()
}

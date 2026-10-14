param (
    [int]$Port = 8080
)

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Prefixes.Add("http://127.0.0.1:$Port/")

try {
    $listener.Start()
    Write-Output "HTTP Server running at http://localhost:$Port/ and http://127.0.0.1:$Port/"
} catch {
    Write-Error "Failed to start listener on port $Port : $_"
    exit 1
}

$mime = @{
    ".html"    = "text/html; charset=utf-8"
    ".css"     = "text/css; charset=utf-8"
    ".js"      = "application/javascript; charset=utf-8"
    ".json"    = "application/json; charset=utf-8"
    ".geojson" = "application/geo+json; charset=utf-8"
    ".png"     = "image/png"
    ".jpg"     = "image/jpeg"
    ".jpeg"    = "image/jpeg"
    ".svg"     = "image/svg+xml"
    ".ico"     = "image/x-icon"
}

$baseDir = $PSScriptRoot

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $relPath = $request.Url.LocalPath.TrimStart('/')
        if ([string]::IsNullOrWhiteSpace($relPath)) {
            $relPath = "index.html"
        }

        $filePath = Join-Path $baseDir $relPath

        $response.AddHeader("Access-Control-Allow-Origin", "*")
        $response.AddHeader("Cache-Control", "no-cache")

        if (Test-Path $filePath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            $contentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { "application/octet-stream" }
            $response.ContentType = $contentType

            # Baca file dengan FileShare ReadWrite agar tidak pernah mengunci berkas
            $fs = New-Object System.IO.FileStream($filePath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
            $response.ContentLength64 = $fs.Length

            if ($request.HttpMethod -ne "HEAD") {
                $buffer = New-Object byte[] 65536
                while (($read = $fs.Read($buffer, 0, $buffer.Length)) -gt 0) {
                    $response.OutputStream.Write($buffer, 0, $read)
                }
            }
            $fs.Close()
        } else {
            $response.StatusCode = 404
            $errBytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $relPath")
            $response.ContentLength64 = $errBytes.Length
            if ($request.HttpMethod -ne "HEAD") {
                $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
            }
        }

        $response.Close()
    } catch {
        # Abaikan error client abort dan lanjutkan loop
    }
}

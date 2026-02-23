$dataDir = "C:\Users\codi.f\Project_Memory_MCP\Project-Memory-MCP\data\project_memory_mcp-50e04147a402"
$files = Get-ChildItem $dataDir -Recurse -File
$changed = 0
foreach ($f in $files) {
    $content = [System.IO.File]::ReadAllText($f.FullName)
    $original = $content
    # JSON-escaped backslash variants (\\Users\\User\\)
    $content = $content -replace '(?i)Users\\\\User\\\\Project_Memory_MCP', 'Users\\codi.f\\Project_Memory_MCP'
    # Literal backslash variants (markdown, log files)
    $content = $content -replace '(?i)Users\\User\\Project_Memory_MCP', 'Users\codi.f\Project_Memory_MCP'
    # Forward-slash variants (URIs, normalized paths)
    $content = $content -replace '(?i)Users/User/Project_Memory_MCP', 'Users/codi.f/Project_Memory_MCP'
    # Lowercase forward-slash (registry keys like "c:/users/user/project_memory_mcp")
    $content = $content -creplace 'users/user/project_memory_mcp', 'users/codi.f/project_memory_mcp'
    if ($content -ne $original) {
        [System.IO.File]::WriteAllText($f.FullName, $content)
        $changed++
        Write-Host "  Updated: $($f.FullName.Replace($dataDir, '.'))" -ForegroundColor Green
    }
}
Write-Host "`nDone - $changed file(s) updated" -ForegroundColor Cyan

# 构史模拟器 - 打包脚本
# 将所有文件合并为单个独立 HTML，输出到 build 子目录

$outputDir = Join-Path $PSScriptRoot "build"
if (-not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir | Out-Null
}

# 读取源码
$htmlContent = Get-Content "index.html" -Raw
$cssContent = Get-Content "css\style.css" -Raw
$jsFiles = @(
    "js\ai.js",
    "js\state.js",
    "js\game.js",
    "js\ui.js",
    "js\main.js"
)

# 替换外部 CSS 引用为内联 <style>
$htmlContent = $htmlContent -replace '<link rel="stylesheet" href="css/style.css">', "<style>`n$cssContent`n</style>"

# 替换外部 JS 引用为内联 <script>
$scriptBlock = ''
foreach ($jsFile in $jsFiles) {
    $jsCode = Get-Content $jsFile -Raw
    $scriptBlock += "`n// ===== $jsFile =====`n$jsCode`n"
}
$htmlContent = $htmlContent -replace '<script src="js/main.js"></script>', "<script>`n$scriptBlock`n</script>"

# 移除其他 script 标签（它们已被合并进上面那个）
$htmlContent = $htmlContent -replace '<script src="js/ai.js"></script>', ''
$htmlContent = $htmlContent -replace '<script src="js/state.js"></script>', ''
$htmlContent = $htmlContent -replace '<script src="js/game.js"></script>', ''
$htmlContent = $htmlContent -replace '<script src="js/ui.js"></script>', ''

# 写入输出
$outputPath = "$outputDir\构史模拟器.html"
$htmlContent | Out-File -FilePath $outputPath -Encoding UTF8

Write-Host "✅ 打包完成！" -ForegroundColor Green
Write-Host "   输出: $outputPath" -ForegroundColor Cyan
Write-Host "   大小: $((Get-Item $outputPath).Length / 1KB -as [int]) KB" -ForegroundColor Cyan
Write-Host ""
Write-Host "📋 使用方法：" -ForegroundColor Yellow
Write-Host "   将 build\构史模拟器.html 复制到其他电脑，双击即可运行（需联网和 DeepSeek API Key）"
